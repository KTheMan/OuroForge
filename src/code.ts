// ─── OuroForge, Main Thread Entry Point ─────────────────────────────────────
// Runs in Figma's sandbox. Handles messages from the UI and delegates
// to the core engine for variable creation, diff preview and export.

import { resolveAdapters } from './adapters/registry';
import type { AdapterConfig, PrimitiveResult, ThemeResult } from './adapters/types';
import { importPrimitives, importThemeTokens, type ImportOptions } from './core/figmaSync';
import { diffCollection, planFromThemeTokens, snapshotFingerprint, type CollectionDiff, type ExistingVariableSnapshot } from './core/diffEngine';
import { toDtcg, toCss, type ExportedCollection, type ExportedValue } from './core/exporter';
import { toOuroForgeManifest, serializeOuroForgeManifest } from './contract/manifest';
import {
    getManagedCollectionMetadata,
    getManagedTokenMetadata,
    isVariableModeLimitError,
} from './core/variableManager';
import {
    COMPONENT_RENDER_SCHEMA_KEY,
    COMPONENT_RENDER_SCHEMA_VERSION,
    managedComponentsOnPage,
    resolveComponentLibraryPage,
    syncOuroborosComponents,
} from './core/componentSync';
import { OUROBOROS_COMPONENT_RECIPES } from './adapters/ouroborosComponents';
import {
    componentReviewDiff,
    componentSnapshotFingerprint,
    type ManagedComponentSnapshot,
} from './core/componentReview';
import { exportBoundAliases, exportTextStyleBindings, selectManagedFigmaVariables } from './core/figmaExport';
import { manifestComponentsFromNodes } from './core/componentManifest';
import type { UIMessage, ImportPayload, AdapterSource } from './shared/messaging';
import { postToUI } from './shared/messaging';
import type { ParsedTokenSet } from './core/parser';
import { parseColorValue, type FigmaColor } from './core/colorUtils';

// ─── Show UI ─────────────────────────────────────────────────────────────────

figma.showUI(__html__, {
    width: 420,
    height: 640,
    themeColors: true,
    title: 'OuroForge',
});

// ─── Plan capability detection ───────────────────────────────────────────────
// Free/Starter files allow only ONE mode per variable collection. Detect this
// up front so the UI can warn that Dark mode values will be skipped.

async function detectMultiModeSupport(): Promise<boolean> {
    try {
        // If any existing collection already has 2+ modes, the plan supports it.
        const collections = await figma.variables.getLocalVariableCollectionsAsync();
        if (collections.some(c => c.modes.length > 1)) return true;

        // Otherwise probe with a throwaway collection.
        const probe = figma.variables.createVariableCollection('__ouroforge_probe__');
        try {
            probe.addMode('probe');
            return true;
        } catch (error) {
            if (isVariableModeLimitError(error)) return false;
            throw error;
        } finally {
            probe.remove();
        }
    } catch (e) {
        return true; // never block the import on detection failure
    }
}

detectMultiModeSupport().then(multiMode => {
    postToUI({ type: 'CAPABILITIES', multiMode });
});

// ─── Message Handler ─────────────────────────────────────────────────────────

figma.ui.onmessage = function (msg: UIMessage) {
    switch (msg.type) {
        case 'IMPORT_TOKENS':
            handleImport(msg.payload, msg.reviewId).catch(err => {
                postToUI({ type: 'IMPORT_ERROR', error: err instanceof Error ? err.message : 'Import failed' });
            });
            break;

        case 'REQUEST_DIFF':
            handleDiff(msg.payload).catch(err => {
                postToUI({ type: 'DIFF_ERROR', error: err instanceof Error ? err.message : 'Preview failed' });
            });
            break;

        case 'EXPORT_TOKENS':
            handleExport().catch(err => {
                postToUI({ type: 'EXPORT_ERROR', error: err instanceof Error ? err.message : 'Export failed' });
            });
            break;

        case 'CLOSE':
            figma.closePlugin();
            break;
    }
};

// ─── Shared plumbing ─────────────────────────────────────────────────────────

function optionsFromCategories(payload: ImportPayload, collectionName: string): ImportOptions {
    const has = (c: string) => payload.categories.indexOf(c as never) >= 0;
    return {
        collectionName,
        importColors: has('colors'),
        importSpacing: has('spacing'),
        importRadius: has('radius'),
        importShadows: has('shadows'),
        importBlur: has('blur'),
        importTypography: has('typography'),
        importBreakpoints: has('breakpoints'),
        importContainers: has('containers'),
        importFontWeights: has('fontWeights'),
        importTracking: has('tracking'),
        importLeading: has('leading'),
        importMaxWidth: has('maxWidth'),
        importBorderWidth: has('borderWidth'),
        importOpacity: has('opacity'),
        importSkew: has('skew'),
        importMotion: has('motion'),
        importGraph: has('graph'),
        importLayout: has('layout'),
    };
}

function sortedAdapters(payload: ImportPayload) {
    const adapters = resolveAdapters(payload.adapterIds);
    adapters.sort(function (a, b) {
        if (a.id === 'tailwindcss') return -1;
        if (b.id === 'tailwindcss') return 1;
        return 0;
    });
    return adapters;
}

function configFor(payload: ImportPayload, adapterId: string): AdapterConfig | undefined {
    return payload.adapterConfigs ? payload.adapterConfigs[adapterId] : undefined;
}

function payloadIncludesName(payload: ImportPayload, name: string): boolean {
    if (name.startsWith('spacing/')) return payload.categories.includes('spacing');
    if (name.startsWith('radius/')) return payload.categories.includes('radius');
    if (name.startsWith('typography/')) return payload.categories.includes('typography');
    if (name.startsWith('opacity/')) return payload.categories.includes('opacity');
    if (name.startsWith('border/') || name.startsWith('focus/')) return payload.categories.includes('borderWidth');
    if (name.startsWith('layout/breakpoint')) return payload.categories.includes('breakpoints');
    if (name.startsWith('layout/container')) {
        return payload.categories.includes('containers') || payload.categories.includes('maxWidth');
    }
    if (name.startsWith('layout/') || name.startsWith('control/') || name.startsWith('icon/') || name.startsWith('hit/')) {
        return payload.categories.includes('layout');
    }
    if (name.startsWith('motion/')) return payload.categories.includes('motion');
    if (name.startsWith('graph/')) return payload.categories.includes('graph');
    return true;
}

type AdapterResult = PrimitiveResult | ThemeResult;

interface PendingReview {
    id: string;
    payload: string;
    results: Map<string, AdapterResult>;
    snapshots: Array<{ adapterId: string; collectionName: string; fingerprint: string }>;
    componentFingerprint?: string;
}

let pendingReview: PendingReview | null = null;

async function consumeReviewedResults(payload: ImportPayload, reviewId: string): Promise<Map<string, AdapterResult>> {
    const review = pendingReview;
    if (!review || !reviewId || review.id !== reviewId) {
        throw new Error('This import has not been reviewed, or its review has expired. Review changes again.');
    }
    if (review.payload !== JSON.stringify(payload)) {
        throw new Error('Import settings changed after review. Review changes again before applying.');
    }
    // Reserve the one-use review before any asynchronous fingerprint reads so
    // two rapid Apply messages cannot both consume the same approval.
    pendingReview = null;
    for (const snapshot of review.snapshots) {
        const current = await snapshotCollection(snapshot.collectionName, snapshot.adapterId);
        if (snapshotFingerprint(current) !== snapshot.fingerprint) {
            throw new Error(`The Figma collection "${snapshot.collectionName}" changed after review. Review changes again before applying.`);
        }
    }
    if (review.componentFingerprint !== undefined) {
        const currentComponents = await snapshotManagedComponents();
        if (componentSnapshotFingerprint(currentComponents) !== review.componentFingerprint) {
            throw new Error('Managed Ouroboros components changed after review. Review changes again before applying.');
        }
    }
    // The reviewed adapter payloads are reused, so an upstream fetch cannot
    // change between preview and apply.
    return review.results;
}

// ─── Import ──────────────────────────────────────────────────────────────────

async function handleImport(payload: ImportPayload, reviewId: string): Promise<void> {
    const adapters = sortedAdapters(payload);
    const reviewedResults = await consumeReviewedResults(payload, reviewId);
    let totalCreated = 0;
    let modesLimited = false;
    const sources: AdapterSource[] = [];

    postToUI({
        type: 'IMPORT_PROGRESS',
        progress: { current: 0, total: 1, phase: 'Init', message: 'Starting import... This may take a few minutes for large palettes.' },
    });

    for (const adapter of adapters) {
        const result = reviewedResults.get(adapter.id);
        if (!result) throw new Error(`Reviewed adapter result missing for ${adapter.id}. Review changes again.`);
        sources.push({ adapterId: adapter.id, source: result.source });

        if (result.type === 'primitives') {
            const options = optionsFromCategories(payload, adapter.defaultCollectionName);
            await importPrimitives(result.tokens, options, progress => {
                postToUI({ type: 'IMPORT_PROGRESS', progress });
            });
            totalCreated += countPrimitiveTokens(result.tokens);
        } else {
            const themeOptions = {
                ...optionsFromCategories(payload, ''),
                collectionName:
                    adapters.filter(a => a.type === 'theme').length === 1 && payload.collectionName
                        ? payload.collectionName
                        : adapter.defaultCollectionName,
                lightTokens: result.tokens.light,
                darkTokens: result.tokens.dark,
                primitiveCollectionName: adapter.dependencies.includes('tailwindcss')
                    ? (payload.primitiveCollectionName || 'TailwindCSS')
                    : '',
                extras: result.extras,
                adapterId: adapter.id,
                sourceVersion: result.source?.version,
            };
            const info = await importThemeTokens(themeOptions, progress => {
                postToUI({ type: 'IMPORT_PROGRESS', progress });
            });
            if (info.modeLimited) modesLimited = true;
            const allKeys = new Set(
                Object.keys(result.tokens.light).concat(Object.keys(result.tokens.dark))
            );
            totalCreated += allKeys.size;
            if (adapter.id === 'ouroboros' && payload.categories.includes('components')) {
                postToUI({
                    type: 'IMPORT_PROGRESS',
                    progress: { current: 0, total: 1, phase: 'Components', message: 'Building Ouroboros component facsimiles…' },
                });
                const componentResult = await syncOuroborosComponents();
                totalCreated += componentResult.components;
            }
        }
    }

    postToUI({ type: 'IMPORT_COMPLETE', totalCreated, sources, modesLimited });
}

// ─── Diff Preview ────────────────────────────────────────────────────────────

async function snapshotCollection(name: string, adapterId?: string): Promise<ExistingVariableSnapshot[] | null> {
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const collection = adapterId
        ? collections.find(c => getManagedCollectionMetadata(c)?.adapterId === adapterId)
        : collections.find(c => c.name === name);
    if (!collection) return null;

    const allVars = await figma.variables.getLocalVariablesAsync();
    const collectionsById = new Map(collections.map(collection => [collection.id, collection]));
    const variablesById = new Map(allVars.map(variable => [variable.id, variable]));
    const vars = allVars.filter(v => v.variableCollectionId === collection.id);
    const modeNames: Record<string, string> = {};
    for (const m of collection.modes) modeNames[m.modeId] = m.name;

    const resolveValue = (
        value: VariableValue,
        modeName: string,
        visited: Set<string>
    ): FigmaColor | number | string | boolean | null => {
        if (!value || typeof value !== 'object' || !('type' in value) || value.type !== 'VARIABLE_ALIAS') {
            return value as FigmaColor | number | string | boolean;
        }
        if (visited.has(value.id)) return null;
        visited.add(value.id);
        const target = variablesById.get(value.id);
        if (!target) return null;
        const targetCollection = collectionsById.get(target.variableCollectionId);
        const targetMode = targetCollection?.modes.find(mode => mode.name === modeName)
            || targetCollection?.modes[0];
        if (!targetMode) return null;
        const targetValue = target.valuesByMode[targetMode.modeId];
        return targetValue === undefined ? null : resolveValue(targetValue, modeName, visited);
    };

    return vars.map(v => {
        const values: ExistingVariableSnapshot['values'] = {};
        const aliases: NonNullable<ExistingVariableSnapshot['aliases']> = {};
        for (const [modeId, val] of Object.entries(v.valuesByMode)) {
            const modeName = modeNames[modeId] || modeId;
            if (val && typeof val === 'object' && 'type' in val && val.type === 'VARIABLE_ALIAS') {
                const target = variablesById.get(val.id);
                const metadata = target ? getManagedTokenMetadata(target) : null;
                aliases[modeName] = target
                    ? metadata?.tokenId.replace(/^ouroboros:/, '') || target.name
                    : null;
            }
            values[modeName] = resolveValue(val, modeName, new Set([v.id]));
        }
        return { name: v.name, resolvedType: v.resolvedType, values, aliases };
    });
}

function serializable(value: unknown): unknown {
    try {
        return JSON.parse(JSON.stringify(value));
    } catch (_error) {
        return String(value);
    }
}

function componentNodeSignature(node: SceneNode, includePosition = false): unknown {
    const value = node as SceneNode & Record<string, unknown>;
    const canReadPropertyDefinitions = node.type === 'COMPONENT_SET'
        || (node.type === 'COMPONENT' && node.parent?.type !== 'COMPONENT_SET');
    return {
        type: node.type,
        name: node.name,
        ...(includePosition ? { x: value.x, y: value.y } : {}),
        width: value.width,
        height: value.height,
        visible: value.visible,
        opacity: value.opacity,
        layoutMode: value.layoutMode,
        itemSpacing: value.itemSpacing,
        paddingTop: value.paddingTop,
        paddingRight: value.paddingRight,
        paddingBottom: value.paddingBottom,
        paddingLeft: value.paddingLeft,
        cornerRadius: serializable(value.cornerRadius),
        fills: serializable(value.fills),
        strokes: serializable(value.strokes),
        strokeWeight: value.strokeWeight,
        boundVariables: serializable(value.boundVariables),
        characters: value.characters,
        recipe: node.getPluginData('ouroforge:recipe'),
        variant: node.getPluginData('ouroforge:variant'),
        fidelity: node.getPluginData('ouroforge:fidelity'),
        rustPath: node.getPluginData('ouroforge:rustPath'),
        renderSchema: node.getPluginData(COMPONENT_RENDER_SCHEMA_KEY),
        componentPropertyDefinitions: canReadPropertyDefinitions
            ? serializable(node.componentPropertyDefinitions)
            : undefined,
        componentPropertyReferences: serializable(node.componentPropertyReferences),
        children: 'children' in node
            ? node.children.map(child => componentNodeSignature(child, true))
            : [],
    };
}

async function snapshotManagedComponents(): Promise<ManagedComponentSnapshot[]> {
    const page = await resolveComponentLibraryPage(false);
    const nodes = page ? managedComponentsOnPage(page) : [];
    return nodes.flatMap(node => {
        const id = node.getPluginData('ouroforge:recipe');
        return id ? [{
            id,
            name: node.name,
            renderSchema: node.getPluginData(COMPONENT_RENDER_SCHEMA_KEY),
            signature: JSON.stringify(componentNodeSignature(node)),
        }] : [];
    });
}

async function handleDiff(payload: ImportPayload): Promise<void> {
    const adapters = sortedAdapters(payload);
    const diffs: CollectionDiff[] = [];
    const sources: AdapterSource[] = [];
    const results = new Map<string, AdapterResult>();
    const snapshots: PendingReview['snapshots'] = [];
    let componentFingerprint: string | undefined;

    for (const adapter of adapters) {
        const result = await adapter.fetchAndParse(configFor(payload, adapter.id));
        results.set(adapter.id, result);
        sources.push({ adapterId: adapter.id, source: result.source });

        if (result.type === 'theme') {
            const collectionName =
                adapters.filter(a => a.type === 'theme').length === 1 && payload.collectionName
                    ? payload.collectionName
                    : adapter.defaultCollectionName;
            const planned = planFromThemeTokens(result.tokens.light, result.tokens.dark).filter(token => {
                const lightColor = token.light ? parseColorValue(token.light) : null;
                const darkColor = token.dark ? parseColorValue(token.dark) : null;
                if (lightColor || darkColor) return payload.categories.includes('colors');
                if (token.name.includes('radius')) return payload.categories.includes('radius');
                return payload.categories.includes('spacing');
            });
            if (result.extras?.floats) {
                for (const token of result.extras.floats) {
                    if (!payloadIncludesName(payload, token.name)) continue;
                    planned.push({ name: token.name, light: String(token.value), dark: String(token.value) });
                }
            }
            if (result.extras?.strings) {
                for (const token of result.extras.strings) {
                    if (!payloadIncludesName(payload, token.name)) continue;
                    planned.push({ name: token.name, light: token.value, dark: token.value });
                }
            }
            if (result.extras?.stateColors && payload.categories.includes('colors')) {
                for (const token of result.extras.stateColors) {
                    planned.push({ name: token.name, light: token.light, dark: token.dark });
                }
            }
            if (result.extras?.aliases && payload.categories.includes('colors')) {
                const plannedByName = new Map(planned.map(token => [token.name, token]));
                for (const alias of result.extras.aliases) {
                    const token = plannedByName.get(alias.name);
                    if (token) {
                        token.lightAlias = alias.lightTarget;
                        token.darkAlias = alias.darkTarget;
                    } else {
                        planned.push({
                            name: alias.name,
                            lightAlias: alias.lightTarget,
                            darkAlias: alias.darkTarget,
                        });
                    }
                }
            }
            const existing = await snapshotCollection(collectionName, adapter.id);
            snapshots.push({ adapterId: adapter.id, collectionName, fingerprint: snapshotFingerprint(existing) });
            diffs.push(diffCollection(collectionName, planned, existing));
            if (adapter.id === 'ouroboros' && payload.categories.includes('components')) {
                const components = await snapshotManagedComponents();
                componentFingerprint = componentSnapshotFingerprint(components);
                diffs.push(componentReviewDiff(
                    OUROBOROS_COMPONENT_RECIPES,
                    components,
                    COMPONENT_RENDER_SCHEMA_VERSION,
                ));
            }
        } else {
            // Primitive sets are large; diff on color names/values only.
            const collectionName = adapter.defaultCollectionName;
            const planned = result.tokens.colors.map(c => ({
                name: 'colors/' + c.path.join('/'),
                light: c.rawValue,
            }));
            const existing = await snapshotCollection(collectionName, adapter.id);
            snapshots.push({ adapterId: adapter.id, collectionName, fingerprint: snapshotFingerprint(existing) });
            diffs.push(diffCollection(collectionName, planned, existing));
        }
    }

    const reviewId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    pendingReview = { id: reviewId, payload: JSON.stringify(payload), results, snapshots, componentFingerprint };
    postToUI({ type: 'DIFF_RESULT', diffs, sources, reviewId });
}

// ─── Export ──────────────────────────────────────────────────────────────────

async function handleExport(): Promise<void> {
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const managedCollections = collections.filter(collection =>
        getManagedCollectionMetadata(collection)?.adapterId === 'ouroboros'
    );
    if (managedCollections.length === 0) {
        postToUI({
            type: 'EXPORT_ERROR',
            error: 'No OuroForge-managed Ouroboros collection found. Import Ouroboros before exporting.',
        });
        return;
    }
    if (managedCollections.length > 1) {
        postToUI({ type: 'EXPORT_ERROR', error: 'Multiple managed Ouroboros collections found; merge them before exporting.' });
        return;
    }
    const allVars = await figma.variables.getLocalVariablesAsync();
    const variablesById = new Map(allVars.map(variable => [variable.id, variable]));

    const exported: ExportedCollection[] = [];
    for (const collection of managedCollections) {
        const collectionMetadata = getManagedCollectionMetadata(collection)!;
        if (!collectionMetadata.sourceVersion) {
            throw new Error('The managed Ouroboros collection has no pinned source revision. Re-import it before exporting.');
        }
        const modeNames: Record<string, string> = {};
        for (const m of collection.modes) modeNames[m.modeId] = m.name;
        const vars = selectManagedFigmaVariables(allVars, collection.id);
        const managedVariableIds = new Set(vars.map(variable => variable.id));

        exported.push({
            name: collection.name,
            modes: collection.modes.map(m => m.name),
            variables: vars.map(v => {
                const values: Record<string, ExportedValue> = {};
                for (const [modeId, val] of Object.entries(v.valuesByMode)) {
                    const modeName = modeNames[modeId] || modeId;
                    if (val && typeof val === 'object' && 'type' in val && (val as VariableAlias).type === 'VARIABLE_ALIAS') {
                        const target = variablesById.get((val as VariableAlias).id);
                        const targetMetadata = target ? getManagedTokenMetadata(target) : null;
                        if (!target || !managedVariableIds.has(target.id) || targetMetadata?.adapterId !== 'ouroboros') {
                            throw new Error(`Managed token "${v.name}" aliases an unmanaged or missing variable.`);
                        }
                        values[modeName] = {
                            alias: targetMetadata.tokenId.replace(/^ouroboros:/, ''),
                        };
                    } else {
                        values[modeName] = val as FigmaColor | number | string | boolean;
                    }
                }
                const metadata = getManagedTokenMetadata(v);
                return {
                    name: metadata?.tokenId.replace(/^ouroboros:/, '') || v.name,
                    type: v.resolvedType,
                    values,
                    description: v.description,
                    scopes: [...v.scopes],
                    codeSyntax: {
                        ...v.codeSyntax,
                        ...(metadata?.sourcePath ? { RUST: metadata.sourcePath } : {}),
                    },
                    sourcePath: metadata?.sourcePath,
                    managedBy: 'ouroforge' as const,
                };
            }),
            managedBy: 'ouroforge',
            adapterId: collectionMetadata.adapterId,
            source: {
                repository: 'https://github.com/Type-zero-labs/ouroboros-ui',
                revision: collectionMetadata.sourceVersion,
            },
        });
    }

    const isManagedOuroborosStyle = (style: BaseStyle): boolean => {
        try {
            const metadata = JSON.parse(style.getSharedPluginData('ouroforge', 'managedStyle') || '{}') as { adapterId?: string };
            return metadata.adapterId === 'ouroboros';
        } catch (_error) {
            return false;
        }
    };
    const textStyles = (await figma.getLocalTextStylesAsync())
        .filter(isManagedOuroborosStyle)
        .map(style => {
            const bindings = exportTextStyleBindings(style.boundVariables, variablesById);
            return {
                name: style.name,
                fontFamily: style.fontName.family,
                fontStyle: style.fontName.style,
                fontSize: typeof style.fontSize === 'number' ? style.fontSize : 0,
                ...(style.lineHeight.unit === 'PIXELS'
                    ? { lineHeight: style.lineHeight.value }
                    : {}),
                ...(style.letterSpacing.unit === 'PIXELS'
                    ? { letterSpacing: style.letterSpacing.value }
                    : {}),
                ...(bindings ? { bindings } : {}),
            };
        });
    const effectStyles = (await figma.getLocalEffectStylesAsync())
        .filter(isManagedOuroborosStyle)
        .map(style => ({
            name: style.name,
            effects: exportBoundAliases(style.effects, variablesById) as unknown[],
        }));
    const componentPage = await resolveComponentLibraryPage(false);
    const componentNodes = componentPage ? managedComponentsOnPage(componentPage) : [];
    const components = manifestComponentsFromNodes(componentNodes);
    const manifest = toOuroForgeManifest(exported, { textStyles, effectStyles, components });
    postToUI({
        type: 'EXPORT_RESULT',
        json: toDtcg(exported, { managedOnly: true }),
        css: toCss(exported, { managedOnly: true }),
        manifest: serializeOuroForgeManifest(manifest),
    });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function countPrimitiveTokens(tokens: ParsedTokenSet): number {
    return (
        tokens.colors.length +
        tokens.spacing.length +
        tokens.radius.length +
        tokens.shadows.length +
        tokens.blur.length +
        tokens.typography.length +
        tokens.opacity.length +
        tokens.breakpoints.length +
        tokens.containers.length +
        tokens.fontWeights.length +
        tokens.tracking.length +
        tokens.leading.length +
        tokens.maxWidth.length +
        tokens.borderWidth.length +
        tokens.skew.length
    );
}
