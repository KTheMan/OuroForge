import type { ComponentRecipe } from '../adapters/types';
import type { CollectionDiff } from './diffEngine';

export interface ManagedComponentSnapshot {
    id: string;
    name: string;
    /** Version of the generator contract that last rendered this component. */
    renderSchema?: string;
    /** Deterministic structural signature produced by the Figma boundary. */
    signature: string;
}

/**
 * Components are regenerated recipe-by-recipe. Existing recipes are therefore
 * shown as refreshes instead of pretending that a layer-level merge is safe.
 */
export function componentReviewDiff(
    recipes: readonly ComponentRecipe[],
    existing: ManagedComponentSnapshot[],
    expectedRenderSchema?: string,
): CollectionDiff {
    const existingById = new Map(existing.map(component => [component.id, component]));
    const recipeIds = new Set(recipes.map(recipe => recipe.id));
    return {
        collectionName: 'Ouroboros Components',
        isNew: existing.length === 0,
        added: recipes.filter(recipe => !existingById.has(recipe.id)).map(recipe => recipe.name),
        changed: recipes
            .filter(recipe => existingById.has(recipe.id))
            .map(recipe => ({
                name: recipe.name,
                mode: 'Recipe',
                from: existingById.get(recipe.id)!.name,
                to: expectedRenderSchema
                    && existingById.get(recipe.id)!.renderSchema !== expectedRenderSchema
                    ? `migrate to render schema ${expectedRenderSchema}`
                    : 'refresh from pinned recipe',
            })),
        unmanaged: existing.filter(component => !recipeIds.has(component.id)).map(component => component.name),
    };
}

/** Fingerprint the exact managed component structure shown during review. */
export function componentSnapshotFingerprint(existing: ManagedComponentSnapshot[]): string {
    return JSON.stringify([...existing].sort((a, b) =>
        a.id.localeCompare(b.id) || a.name.localeCompare(b.name) || a.signature.localeCompare(b.signature)
    ));
}
