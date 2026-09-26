import { describe, expect, it } from 'vitest';
import type { ComponentRecipe } from '../adapters/types';
import { componentReviewDiff, componentSnapshotFingerprint } from './componentReview';

const recipe = (id: string, name: string): ComponentRecipe => ({
    id,
    name,
    rustPath: `ouroboros_ui::atoms::${name}`,
    layer: 'atom',
    fidelity: 'visual-facsimile',
    description: `${name} facsimile`,
    slots: [],
    layout: {
        direction: 'horizontal', width: 180, minHeight: 32,
        gapToken: 'spacing/2', paddingToken: 'spacing/3',
    },
});

describe('component import review', () => {
    it('shows new recipes, explicit refreshes, and stale managed recipes', () => {
        const diff = componentReviewDiff(
            [recipe('button', 'Button'), recipe('badge', 'Badge')],
            [
                { id: 'button', name: 'Renamed button set', signature: 'one' },
                { id: 'removed', name: 'Old recipe', signature: 'two' },
            ],
        );
        expect(diff.added).toEqual(['Badge']);
        expect(diff.changed).toEqual([{
            name: 'Button', mode: 'Recipe', from: 'Renamed button set', to: 'refresh from pinned recipe',
        }]);
        expect(diff.unmanaged).toEqual(['Old recipe']);
    });

    it('fingerprints structure deterministically and detects edits', () => {
        const first = [
            { id: 'button', name: 'Button', signature: '{"width":180}' },
            { id: 'badge', name: 'Badge', signature: '{"width":90}' },
        ];
        expect(componentSnapshotFingerprint(first)).toBe(componentSnapshotFingerprint([...first].reverse()));
        expect(componentSnapshotFingerprint(first)).not.toBe(componentSnapshotFingerprint([
            first[0], { ...first[1], signature: '{"width":100}' },
        ]));
    });

    it('makes an old render schema an explicit migration during review', () => {
        const diff = componentReviewDiff(
            [recipe('button', 'Button')],
            [{ id: 'button', name: 'Button', renderSchema: '1', signature: '{}' }],
            '2',
        );
        expect(diff.changed).toEqual([expect.objectContaining({
            name: 'Button',
            to: 'migrate to render schema 2',
        })]);
    });
});
