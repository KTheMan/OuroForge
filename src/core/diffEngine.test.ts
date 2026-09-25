import { describe, expect, it } from 'vitest';
import { diffCollection, snapshotFingerprint, type ExistingVariableSnapshot } from './diffEngine';

describe('diff review integrity', () => {
    it('reports an alias target change even when resolved colors are identical', () => {
        const resolved = { r: 0.1, g: 0.2, b: 0.3, a: 1 };
        const existing: ExistingVariableSnapshot[] = [{
            name: 'primary',
            resolvedType: 'COLOR',
            values: { Light: resolved, Dark: resolved },
            aliases: { Light: 'primitive/teal/300', Dark: 'primitive/teal/300' },
        }];

        const diff = diffCollection('Ouroboros', [{
            name: 'primary',
            light: '#1a334d',
            dark: '#1a334d',
            lightAlias: 'primitive/teal/400',
            darkAlias: 'primitive/teal/300',
        }], existing);

        expect(diff.changed).toEqual([{
            name: 'primary',
            mode: 'Light',
            from: '{primitive/teal/300}',
            to: '{primitive/teal/400}',
        }]);
    });

    it('fingerprints are order-independent but change with values and aliases', () => {
        const first: ExistingVariableSnapshot[] = [
            { name: 'b', resolvedType: 'FLOAT', values: { Dark: 2, Light: 1 } },
            { name: 'a', resolvedType: 'COLOR', values: { Light: null }, aliases: { Light: 'primitive/a' } },
        ];
        const reordered = [first[1], {
            ...first[0],
            values: { Light: 1, Dark: 2 },
        }];
        expect(snapshotFingerprint(first)).toBe(snapshotFingerprint(reordered));

        const changed = structuredClone(first);
        changed[1].aliases = { Light: 'primitive/b' };
        expect(snapshotFingerprint(changed)).not.toBe(snapshotFingerprint(first));
        expect(snapshotFingerprint(null)).toBe('missing');
    });
});
