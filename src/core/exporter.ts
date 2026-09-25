// ─── Variable Exporter ───────────────────────────────────────────────────────
// Losslessly serializes OuroForge-managed Figma variables. The small legacy
// shape remains accepted so older callers can still export generic collections.

import type { FigmaColor } from './colorUtils';

export type ExportedVariableType = 'COLOR' | 'FLOAT' | 'STRING' | 'BOOLEAN';
export type TokenUnit = 'px' | 'number' | 'opacity' | 'ms' | 's' | 'percent' | 'degree';

export interface ExportedAlias {
    /** Stable slash-separated token path, optionally prefixed by collection. */
    alias: string;
}

export type ExportedValue = FigmaColor | number | string | boolean | null | ExportedAlias;

export interface ExportSource {
    repository?: string;
    revision: string;
    fetchedAt?: string;
}

export interface ExportedVariable {
    name: string;
    type: ExportedVariableType;
    values: Record<string, ExportedValue>;
    /** Required for lossless numeric export. Inferred conservatively for legacy data. */
    unit?: TokenUnit;
    description?: string;
    scopes?: string[];
    codeSyntax?: Record<string, string> | string;
    sourcePath?: string;
    managedBy?: 'ouroforge';
}

export interface ExportedCollection {
    name: string;
    modes: string[];
    variables: ExportedVariable[];
    managedBy?: 'ouroforge';
    adapterId?: string;
    source?: ExportSource;
}

export interface ExportOptions {
    /** Reject unrelated local collections rather than leaking them into an Ouroboros export. */
    managedOnly?: boolean;
    adapterId?: string;
    source?: ExportSource;
}

function isAlias(value: ExportedValue | undefined): value is ExportedAlias {
    return !!value && typeof value === 'object' && 'alias' in value && typeof value.alias === 'string';
}

function colorToHex(c: FigmaColor): string {
    const to255 = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
    const base = `#${to255(c.r)}${to255(c.g)}${to255(c.b)}`;
    return c.a < 1 ? base + to255(c.a) : base;
}

/** Explicit ownership is intentional: a collection merely named Ouroboros is not trusted. */
export function selectManagedOuroborosCollections(
    collections: ExportedCollection[],
    adapterId = 'ouroboros',
): ExportedCollection[] {
    return collections.filter((collection) =>
        collection.managedBy === 'ouroforge' && collection.adapterId === adapterId,
    );
}

function selectedCollections(collections: ExportedCollection[], options?: ExportOptions): ExportedCollection[] {
    return options?.managedOnly
        ? selectManagedOuroborosCollections(collections, options.adapterId || 'ouroboros')
        : collections;
}

export function exportedTokenUnit(variable: ExportedVariable): TokenUnit | undefined {
    if (variable.unit) return variable.unit;
    if (variable.type !== 'FLOAT') return undefined;
    const scopes = variable.scopes || [];
    if (scopes.includes('OPACITY') || variable.name.startsWith('opacity/')) return 'opacity';
    if (variable.name.startsWith('motion/duration/')) return 's';
    if (variable.name.startsWith('duration/')) return 'ms';
    if (scopes.includes('FONT_WEIGHT')) return 'number';
    if (variable.name.includes('tracking/') || scopes.includes('LETTER_SPACING')) return 'px';
    if (scopes.some((scope) => [
        'GAP', 'WIDTH_HEIGHT', 'PARAGRAPH_SPACING', 'CORNER_RADIUS', 'FONT_SIZE',
        'LINE_HEIGHT', 'STROKE_FLOAT', 'EFFECT_FLOAT',
    ].includes(scope))) return 'px';
    // Unknown legacy floats stay unitless rather than receiving a false px claim.
    return 'number';
}

export function exportedDtcgType(variable: ExportedVariable): string {
    if (variable.type === 'COLOR') return 'color';
    if (variable.type === 'BOOLEAN') return 'boolean';
    if (variable.type === 'STRING') return 'string';
    const unit = exportedTokenUnit(variable);
    if (unit === 'px') return 'dimension';
    if (unit === 'ms' || unit === 's') return 'duration';
    return 'number';
}

function dtcgValue(variable: ExportedVariable, value: ExportedValue | undefined): unknown {
    if (value === undefined || value === null) return null;
    if (isAlias(value)) return `{${value.alias}}`;
    if (variable.type === 'COLOR' && typeof value === 'object') return colorToHex(value as FigmaColor);
    const unit = exportedTokenUnit(variable);
    if (variable.type === 'FLOAT' && typeof value === 'number' && (unit === 'px' || unit === 'ms' || unit === 's')) {
        return { value, unit };
    }
    return value;
}

function tokenExtensions(
    variable: ExportedVariable,
    collection: ExportedCollection,
    modes: Record<string, unknown> | undefined,
): Record<string, unknown> {
    const ouroforge: Record<string, unknown> = {};
    if (modes) ouroforge.modes = modes;
    const unit = exportedTokenUnit(variable);
    if (unit) ouroforge.unit = unit;
    if (variable.scopes) ouroforge.scopes = [...variable.scopes];
    if (variable.codeSyntax) {
        ouroforge.codeSyntax = typeof variable.codeSyntax === 'string'
            ? { WEB: variable.codeSyntax }
            : { ...variable.codeSyntax };
    }
    if (variable.sourcePath) ouroforge.sourcePath = variable.sourcePath;
    if (collection.source) ouroforge.source = { ...collection.source };
    return { ouroforge };
}

/**
 * Serialize collections to DTCG JSON. Aliases remain DTCG aliases, numeric
 * values retain their unit, and every mode is preserved under our extension.
 */
export function toDtcg(collections: ExportedCollection[], options?: ExportOptions): string {
    const chosen = selectedCollections(collections, options);
    const doc: Record<string, unknown> = {
        $description: 'Exported from Figma by OuroForge',
    };
    const source = options?.source || chosen.find((collection) => collection.source)?.source;
    if (source) doc.$extensions = { ouroforge: { source: { ...source } } };

    for (const collection of chosen) {
        const group: Record<string, unknown> = {};
        for (const variable of collection.variables) {
            const segments = variable.name.split('/').filter(Boolean);
            if (!segments.length) continue;
            let node = group;
            for (let index = 0; index < segments.length - 1; index++) {
                node[segments[index]] = node[segments[index]] || {};
                node = node[segments[index]] as Record<string, unknown>;
            }
            const firstMode = collection.modes[0];
            const modeValues: Record<string, unknown> = {};
            for (const mode of collection.modes) modeValues[mode] = dtcgValue(variable, variable.values[mode]);
            const token: Record<string, unknown> = {
                $type: exportedDtcgType(variable),
                $value: dtcgValue(variable, variable.values[firstMode]),
                $extensions: tokenExtensions(
                    variable,
                    collection,
                    collection.modes.length > 1 ? modeValues : undefined,
                ),
            };
            if (variable.description) token.$description = variable.description;
            node[segments[segments.length - 1]] = token;
        }
        doc[collection.name] = group;
    }

    return JSON.stringify(doc, null, 2);
}

function cssVariableName(path: string): string {
    return '--' + path.replace(/\//g, '-').replace(/[^\w-]/g, '-').toLowerCase();
}

function cssValue(variable: ExportedVariable, value: ExportedValue): string | null {
    if (value === null) return null;
    if (isAlias(value)) return `var(${cssVariableName(value.alias)})`;
    if (variable.type === 'COLOR' && typeof value === 'object') return colorToHex(value as FigmaColor);
    if (variable.type !== 'FLOAT') return String(value);
    const unit = exportedTokenUnit(variable);
    if (unit === 'px' || unit === 'ms' || unit === 's') return `${value}${unit}`;
    if (unit === 'percent') return `${value}%`;
    if (unit === 'degree') return `${value}deg`;
    return String(value);
}

/** First mode is :root; subsequent modes use a stable data attribute selector. */
export function toCss(collections: ExportedCollection[], options?: ExportOptions): string {
    const lines: string[] = ['/* Exported from Figma by OuroForge */'];

    for (const collection of selectedCollections(collections, options)) {
        lines.push('', `/* ─── ${collection.name} ─── */`);
        const emit = (mode: string, selector: string) => {
            const rows: string[] = [];
            for (const variable of collection.variables) {
                const value = variable.values[mode];
                if (value === null || value === undefined) continue;
                const css = cssValue(variable, value);
                if (css !== null) rows.push(`  ${cssVariableName(variable.name)}: ${css};`);
            }
            if (rows.length) lines.push(`${selector} {`, ...rows, '}');
        };
        collection.modes.forEach((mode, index) => {
            const selector = index === 0
                ? ':root'
                : (mode.toLowerCase() === 'dark' ? '.dark' : `[data-ouroforge-mode="${mode}"]`);
            emit(mode, selector);
        });
    }

    return lines.join('\n');
}
