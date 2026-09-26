// ─── Figma Variable Manager ──────────────────────────────────────────────────
// Handles creation and management of Figma Variable Collections, Variables,
// and alias resolution between Primitives and Theme collections.

import type { FigmaColor } from './colorUtils';
import { colorsMatch } from './colorUtils';

export const OUROFORGE_NAMESPACE = 'ouroforge';
export const MANAGED_COLLECTION_KEY = 'managedCollection';
export const MANAGED_TOKEN_KEY = 'managedToken';
export const MANAGED_STYLE_KEY = 'managedStyle';

export interface ManagedCollectionMetadata {
    adapterId: string;
    sourceVersion?: string;
    schemaVersion: 1;
}

export interface ManagedTokenMetadata {
    adapterId: string;
    tokenId: string;
    sourcePath?: string;
    schemaVersion: 1;
}

export interface ManagedStyleMetadata {
    adapterId: string;
    kind: 'text' | 'effect';
    /** Stable canonical identity; unlike `name`, this survives user renames. */
    styleId?: string;
    schemaVersion: 1;
}

function readSharedData<T>(node: PluginDataMixin, key: string): T | null {
    try {
        const raw = node.getSharedPluginData(OUROFORGE_NAMESPACE, key);
        return raw ? JSON.parse(raw) as T : null;
    } catch (_error) {
        return null;
    }
}

function writeSharedData(node: PluginDataMixin, key: string, value: unknown): void {
    try {
        node.setSharedPluginData(OUROFORGE_NAMESPACE, key, JSON.stringify(value));
    } catch (_error) {
        // Test doubles and older plugin hosts may not expose shared plugin data.
    }
}

export function markManagedCollection(
    collection: VariableCollection,
    adapterId: string,
    sourceVersion?: string
): void {
    writeSharedData(collection, MANAGED_COLLECTION_KEY, {
        adapterId,
        sourceVersion,
        schemaVersion: 1,
    } satisfies ManagedCollectionMetadata);
}

export function getManagedCollectionMetadata(collection: VariableCollection): ManagedCollectionMetadata | null {
    return readSharedData<ManagedCollectionMetadata>(collection, MANAGED_COLLECTION_KEY);
}

export function getManagedTokenMetadata(variable: Variable): ManagedTokenMetadata | null {
    return readSharedData<ManagedTokenMetadata>(variable, MANAGED_TOKEN_KEY);
}

export function getManagedStyleMetadata(style: BaseStyle): ManagedStyleMetadata | null {
    return readSharedData<ManagedStyleMetadata>(style, MANAGED_STYLE_KEY);
}

function managedStyleId(adapterId: string, kind: ManagedStyleMetadata['kind'], name: string): string {
    return `${adapterId}:${kind}:${name}`;
}

/**
 * Resolve a managed style exclusively by immutable OuroForge identity.
 *
 * Metadata written by early OuroForge builds omitted `styleId`. We migrate one
 * of those styles only when its plugin-owned adapter/kind metadata and its
 * canonical display name both agree. An untagged same-name style is never
 * adopted or modified.
 */
export function findOrCreateManagedStyle<T extends BaseStyle>(
    styles: readonly T[],
    create: () => T,
    name: string,
    adapterId: string,
    kind: ManagedStyleMetadata['kind'],
): T {
    const styleId = managedStyleId(adapterId, kind, name);
    let style = styles.find(candidate => {
        const metadata = getManagedStyleMetadata(candidate);
        return metadata?.adapterId === adapterId
            && metadata.kind === kind
            && metadata.styleId === styleId;
    });

    if (!style) {
        const legacyCandidates = styles.filter(candidate => {
            const metadata = getManagedStyleMetadata(candidate);
            return metadata?.adapterId === adapterId
                && metadata.kind === kind
                && !metadata.styleId
                && candidate.name === name;
        });
        if (legacyCandidates.length === 1) style = legacyCandidates[0];
    }

    if (!style) style = create();
    style.name = name;
    writeSharedData(style, MANAGED_STYLE_KEY, {
        adapterId,
        kind,
        styleId,
        schemaVersion: 1,
    } satisfies ManagedStyleMetadata);
    return style;
}

export function setManagedTokenSource(variable: Variable, sourcePath: string): void {
    const metadata = getManagedTokenMetadata(variable);
    if (!metadata) return;
    writeSharedData(variable, MANAGED_TOKEN_KEY, { ...metadata, sourcePath });
    variable.description = `Ouroboros source: ${sourcePath}`;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CollectionInfo {
    collection: VariableCollection;
    modeIds: Record<string, string>; // e.g. { "Light": "mode-id-1", "Dark": "mode-id-2" }
    /** True when the plan's mode limit prevented creating all requested modes. */
    modeLimited?: boolean;
}

export interface VariableEntry {
    variable: Variable;
    collection: VariableCollection;
}

/**
 * Figma reports the file's pricing-tier mode cap through this documented
 * `addMode` error. Keep this check narrow: treating every `addMode` failure as
 * a plan limit would silently drop Dark values for unrelated API failures.
 */
export function isVariableModeLimitError(error: unknown): boolean {
    return error instanceof Error
        && /\bin addMode:\s*Limited to \d+ modes? only\b/i.test(error.message);
}

// ─── Collection Management ───────────────────────────────────────────────────

/**
 * Find an existing unmanaged collection by name, or a managed collection by
 * adapter identity, then create one when no safe match exists.
 */
export async function findOrCreateCollection(name: string, adapterId?: string): Promise<CollectionInfo> {
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    // A display name is not ownership. Managed imports resolve only the
    // collection carrying their immutable adapter identity; an unmanaged
    // same-name collection remains untouched.
    const existing = adapterId
        ? collections.find((c: VariableCollection) => getManagedCollectionMetadata(c)?.adapterId === adapterId)
        : collections.find((c: VariableCollection) => c.name === name);

    if (existing) {
        if (adapterId) existing.name = name;
        const modeIds: Record<string, string> = {};
        for (const mode of existing.modes) {
            modeIds[mode.name] = mode.modeId;
        }
        return { collection: existing, modeIds };
    }

    const collection = figma.variables.createVariableCollection(name);
    const modeIds: Record<string, string> = {};
    for (const mode of collection.modes) {
        modeIds[mode.name] = mode.modeId;
    }
    return { collection, modeIds };
}

/**
 * Ensure a collection has the required modes (e.g. "Light" and "Dark").
 * Renames the default mode if needed and adds missing modes.
 */
export function ensureModes(
    info: CollectionInfo,
    modeNames: string[]
): CollectionInfo {
    const { collection } = info;
    const modeIds: Record<string, string> = {};

    // Rename existing default mode to the first requested mode name
    if (modeNames.length > 0 && collection.modes.length > 0) {
        const firstMode = collection.modes[0];
        if (firstMode.name !== modeNames[0]) {
            collection.renameMode(firstMode.modeId, modeNames[0]);
        }
        modeIds[modeNames[0]] = firstMode.modeId;
    }

    // Add additional modes. Free/Starter files allow only ONE mode per
    // collection — addMode throws "Limited to 1 modes only". In that case we
    // degrade gracefully: the import continues with the first mode only.
    let modeLimited = false;
    for (let i = 1; i < modeNames.length; i++) {
        const existingMode = collection.modes.find((m: { name: string; modeId: string }) => m.name === modeNames[i]);
        if (existingMode) {
            modeIds[modeNames[i]] = existingMode.modeId;
        } else {
            try {
                const newModeId = collection.addMode(modeNames[i]);
                modeIds[modeNames[i]] = newModeId;
            } catch (error) {
                if (!isVariableModeLimitError(error)) throw error;
                modeLimited = true;
            }
        }
    }

    return { collection, modeIds, modeLimited };
}

// ─── Variable Creation ───────────────────────────────────────────────────────

/**
 * Find an existing variable by name in a collection, or create a new one.
 */
export async function findOrCreateVariable(
    collection: VariableCollection,
    name: string,
    type: VariableResolvedDataType
): Promise<Variable> {
    const allVars = await figma.variables.getLocalVariablesAsync(type);
    const existing = allVars.find((v: Variable) => v.name === name && v.variableCollectionId === collection.id);

    if (existing) return existing;

    return figma.variables.createVariable(name, collection, type);
}

/**
 * Find a variable by immutable OuroForge token identity. Display names are
 * deliberately never used as an ownership fallback: a same-name user variable
 * must remain untouched and a separately managed token is created instead.
 */
export async function findOrCreateManagedVariable(
    collection: VariableCollection,
    name: string,
    type: VariableResolvedDataType,
    adapterId?: string
): Promise<Variable> {
    if (!adapterId) return findOrCreateVariable(collection, name, type);

    const tokenId = `${adapterId}:${name}`;
    const allVars = await figma.variables.getLocalVariablesAsync(type);
    let variable = allVars.find((candidate: Variable) => {
        if (candidate.variableCollectionId !== collection.id) return false;
        const metadata = getManagedTokenMetadata(candidate);
        return metadata?.adapterId === adapterId && metadata.tokenId === tokenId;
    });
    if (!variable) variable = figma.variables.createVariable(name, collection, type);

    variable.name = name;
    const existingMetadata = getManagedTokenMetadata(variable);
    writeSharedData(variable, MANAGED_TOKEN_KEY, {
        adapterId,
        tokenId,
        ...(existingMetadata?.sourcePath ? { sourcePath: existingMetadata.sourcePath } : {}),
        schemaVersion: 1,
    } satisfies ManagedTokenMetadata);
    return variable;
}

/**
 * Create a color variable and set its value for a given mode.
 */
export async function setColorVariable(
    collection: VariableCollection,
    modeId: string,
    name: string,
    color: FigmaColor
): Promise<Variable> {
    const variable = await findOrCreateVariable(collection, name, 'COLOR');
    variable.setValueForMode(modeId, color);
    return variable;
}

/**
 * Create a float variable and set its value for a given mode.
 */
export async function setFloatVariable(
    collection: VariableCollection,
    modeId: string,
    name: string,
    value: number
): Promise<Variable> {
    const variable = await findOrCreateVariable(collection, name, 'FLOAT');
    variable.setValueForMode(modeId, value);
    return variable;
}

/**
 * Create a string variable and set its value for a given mode.
 */
export async function setStringVariable(
    collection: VariableCollection,
    modeId: string,
    name: string,
    value: string
): Promise<Variable> {
    const variable = await findOrCreateVariable(collection, name, 'STRING');
    variable.setValueForMode(modeId, value);
    return variable;
}

/**
 * Attach WEB code syntax (e.g. `var(--primary)`) so Dev Mode shows the CSS token.
 * Safe no-op on API versions without codeSyntax support.
 */
export function setCodeSyntax(variable: Variable, css: string): void {
    try {
        variable.setVariableCodeSyntax('WEB', css);
    } catch (e) {
        // Older typings/plugin API — ignore.
    }
}

/**
 * Set a variable as an alias to another variable for a given mode.
 */
export function setVariableAlias(
    variable: Variable,
    modeId: string,
    target: Variable
): void {
    variable.setValueForMode(modeId, {
        type: 'VARIABLE_ALIAS',
        id: target.id,
    });
}

// ─── Alias Resolution ────────────────────────────────────────────────────────

/**
 * Given a color value, find a matching primitive variable by comparing values.
 * Returns the matching Variable if found, null otherwise.
 */
export function resolveColorAlias(
    color: FigmaColor,
    primitiveVariables: Variable[],
    primitiveModeId: string
): Variable | null {
    for (const pv of primitiveVariables) {
        if (pv.resolvedType !== 'COLOR') continue;
        const val = pv.valuesByMode[primitiveModeId];
        if (
            val &&
            typeof val === 'object' &&
            'r' in val &&
            colorsMatch(val as FigmaColor, color)
        ) {
            return pv;
        }
    }
    return null;
}

/**
 * Given a float value, find a matching primitive variable.
 */
export function resolveFloatAlias(
    value: number,
    primitiveVariables: Variable[],
    primitiveModeId: string,
    tolerance = 0.01
): Variable | null {
    for (const pv of primitiveVariables) {
        if (pv.resolvedType !== 'FLOAT') continue;
        const val = pv.valuesByMode[primitiveModeId];
        if (typeof val === 'number' && Math.abs(val - value) < tolerance) {
            return pv;
        }
    }
    return null;
}

// ─── Batch Variable Lookup ───────────────────────────────────────────────────

/**
 * Get all local variables from a specific collection.
 */
export async function getVariablesInCollection(collectionId: string): Promise<Variable[]> {
    const allVars = await figma.variables.getLocalVariablesAsync();
    return allVars.filter((v: Variable) => v.variableCollectionId === collectionId);
}
