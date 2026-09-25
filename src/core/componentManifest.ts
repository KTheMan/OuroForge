import type { ComponentRecipe } from '../adapters/types';
import { OUROBOROS_COMPONENT_RECIPES } from '../adapters/ouroborosComponents';
import type { ManifestComponent, ManifestComponentVariant } from '../contract/manifest';

function variantGeometry(node: ComponentNode): ManifestComponentVariant {
    return {
        key: node.getPluginData('ouroforge:variant') || 'default',
        name: node.name,
        layout: node.layoutMode,
        width: node.width,
        height: node.height,
        itemSpacing: node.itemSpacing,
        padding: {
            top: node.paddingTop,
            right: node.paddingRight,
            bottom: node.paddingBottom,
            left: node.paddingLeft,
        },
    };
}

/** Export every managed variant with its own stable key and auto-layout geometry. */
export function manifestComponentFromNode(
    node: ComponentNode | ComponentSetNode,
    _recipes: readonly ComponentRecipe[] = OUROBOROS_COMPONENT_RECIPES,
): ManifestComponent | undefined {
    const id = node.getPluginData('ouroforge:recipe');
    if (!id) return undefined;
    const variantNodes = node.type === 'COMPONENT_SET'
        ? node.children.filter((child): child is ComponentNode => child.type === 'COMPONENT')
        : [node];
    if (variantNodes.length === 0) return undefined;
    const variants = variantNodes.map(variantGeometry)
        .sort((left, right) => left.key.localeCompare(right.key));
    return {
        id,
        name: node.name,
        rustPath: node.getPluginData('ouroforge:rustPath'),
        fidelity: (node.getPluginData('ouroforge:fidelity') || 'visual-facsimile') as ManifestComponent['fidelity'],
        variants,
    };
}

export function manifestComponentsFromNodes(
    nodes: readonly (ComponentNode | ComponentSetNode)[],
    recipes: readonly ComponentRecipe[] = OUROBOROS_COMPONENT_RECIPES,
): ManifestComponent[] {
    return nodes.flatMap(node => {
        const component = manifestComponentFromNode(node, recipes);
        return component ? [component] : [];
    }).sort((left, right) => left.id.localeCompare(right.id));
}
