// ─── Ouroboros UI Adapter ───────────────────────────────────────────────────
// Mirrors the public core and semantic tokens from Ouroboros UI. The stable
// names here form the round-trip contract: Figma may edit values, while code
// generation can target the matching Rust token or Theme field.

import type { LibraryAdapter, ThemeExtras, ThemeResult, TokenCategory } from './types';

export const OUROBOROS_COMMIT = 'c390d7deffa7955e28b2e3bcb9c22ac0899a261b';

const primitiveColors: Record<string, string> = {
    'primitive/zinc/50': '#fafafa',
    'primitive/zinc/100': '#f4f4f5',
    'primitive/zinc/200': '#e4e4e7',
    'primitive/zinc/300': '#d4d4d8',
    'primitive/zinc/400': '#a1a1aa',
    'primitive/zinc/500': '#71717a',
    'primitive/zinc/600': '#52525b',
    'primitive/zinc/700': '#3f3f46',
    'primitive/zinc/800': '#27272a',
    'primitive/zinc/900': '#18181b',
    'primitive/zinc/950': '#09090b',
    'primitive/teal/200': '#99f6e4',
    'primitive/teal/300': '#5eead4',
    'primitive/teal/400': '#2dd4bf',
    'primitive/teal/500': '#14b8a6',
    'primitive/teal/600': '#0d9488',
    'primitive/green/500': '#22c55e',
    'primitive/red/500': '#ef4444',
    'primitive/amber/500': '#f59e0b',
    'primitive/blue/400': '#60a5fa',
    'primitive/blue/500': '#3b82f6',
};

const lightSemantic: Record<string, string> = {
    background: '#fafafa',
    foreground: '#09090b',
    card: '#fafafa',
    'card-foreground': '#09090b',
    popover: '#fafafa',
    'popover-foreground': '#09090b',
    muted: '#f4f4f5',
    'muted-foreground': '#71717a',
    'disabled-foreground': '#a1a1aa',
    primary: '#2dd4bf',
    'primary-foreground': '#09090b',
    'primary-hover': '#14b8a6',
    secondary: '#f4f4f5',
    'secondary-foreground': '#18181b',
    accent: '#f4f4f5',
    'accent-foreground': '#18181b',
    destructive: '#ef4444',
    'destructive-foreground': '#fafafa',
    border: '#e4e4e7',
    'border-strong': '#d4d4d8',
    input: '#e4e4e7',
    ring: '#2dd4bf',
    'hover-overlay': 'rgba(0, 0, 0, 0.06)',
    'press-overlay': 'rgba(0, 0, 0, 0.12)',
    scrim: 'rgba(0, 0, 0, 0.6)',
    success: '#22c55e',
    'success-bg': 'rgba(34, 197, 94, 0.149)',
    warning: '#f59e0b',
    'warning-bg': 'rgba(245, 158, 11, 0.149)',
    error: '#ef4444',
    'error-bg': 'rgba(239, 68, 68, 0.149)',
    info: '#60a5fa',
    'info-bg': 'rgba(59, 130, 246, 0.149)',
    neutral: '#71717a',
    'neutral-bg': 'rgba(113, 113, 122, 0.149)',
};

const darkSemantic: Record<string, string> = {
    background: '#09090b',
    foreground: '#fafafa',
    card: '#18181b',
    'card-foreground': '#fafafa',
    popover: '#18181b',
    'popover-foreground': '#fafafa',
    muted: '#27272a',
    'muted-foreground': '#a1a1aa',
    'disabled-foreground': '#52525b',
    primary: '#99f6e4',
    'primary-foreground': '#09090b',
    'primary-hover': '#5eead4',
    secondary: '#27272a',
    'secondary-foreground': '#fafafa',
    accent: '#27272a',
    'accent-foreground': '#fafafa',
    destructive: '#ef4444',
    'destructive-foreground': '#fafafa',
    border: '#27272a',
    'border-strong': '#3f3f46',
    input: '#27272a',
    ring: '#5eead4',
    'hover-overlay': 'rgba(255, 255, 255, 0.06)',
    'press-overlay': 'rgba(255, 255, 255, 0.12)',
    scrim: 'rgba(0, 0, 0, 0.6)',
    success: '#22c55e',
    'success-bg': 'rgba(34, 197, 94, 0.149)',
    warning: '#f59e0b',
    'warning-bg': 'rgba(245, 158, 11, 0.149)',
    error: '#ef4444',
    'error-bg': 'rgba(239, 68, 68, 0.149)',
    info: '#60a5fa',
    'info-bg': 'rgba(59, 130, 246, 0.149)',
    neutral: '#71717a',
    'neutral-bg': 'rgba(113, 113, 122, 0.149)',
};

const float = (name: string, value: number, scopes: string[], rustName: string) => ({
    name,
    value,
    scopes,
    codeSyntax: `ouroboros_ui::tokens::core::${rustName}`,
});

const floats: NonNullable<ThemeExtras['floats']> = [
    ...[
        ['0', 0, 'SPACE_0'], ['1', 4, 'SPACE_1'], ['2', 8, 'SPACE_2'],
        ['3', 12, 'SPACE_3'], ['4', 16, 'SPACE_4'], ['5', 20, 'SPACE_5'],
        ['6', 24, 'SPACE_6'], ['8', 32, 'SPACE_8'], ['10', 40, 'SPACE_10'],
        ['12', 48, 'SPACE_12'],
    ].map(([name, value, rust]) => float(`spacing/${name}`, value as number, ['GAP'], rust as string)),
    ...[
        ['none', 0, 'RADIUS_NONE'], ['sm', 4, 'RADIUS_SM'], ['md', 6, 'RADIUS_MD'],
        ['lg', 8, 'RADIUS_LG'], ['xl', 12, 'RADIUS_XL'], ['full', 9999, 'RADIUS_FULL'],
    ].map(([name, value, rust]) => float(`radius/${name}`, value as number, ['CORNER_RADIUS'], rust as string)),
    ...[
        ['xs', 12, 'TEXT_XS'], ['sm', 13, 'TEXT_SM'], ['base', 14, 'TEXT_BASE'],
        ['lg', 16, 'TEXT_LG'], ['xl', 20, 'TEXT_XL'], ['2xl', 24, 'TEXT_2XL'],
        ['3xl', 30, 'TEXT_3XL'],
    ].map(([name, value, rust]) => float(`typography/size/${name}`, value as number, ['FONT_SIZE'], rust as string)),
    ...[
        ['tight', -0.25, 'TRACKING_TIGHT'], ['normal', 0, 'TRACKING_NORMAL'],
        ['sm', 0.4, 'TRACKING_SM'], ['md', 0.6, 'TRACKING_MD'],
        ['lg', 0.8, 'TRACKING_LG'], ['wide', 1, 'TRACKING_WIDE'],
    ].map(([name, value, rust]) => float(`typography/tracking/${name}`, value as number, ['LETTER_SPACING'], rust as string)),
    ...[
        ['sm', 26, 'CONTROL_SM'], ['md', 32, 'CONTROL_MD'], ['lg', 38, 'CONTROL_LG'],
    ].map(([name, value, rust]) => float(`control/${name}`, value as number, ['WIDTH_HEIGHT'], rust as string)),
    ...[
        ['sm', 14, 'ICON_SM'], ['md', 16, 'ICON_MD'], ['lg', 20, 'ICON_LG'], ['xl', 24, 'ICON_XL'],
    ].map(([name, value, rust]) => float(`icon/${name}`, value as number, ['WIDTH_HEIGHT'], rust as string)),
    float('border/thin', 1, ['STROKE_FLOAT'], 'BORDER_THIN'),
    float('border/focus', 2, ['STROKE_FLOAT'], 'BORDER_FOCUS'),
    float('focus/ring-offset', 2, ['WIDTH_HEIGHT'], 'RING_OFFSET'),
    float('hit/minimum', 32, ['WIDTH_HEIGHT'], 'HIT_MIN'),
    float('opacity/disabled', 0.5, ['OPACITY'], 'OPACITY_DISABLED'),
    float('opacity/muted', 0.7, ['OPACITY'], 'OPACITY_MUTED'),
    float('opacity/hover-overlay', 0.06, ['OPACITY'], 'HOVER_OVERLAY'),
    float('opacity/press-overlay', 0.12, ['OPACITY'], 'PRESS_OVERLAY'),
];

const extras: ThemeExtras = {
    floats,
    strings: [
        { name: 'typography/font-sans', value: 'Iosevka Aile', scopes: ['FONT_FAMILY'], codeSyntax: 'ouroboros_ui::theme::typography' },
        { name: 'typography/font-mono', value: 'Iosevka Term', scopes: ['FONT_FAMILY'], codeSyntax: 'ouroboros_ui::theme::typography' },
    ],
    shadows: [
        { name: 'shadow/sm', value: '0 1px 2px 0 rgba(0, 0, 0, 0.239)' },
        { name: 'shadow/md', value: '0 2px 4px 0 rgba(0, 0, 0, 0.322)' },
        { name: 'shadow/lg', value: '0 8px 24px 0 rgba(0, 0, 0, 0.188)' },
    ],
    textStyles: [
        { name: 'ouroboros/display', family: 'Iosevka Aile', fontSize: 30, fontWeight: 700, lineHeight: 36, letterSpacing: 0 },
        { name: 'ouroboros/h1', family: 'Iosevka Aile', fontSize: 24, fontWeight: 600, lineHeight: 28.8, letterSpacing: 0 },
        { name: 'ouroboros/h2', family: 'Iosevka Aile', fontSize: 20, fontWeight: 600, lineHeight: 24, letterSpacing: 0 },
        { name: 'ouroboros/heading', family: 'Iosevka Aile', fontSize: 16, fontWeight: 600, lineHeight: 19.2, letterSpacing: 0.4 },
        { name: 'ouroboros/body', family: 'Iosevka Aile', fontSize: 14, fontWeight: 300, lineHeight: 20.3, letterSpacing: 0.6 },
        { name: 'ouroboros/body-strong', family: 'Iosevka Aile', fontSize: 14, fontWeight: 500, lineHeight: 20.3, letterSpacing: 0.6 },
        { name: 'ouroboros/label', family: 'Iosevka Aile', fontSize: 13, fontWeight: 300, lineHeight: 18.85, letterSpacing: 0.8 },
        { name: 'ouroboros/caption', family: 'Iosevka Aile', fontSize: 12, fontWeight: 400, lineHeight: 17.4, letterSpacing: 1 },
        { name: 'ouroboros/code', family: 'Iosevka Term', fontSize: 13, fontWeight: 400, lineHeight: 18.85, letterSpacing: 0.8 },
    ],
};

export const ouroborosAdapter: LibraryAdapter = {
    id: 'ouroboros',
    name: 'Ouroboros UI',
    description: 'Rust/egui semantic theme, core scale, typography, shadows and control metrics.',
    icon: 'ouroboros',
    repoUrl: 'https://github.com/Type-zero-labs/ouroboros-ui',
    type: 'theme',
    dependencies: [],
    defaultCollectionName: 'Ouroboros',
    categories: ['colors', 'spacing', 'radius', 'shadows', 'typography', 'opacity', 'borderWidth'] as TokenCategory[],

    async fetchAndParse(): Promise<ThemeResult> {
        return {
            type: 'theme',
            tokens: {
                light: { ...primitiveColors, ...lightSemantic },
                dark: { ...primitiveColors, ...darkSemantic },
            },
            source: {
                kind: 'bundled',
                version: OUROBOROS_COMMIT,
            },
            extras,
        };
    },
};
