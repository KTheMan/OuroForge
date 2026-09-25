import type {
    ExportedAlias,
    ExportedCollection,
    ExportedValue,
    ExportOptions,
    ExportSource,
    TokenUnit,
} from '../core/exporter';
import {
    exportedDtcgType,
    exportedTokenUnit,
    selectManagedOuroborosCollections,
} from '../core/exporter';

export const OUROFORGE_MANIFEST_SCHEMA_VERSION = 2 as const;

export type ManifestTokenType = 'color' | 'dimension' | 'duration' | 'number' | 'string' | 'boolean';
export type ManifestValue = string | number | boolean | null | ExportedAlias;

export interface ManifestToken {
    /** Stable slash-separated identity, independent of Figma node ids. */
    path: string;
    type: ManifestTokenType;
    values: Record<string, ManifestValue>;
    unit?: TokenUnit;
    description?: string;
    scopes?: string[];
    codeSyntax?: Record<string, string>;
    sourcePath?: string;
}

export interface ManifestTextStyle {
    name: string;
    fontFamily: string;
    fontStyle: string;
    fontSize: number;
    lineHeight?: number;
    letterSpacing?: number;
    bindings?: Record<string, string>;
}

export interface ManifestEffectStyle {
    name: string;
    effects: unknown[];
}

export interface ManifestComponent {
    id: string;
    name: string;
    rustPath: string;
    fidelity: 'visual-facsimile' | 'behavioral-only';
    variants: ManifestComponentVariant[];
}

/** Per-variant Figma auto-layout geometry preserved for exact write-back. */
export interface ManifestComponentVariant {
    /** Stable semantic key, independent of Figma node ids and display order. */
    key: string;
    /** Figma variant name as displayed in the component set. */
    name: string;
    layout: 'HORIZONTAL' | 'VERTICAL' | 'GRID' | 'NONE';
    width: number;
    height: number;
    itemSpacing: number;
    padding: { top: number; right: number; bottom: number; left: number };
}

export interface OuroForgeManifest {
    schemaVersion: typeof OUROFORGE_MANIFEST_SCHEMA_VERSION;
    kind: 'ouroforge.tokens';
    adapterId: 'ouroboros';
    source: ExportSource;
    collection: {
        name: string;
        modes: string[];
    };
    tokens: ManifestToken[];
    styles?: {
        text: ManifestTextStyle[];
        effects: ManifestEffectStyle[];
    };
    components?: ManifestComponent[];
}

export interface ManifestValidation {
    ok: boolean;
    errors: string[];
    manifest?: OuroForgeManifest;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isAlias(value: unknown): value is ExportedAlias {
    return isRecord(value) && typeof value.alias === 'string' && value.alias.length > 0;
}

function colorToHex(value: Extract<ExportedValue, object>): string {
    if (isAlias(value)) return value.alias;
    const color = value as { r: number; g: number; b: number; a: number };
    const byte = (part: number) => Math.round(part * 255).toString(16).padStart(2, '0');
    const rgb = `#${byte(color.r)}${byte(color.g)}${byte(color.b)}`;
    return color.a < 1 ? rgb + byte(color.a) : rgb;
}

function normalizeValue(value: ExportedValue): ManifestValue {
    if (value === null || typeof value !== 'object') return value;
    if (isAlias(value)) return { alias: value.alias };
    return colorToHex(value);
}

/**
 * Build the versioned write-back contract. Unlike generic DTCG export this
 * always requires explicit OuroForge/Ouroboros ownership and a source revision.
 */
export function toOuroForgeManifest(
    collections: ExportedCollection[],
    options: Pick<ExportOptions, 'source'> & {
        source?: ExportSource;
        textStyles?: ManifestTextStyle[];
        effectStyles?: ManifestEffectStyle[];
        components?: ManifestComponent[];
    } = {},
): OuroForgeManifest {
    const managed = selectManagedOuroborosCollections(collections);
    if (managed.length !== 1) {
        throw new Error(`Expected exactly one managed Ouroboros collection; received ${managed.length}.`);
    }
    const collection = managed[0];
    const source = options.source || collection.source;
    if (!source?.revision) throw new Error('A pinned Ouroboros source revision is required.');

    const manifest: OuroForgeManifest = {
        schemaVersion: OUROFORGE_MANIFEST_SCHEMA_VERSION,
        kind: 'ouroforge.tokens',
        adapterId: 'ouroboros',
        source: { ...source },
        collection: { name: collection.name, modes: [...collection.modes] },
        tokens: collection.variables.map((variable) => ({
            path: variable.name,
            type: exportedDtcgType(variable) as ManifestTokenType,
            values: Object.fromEntries(Object.entries(variable.values).map(([mode, value]) => [mode, normalizeValue(value)])),
            ...(exportedTokenUnit(variable) ? { unit: exportedTokenUnit(variable) } : {}),
            ...(variable.description ? { description: variable.description } : {}),
            ...(variable.scopes ? { scopes: [...variable.scopes] } : {}),
            ...(variable.codeSyntax ? {
                codeSyntax: typeof variable.codeSyntax === 'string'
                    ? { WEB: variable.codeSyntax }
                    : { ...variable.codeSyntax },
            } : {}),
            ...(variable.sourcePath ? { sourcePath: variable.sourcePath } : {}),
        })).sort((left, right) => left.path.localeCompare(right.path)),
        ...(options.textStyles || options.effectStyles ? {
            styles: {
                text: [...(options.textStyles || [])].sort((a, b) => a.name.localeCompare(b.name)),
                effects: [...(options.effectStyles || [])].sort((a, b) => a.name.localeCompare(b.name)),
            },
        } : {}),
        ...(options.components ? {
            components: [...options.components].sort((a, b) => a.id.localeCompare(b.id)),
        } : {}),
    };

    const validation = validateOuroForgeManifest(manifest);
    if (!validation.ok) throw new Error(`Invalid OuroForge manifest:\n${validation.errors.join('\n')}`);
    return manifest;
}

function valueMatchesType(value: unknown, type: ManifestTokenType): boolean {
    if (value === null || isAlias(value)) return true;
    if (type === 'color' || type === 'string') return typeof value === 'string';
    if (type === 'boolean') return typeof value === 'boolean';
    return typeof value === 'number' && Number.isFinite(value);
}

export function validateOuroForgeManifest(input: unknown): ManifestValidation {
    const errors: string[] = [];
    if (!isRecord(input)) return { ok: false, errors: ['Manifest must be a JSON object.'] };
    if (input.schemaVersion !== OUROFORGE_MANIFEST_SCHEMA_VERSION) errors.push('schemaVersion must be 2.');
    if (input.kind !== 'ouroforge.tokens') errors.push('kind must be "ouroforge.tokens".');
    if (input.adapterId !== 'ouroboros') errors.push('adapterId must be "ouroboros".');

    const source = input.source;
    if (!isRecord(source) || typeof source.revision !== 'string' || !source.revision.trim()) {
        errors.push('source.revision must be a non-empty pinned revision.');
    }
    const collection = input.collection;
    const modes = isRecord(collection) && Array.isArray(collection.modes)
        ? collection.modes.filter((mode): mode is string => typeof mode === 'string' && !!mode)
        : [];
    if (!isRecord(collection) || typeof collection.name !== 'string' || !collection.name.trim()) {
        errors.push('collection.name must be a non-empty string.');
    }
    if (!modes.length || modes.length !== (isRecord(collection) && Array.isArray(collection.modes) ? collection.modes.length : 0)) {
        errors.push('collection.modes must contain non-empty strings.');
    }
    if (new Set(modes).size !== modes.length) errors.push('collection.modes must be unique.');

    if (!Array.isArray(input.tokens)) {
        errors.push('tokens must be an array.');
    } else {
        const paths = new Set<string>();
        input.tokens.forEach((candidate, index) => {
            const prefix = `tokens[${index}]`;
            if (!isRecord(candidate)) {
                errors.push(`${prefix} must be an object.`);
                return;
            }
            const path = candidate.path;
            if (typeof path !== 'string' || !path || path.startsWith('/') || path.endsWith('/') || path.includes('..')) {
                errors.push(`${prefix}.path must be a safe slash-separated path.`);
            } else if (paths.has(path)) {
                errors.push(`${prefix}.path duplicates "${path}".`);
            } else paths.add(path);
            const type = candidate.type;
            const allowedTypes: ManifestTokenType[] = ['color', 'dimension', 'duration', 'number', 'string', 'boolean'];
            if (!allowedTypes.includes(type as ManifestTokenType)) errors.push(`${prefix}.type is unsupported.`);
            if (!isRecord(candidate.values)) {
                errors.push(`${prefix}.values must be an object.`);
            } else {
                for (const mode of modes) {
                    if (!(mode in candidate.values)) errors.push(`${prefix}.values is missing mode "${mode}".`);
                    else if (allowedTypes.includes(type as ManifestTokenType) && !valueMatchesType(candidate.values[mode], type as ManifestTokenType)) {
                        errors.push(`${prefix}.values.${mode} does not match ${String(type)}.`);
                    }
                }
                for (const mode of Object.keys(candidate.values)) {
                    if (!modes.includes(mode)) errors.push(`${prefix}.values contains undeclared mode "${mode}".`);
                }
            }
            const unit = candidate.unit;
            const allowedUnits: TokenUnit[] = ['px', 'number', 'opacity', 'ms', 's', 'percent', 'degree'];
            if (unit !== undefined && !allowedUnits.includes(unit as TokenUnit)) errors.push(`${prefix}.unit is unsupported.`);
            if (type === 'dimension' && unit !== 'px') errors.push(`${prefix}.unit must be "px" for a dimension.`);
            if (type === 'duration' && unit !== 'ms' && unit !== 's') errors.push(`${prefix}.unit must be "ms" or "s" for a duration.`);
            if (type === 'number' && (unit === 'px' || unit === 'ms' || unit === 's')) errors.push(`${prefix}.unit conflicts with number type.`);
        });
        const tokensByPath = new Map<string, Record<string, unknown>>();
        for (const token of input.tokens) {
            if (isRecord(token) && typeof token.path === 'string') tokensByPath.set(token.path, token);
        }
        input.tokens.forEach((candidate, index) => {
            if (!isRecord(candidate) || !isRecord(candidate.values)) return;
            for (const mode of modes) {
                const value = candidate.values[mode];
                if (!isAlias(value)) continue;
                const target = tokensByPath.get(value.alias);
                if (!target) {
                    errors.push(`tokens[${index}].values.${mode} references unknown alias "${value.alias}".`);
                } else if (target.type !== candidate.type) {
                    errors.push(`tokens[${index}].values.${mode} aliases incompatible token "${value.alias}".`);
                }
            }
        });
    }

    if (input.styles !== undefined) {
        if (!isRecord(input.styles) || !Array.isArray(input.styles.text) || !Array.isArray(input.styles.effects)) {
            errors.push('styles must contain text and effects arrays.');
        } else {
            input.styles.text.forEach((style, index) => {
                if (!isRecord(style) || typeof style.name !== 'string' || typeof style.fontFamily !== 'string' ||
                    typeof style.fontStyle !== 'string' || typeof style.fontSize !== 'number' ||
                    !Number.isFinite(style.fontSize) ||
                    (style.lineHeight !== undefined &&
                        (typeof style.lineHeight !== 'number' || !Number.isFinite(style.lineHeight))) ||
                    (style.letterSpacing !== undefined &&
                        (typeof style.letterSpacing !== 'number' || !Number.isFinite(style.letterSpacing))) ||
                    (style.bindings !== undefined && (!isRecord(style.bindings) ||
                        Object.values(style.bindings).some(value => typeof value !== 'string' || !value)))) {
                    errors.push(`styles.text[${index}] is invalid.`);
                }
            });
            input.styles.effects.forEach((style, index) => {
                if (!isRecord(style) || typeof style.name !== 'string' || !Array.isArray(style.effects)) {
                    errors.push(`styles.effects[${index}] is invalid.`);
                }
            });
        }
    }
    if (input.components !== undefined) {
        if (!Array.isArray(input.components)) {
            errors.push('components must be an array.');
        } else {
            const componentIds = new Set<string>();
            input.components.forEach((component, index) => {
                if (!isRecord(component) || typeof component.id !== 'string' || !component.id ||
                    typeof component.name !== 'string' || !component.name ||
                    typeof component.rustPath !== 'string' || !component.rustPath ||
                    (component.fidelity !== 'visual-facsimile' && component.fidelity !== 'behavioral-only') ||
                    !Array.isArray(component.variants) || component.variants.length === 0) {
                    errors.push(`components[${index}] is invalid.`);
                } else if (componentIds.has(component.id)) {
                    errors.push(`components[${index}].id duplicates "${component.id}".`);
                } else {
                    componentIds.add(component.id);
                    const variantKeys = new Set<string>();
                    component.variants.forEach((variant, variantIndex) => {
                        const padding = isRecord(variant) && isRecord(variant.padding) ? variant.padding : undefined;
                        if (!isRecord(variant) || typeof variant.key !== 'string' || !variant.key ||
                            typeof variant.name !== 'string' || !variant.name ||
                            !['HORIZONTAL', 'VERTICAL', 'GRID', 'NONE'].includes(String(variant.layout)) ||
                            typeof variant.width !== 'number' || typeof variant.height !== 'number' ||
                            typeof variant.itemSpacing !== 'number' || !padding ||
                            ![variant.width, variant.height, variant.itemSpacing].every(value => Number.isFinite(value)) ||
                            !['top', 'right', 'bottom', 'left'].every(side =>
                                typeof padding[side] === 'number' && Number.isFinite(padding[side])
                            )) {
                            errors.push(`components[${index}].variants[${variantIndex}] is invalid.`);
                        } else if (variantKeys.has(variant.key)) {
                            errors.push(`components[${index}].variants[${variantIndex}].key duplicates "${variant.key}".`);
                        } else variantKeys.add(variant.key);
                    });
                }
            });
        }
    }

    if (errors.length) return { ok: false, errors };
    return { ok: true, errors: [], manifest: input as unknown as OuroForgeManifest };
}

export function serializeOuroForgeManifest(manifest: OuroForgeManifest): string {
    return JSON.stringify(manifest, null, 2) + '\n';
}
