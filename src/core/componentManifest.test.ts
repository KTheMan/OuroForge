import { describe, expect, it } from 'vitest';
import type { ComponentRecipe } from '../adapters/types';
import { manifestComponentFromNode, manifestComponentsFromNodes } from './componentManifest';

function node(type: 'COMPONENT' | 'COMPONENT_SET', name: string, metadata: Record<string, string>, geometry: Partial<ComponentNode> = {}): any {
    return {
        type,
        name,
        children: [],
        layoutMode: 'NONE', width: 999, height: 999, itemSpacing: 99,
        paddingTop: 90, paddingRight: 90, paddingBottom: 90, paddingLeft: 90,
        getPluginData(key: string) { return metadata[key] || ''; },
        ...geometry,
    };
}

const recipe: ComponentRecipe = {
    id: 'button', name: 'Button', rustPath: 'ouroboros_ui::atoms::Button', layer: 'atom',
    fidelity: 'visual-facsimile', description: 'Button', slots: [],
    variants: [
        { name: 'Variant', values: ['Default', 'Ghost'], defaultValue: 'Default' },
        { name: 'State', values: ['Default', 'Hover'], defaultValue: 'Default' },
    ],
    layout: { direction: 'horizontal', width: 180, minHeight: 32, gapToken: 'spacing/2', paddingToken: 'spacing/3' },
};

const metadata = {
    'ouroforge:recipe': 'button',
    'ouroforge:rustPath': 'ouroboros_ui::atoms::Button',
    'ouroforge:fidelity': 'visual-facsimile',
};

describe('component manifest projection', () => {
    it('preserves stable keys and distinct auto-layout geometry for every variant', () => {
        const hover = node('COMPONENT', 'Variant=Default, State=Hover', { 'ouroforge:variant': 'State=Hover, Variant=Default' }, {
            layoutMode: 'HORIZONTAL', width: 182, height: 34, itemSpacing: 7,
            paddingTop: 7, paddingRight: 11, paddingBottom: 7, paddingLeft: 11,
        });
        const defaultVariant = node('COMPONENT', 'Variant=Default, State=Default', { 'ouroforge:variant': 'State=Default, Variant=Default' }, {
            layoutMode: 'HORIZONTAL', width: 180, height: 32, itemSpacing: 8,
            paddingTop: 8, paddingRight: 12, paddingBottom: 8, paddingLeft: 12,
        });
        const set = node('COMPONENT_SET', 'Ouroboros/atoms/Button', metadata);
        set.children = [hover, defaultVariant];

        const exported = manifestComponentFromNode(set, [recipe])!;
        expect(exported.id).toBe('button');
        expect(exported.variants).toEqual([
            {
                key: 'State=Default, Variant=Default', name: 'Variant=Default, State=Default',
                layout: 'HORIZONTAL', width: 180, height: 32, itemSpacing: 8,
                padding: { top: 8, right: 12, bottom: 8, left: 12 },
            },
            {
                key: 'State=Hover, Variant=Default', name: 'Variant=Default, State=Hover',
                layout: 'HORIZONTAL', width: 182, height: 34, itemSpacing: 7,
                padding: { top: 7, right: 11, bottom: 7, left: 11 },
            },
        ]);
    });

    it('falls back deterministically and omits unmanaged or empty sets', () => {
        const ghost = node('COMPONENT', 'Variant=Ghost, State=Hover', {}, { layoutMode: 'VERTICAL', width: 120 });
        const fallback = node('COMPONENT_SET', 'Button', metadata);
        fallback.children = [ghost];
        const unmanaged = node('COMPONENT', 'User component', {});
        const empty = node('COMPONENT_SET', 'Empty', metadata);

        expect(manifestComponentFromNode(fallback, [])?.variants[0].width).toBe(120);
        expect(manifestComponentsFromNodes([unmanaged, empty], [recipe])).toEqual([]);
    });
});
