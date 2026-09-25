import { describe, expect, it } from 'vitest';
import type { ExportedCollection } from '../core/exporter';
import { serializeOuroForgeManifest, toOuroForgeManifest, validateOuroForgeManifest } from './manifest';

const collection: ExportedCollection = {
    name: 'Ouroboros',
    modes: ['Light', 'Dark'],
    managedBy: 'ouroforge',
    adapterId: 'ouroboros',
    source: { revision: 'abc123', repository: 'https://example.test/ouroboros' },
    variables: [
        { name: 'opacity/disabled', type: 'FLOAT', unit: 'opacity', values: { Light: 0.5, Dark: 0.5 }, scopes: ['OPACITY'] },
        { name: 'background', type: 'COLOR', values: { Light: '#fafafa', Dark: '#09090b' }, codeSyntax: { RUST: 'Theme::background' } },
        { name: 'motion/duration/fast', type: 'FLOAT', unit: 'ms', values: { Light: 100, Dark: 100 } },
    ],
};

describe('OuroForge manifest', () => {
    it('is deterministic, typed, and validates', () => {
        const manifest = toOuroForgeManifest([collection]);
        expect(manifest.schemaVersion).toBe(2);
        expect(manifest.tokens.map((token) => token.path)).toEqual([
            'background', 'motion/duration/fast', 'opacity/disabled',
        ]);
        expect(manifest.tokens[1]).toMatchObject({ type: 'duration', unit: 'ms' });
        expect(manifest.tokens[2]).toMatchObject({ type: 'number', unit: 'opacity' });
        expect(validateOuroForgeManifest(manifest)).toMatchObject({ ok: true, errors: [] });
        expect(serializeOuroForgeManifest(manifest)).toBe(JSON.stringify(manifest, null, 2) + '\n');
    });

    it('rejects unowned exports and malformed values', () => {
        expect(() => toOuroForgeManifest([{ ...collection, managedBy: undefined }])).toThrow(/exactly one managed/);
        const manifest = toOuroForgeManifest([collection]);
        const bad = structuredClone(manifest) as unknown as { tokens: Array<{ values: Record<string, unknown> }> };
        bad.tokens[0].values.Dark = 42;
        expect(validateOuroForgeManifest(bad)).toMatchObject({ ok: false });
    });

    it('rejects dangling and type-incompatible aliases', () => {
        const manifest = toOuroForgeManifest([collection]);
        manifest.tokens[0].values.Dark = { alias: 'missing/token' };
        expect(validateOuroForgeManifest(manifest).errors).toContain(
            'tokens[0].values.Dark references unknown alias "missing/token".',
        );

        manifest.tokens[0].values.Dark = { alias: 'opacity/disabled' };
        expect(validateOuroForgeManifest(manifest).errors).toContain(
            'tokens[0].values.Dark aliases incompatible token "opacity/disabled".',
        );
    });

    it('preserves style bindings and validates component metadata', () => {
        const manifest = toOuroForgeManifest([collection], {
            textStyles: [{
                name: 'ouroboros/body',
                fontFamily: 'Iosevka Light',
                fontStyle: 'Regular',
                fontSize: 14,
                bindings: { fontSize: 'typography/size/base' },
            }],
            components: [{
                id: 'button',
                name: 'Ouroboros/atoms/Button',
                rustPath: 'ouroboros_ui::atoms::Button',
                fidelity: 'visual-facsimile',
                variants: [{
                    key: 'Variant=Default', name: 'Variant=Default', layout: 'HORIZONTAL',
                    width: 180, height: 32, itemSpacing: 8,
                    padding: { top: 8, right: 12, bottom: 8, left: 12 },
                }],
            }],
        });
        expect(manifest.styles?.text[0].bindings).toEqual({ fontSize: 'typography/size/base' });
        expect(validateOuroForgeManifest(manifest).ok).toBe(true);

        const duplicateVariant = structuredClone(manifest);
        duplicateVariant.components![0].variants.push(structuredClone(duplicateVariant.components![0].variants[0]));
        expect(validateOuroForgeManifest(duplicateVariant).errors).toContain(
            'components[0].variants[1].key duplicates "Variant=Default".',
        );

        manifest.components![0].rustPath = '';
        expect(validateOuroForgeManifest(manifest).ok).toBe(false);
    });
});
