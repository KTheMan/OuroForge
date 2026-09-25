import { describe, expect, it } from 'vitest';
import type { ExportedCollection } from './exporter';
import { selectManagedOuroborosCollections, toCss, toDtcg } from './exporter';

const source = {
    repository: 'https://github.com/Type-zero-labs/ouroboros-ui',
    revision: 'c390d7deffa7955e28b2e3bcb9c22ac0899a261b',
};

const managed: ExportedCollection = {
    name: 'Ouroboros',
    modes: ['Light', 'Dark'],
    managedBy: 'ouroforge',
    adapterId: 'ouroboros',
    source,
    variables: [
        {
            name: 'primitive/teal/400',
            type: 'COLOR',
            values: {
                Light: { r: 45 / 255, g: 212 / 255, b: 191 / 255, a: 1 },
                Dark: { r: 45 / 255, g: 212 / 255, b: 191 / 255, a: 1 },
            },
        },
        {
            name: 'primary',
            type: 'COLOR',
            values: {
                Light: { alias: 'primitive/teal/400' },
                Dark: { alias: 'primitive/teal/300' },
            },
            scopes: ['ALL_FILLS'],
            codeSyntax: { WEB: 'var(--primary)', RUST: 'ouroboros_ui::theme::Theme::primary' },
            sourcePath: 'src/theme.rs#Theme.primary',
        },
        {
            name: 'spacing/4',
            type: 'FLOAT',
            unit: 'px',
            values: { Light: 16, Dark: 16 },
            scopes: ['GAP'],
        },
        {
            name: 'motion/duration/fast',
            type: 'FLOAT',
            unit: 'ms',
            values: { Light: 100, Dark: 100 },
        },
        {
            name: 'opacity/disabled',
            type: 'FLOAT',
            unit: 'opacity',
            values: { Light: 0.5, Dark: 0.5 },
            scopes: ['OPACITY'],
        },
    ],
};

describe('lossless OuroForge export', () => {
    it('selects only explicitly owned Ouroboros collections', () => {
        const impostor: ExportedCollection = { ...managed, name: 'Ouroboros copy', managedBy: undefined };
        expect(selectManagedOuroborosCollections([impostor, managed])).toEqual([managed]);
        const json = JSON.parse(toDtcg([impostor, managed], { managedOnly: true }));
        expect(json.Ouroboros).toBeDefined();
        expect(json['Ouroboros copy']).toBeUndefined();
    });

    it('preserves units, source metadata, scopes, code syntax, and aliases per mode', () => {
        const doc = JSON.parse(toDtcg([managed], { managedOnly: true }));
        expect(doc.$extensions.ouroforge.source.revision).toBe(source.revision);
        expect(doc.Ouroboros.spacing['4']).toMatchObject({
            $type: 'dimension',
            $value: { value: 16, unit: 'px' },
        });
        expect(doc.Ouroboros.motion.duration.fast).toMatchObject({
            $type: 'duration',
            $value: { value: 100, unit: 'ms' },
        });
        expect(doc.Ouroboros.opacity.disabled).toMatchObject({ $type: 'number', $value: 0.5 });
        expect(doc.Ouroboros.primary.$extensions.ouroforge).toMatchObject({
            modes: { Light: '{primitive/teal/400}', Dark: '{primitive/teal/300}' },
            scopes: ['ALL_FILLS'],
            codeSyntax: {
                WEB: 'var(--primary)',
                RUST: 'ouroboros_ui::theme::Theme::primary',
            },
            sourcePath: 'src/theme.rs#Theme.primary',
        });
    });

    it('does not append px to opacity and emits every mode with mode-correct aliases', () => {
        const css = toCss([managed], { managedOnly: true });
        expect(css).toContain('--spacing-4: 16px;');
        expect(css).toContain('--motion-duration-fast: 100ms;');
        expect(css).toContain('--opacity-disabled: 0.5;');
        expect(css).not.toContain('0.5px');
        expect(css).toContain(':root {');
        expect(css).toContain('.dark {');
        expect(css).toContain('--primary: var(--primitive-teal-400);');
        expect(css).toContain('--primary: var(--primitive-teal-300);');
    });
});
