import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
    OUROBOROS_COMPONENT_COVERAGE,
    OUROBOROS_COMPONENT_RECIPES,
} from './ouroborosComponents';

const expected = {
    atom: [
        'avatar', 'badge', 'button', 'checkbox', 'color-swatch', 'divider', 'heading', 'icon',
        'input', 'kbd', 'numeric-field', 'progress', 'radio', 'skeleton', 'slider', 'spinner',
        'splitter-handle', 'surface', 'switch', 'text', 'textarea', 'toggle', 'tooltip',
    ],
    cell: ['list-item', 'menu-item', 'property-row', 'responsive-row', 'table-cell', 'table-row', 'toolbar-button', 'tree-node'],
    molecule: ['alert', 'breadcrumb', 'card', 'checkbox-card', 'collapsible', 'color-field', 'field', 'field-group', 'field-set', 'field-separator', 'input-group', 'radio-card', 'radio-group', 'search-field', 'tabs', 'toggle-group', 'vector-field'],
    organism: ['accordion', 'autocomplete', 'dialog', 'dropdown-menu', 'menubar', 'panel', 'popover', 'select', 'sidebar', 'splitter', 'tab-view', 'table', 'toast', 'toolbar', 'tree-view'],
    graph: ['graph-view', 'node-frame', 'node-search'],
};

describe('Ouroboros component recipe inventory', () => {
    it('covers every public atom, cell, molecule, organism, and graph renderable exactly once', () => {
        expect(OUROBOROS_COMPONENT_COVERAGE).toEqual({ atom: 23, cell: 8, molecule: 17, organism: 15, graph: 3 });
        expect(OUROBOROS_COMPONENT_RECIPES).toHaveLength(66);
        expect(new Set(OUROBOROS_COMPONENT_RECIPES.map(recipe => recipe.id)).size).toBe(66);
        for (const [layer, ids] of Object.entries(expected)) {
            expect(OUROBOROS_COMPONENT_RECIPES.filter(recipe => recipe.layer === layer).map(recipe => recipe.id)).toEqual(ids);
        }
    });

    it('provides stable Rust paths, layout tokens, slots, and valid variant defaults', () => {
        for (const recipe of OUROBOROS_COMPONENT_RECIPES) {
            expect(recipe.rustPath).toBe(recipe.layer === 'graph'
                ? `ouroboros_ui::graph::${recipe.name}`
                : `ouroboros_ui::${recipe.layer}s::${recipe.name}`);
            expect(recipe.layout.width).toBeGreaterThan(0);
            expect(recipe.layout.minHeight).toBeGreaterThan(0);
            expect(recipe.layout.gapToken).toMatch(/^spacing\//);
            expect(recipe.layout.paddingToken).toMatch(/^spacing\//);
            for (const variant of recipe.variants || []) {
                expect(variant.values).toContain(variant.defaultValue);
                expect(new Set(variant.values).size).toBe(variant.values.length);
            }
        }
    });

    it('marks interaction-only representations explicitly instead of claiming runtime parity', () => {
        const behavioral = OUROBOROS_COMPONENT_RECIPES.filter(recipe => recipe.fidelity === 'behavioral-only');
        expect(behavioral.length).toBeGreaterThanOrEqual(10);
        expect(behavioral.map(recipe => recipe.id)).toEqual(expect.arrayContaining([
            'spinner', 'tooltip', 'collapsible', 'autocomplete', 'dialog', 'dropdown-menu',
            'popover', 'select', 'splitter', 'tab-view', 'toast', 'tree-view',
        ]));
        expect(behavioral.every(recipe => /remain|implemented/i.test(recipe.description))).toBe(true);
    });
});
