import type {
    ComponentFidelity,
    ComponentLayer,
    ComponentRecipe,
    ComponentSlotRecipe,
    ComponentVariantAxis,
} from './types';

const horizontal = {
    direction: 'horizontal' as const,
    width: 180,
    minHeight: 32,
    gapToken: 'spacing/2',
    paddingToken: 'spacing/3',
    fillToken: 'card',
    borderToken: 'border',
    radiusToken: 'radius/md',
};

const vertical = {
    direction: 'vertical' as const,
    width: 320,
    minHeight: 96,
    gapToken: 'spacing/3',
    paddingToken: 'spacing/4',
    fillToken: 'card',
    borderToken: 'border',
    radiusToken: 'radius/lg',
};

const organism = { ...vertical, width: 480, minHeight: 180, gapToken: 'spacing/4', paddingToken: 'spacing/5' };
const graph = { ...organism, width: 560, minHeight: 280, fillToken: 'background', radiusToken: 'radius/lg' };
const slot = (name: string, kind: ComponentSlotRecipe['kind'], optional = false): ComponentSlotRecipe => ({ name, kind, optional });
const axis = (name: string, values: string[], defaultValue = values[0]): ComponentVariantAxis => ({ name, values, defaultValue });

function recipe(
    layer: ComponentLayer,
    id: string,
    name: string,
    slots: ComponentSlotRecipe[],
    options: {
        fidelity?: ComponentFidelity;
        variants?: ComponentVariantAxis[];
        description?: string;
    } = {},
): ComponentRecipe {
    const layout = layer === 'graph' ? graph : layer === 'organism' ? organism : layer === 'molecule' ? vertical : horizontal;
    return {
        id,
        name,
        rustPath: layer === 'graph' ? `ouroboros_ui::graph::${name}` : `ouroboros_ui::${layer}s::${name}`,
        layer,
        fidelity: options.fidelity || 'visual-facsimile',
        description: options.description || `${name} static design facsimile.`,
        slots,
        variants: options.variants,
        layout,
    };
}

const atoms: ComponentRecipe[] = [
    recipe('atom', 'avatar', 'Avatar', [slot('initials', 'text')], { fidelity: 'behavioral-only', variants: [axis('Size', ['Sm', 'Md', 'Lg'], 'Md')], description: 'Documents Avatar sizing and initials slots; circular image and fallback painting remain Rust behavior.' }),
    recipe('atom', 'badge', 'Badge', [slot('label', 'text')], { variants: [axis('Variant', ['Default', 'Secondary', 'Destructive', 'Outline', 'Ghost', 'Link', 'Success', 'Warning', 'Info'])] }),
    recipe('atom', 'button', 'Button', [slot('leading-icon', 'icon', true), slot('label', 'text')], { variants: [axis('Variant', ['Default', 'Secondary', 'Destructive', 'Outline', 'Ghost', 'Link']), axis('State', ['Default', 'Hover', 'Disabled'])] }),
    recipe('atom', 'checkbox', 'Checkbox', [slot('control', 'control'), slot('label', 'text', true)], { variants: [axis('Checked', ['False', 'True']), axis('State', ['Default', 'Disabled'])] }),
    recipe('atom', 'color-swatch', 'ColorSwatch', [slot('swatch', 'control'), slot('label', 'text', true)], { fidelity: 'behavioral-only', description: 'Documents ColorSwatch anatomy; color-value painting remains Rust behavior.' }),
    recipe('atom', 'divider', 'Divider', [], { fidelity: 'behavioral-only', variants: [axis('Axis', ['Horizontal', 'Vertical'])], description: 'Documents Divider axis variants; hairline and dotted painting remain Rust behavior.' }),
    recipe('atom', 'heading', 'Heading', [slot('content', 'text')], { variants: [axis('Level', ['Display', 'H1', 'H2', 'Heading'], 'H2')] }),
    recipe('atom', 'icon', 'Icon', [slot('glyph', 'icon')], { fidelity: 'behavioral-only', description: 'Documents the Icon slot; the selected glyph and vector path remain Rust behavior.' }),
    recipe('atom', 'input', 'Input', [slot('value', 'text'), slot('trailing', 'icon', true)], { variants: [axis('State', ['Default', 'Focus', 'Disabled'])] }),
    recipe('atom', 'kbd', 'Kbd', [slot('key', 'text')]),
    recipe('atom', 'numeric-field', 'NumericField', [slot('value', 'text'), slot('stepper', 'control')], { variants: [axis('State', ['Default', 'Focus', 'Disabled'])] }),
    recipe('atom', 'progress', 'Progress', [slot('track', 'control')], { fidelity: 'behavioral-only', variants: [axis('Value', ['25', '50', '75'])], description: 'Documents Progress values; proportional indicator painting remains Rust behavior.' }),
    recipe('atom', 'radio', 'Radio', [slot('control', 'control'), slot('label', 'text', true)], { variants: [axis('Selected', ['False', 'True']), axis('State', ['Default', 'Disabled'])] }),
    recipe('atom', 'skeleton', 'Skeleton', [slot('placeholder', 'content')], { fidelity: 'behavioral-only', description: 'Documents the Skeleton placeholder; shimmer painting remains Rust behavior.' }),
    recipe('atom', 'slider', 'Slider', [slot('track', 'control'), slot('thumb', 'control')], { fidelity: 'behavioral-only', variants: [axis('State', ['Default', 'Focus', 'Disabled'])], description: 'Documents Slider states and anatomy; value geometry and dragging remain Rust behavior.' }),
    recipe('atom', 'spinner', 'Spinner', [slot('indicator', 'icon')], { fidelity: 'behavioral-only', description: 'Static keyframe documents the animated Spinner; timing remains Rust behavior.' }),
    recipe('atom', 'splitter-handle', 'SplitterHandle', [slot('grip', 'control')], { fidelity: 'behavioral-only', variants: [axis('Axis', ['Horizontal', 'Vertical'])], description: 'Documents SplitterHandle axes; grip painting and drag response remain Rust behavior.' }),
    recipe('atom', 'surface', 'Surface', [slot('content', 'content')], { variants: [axis('Fill', ['Card', 'Muted', 'Background', 'None']), axis('Border', ['None', 'Default', 'Strong'], 'Default')] }),
    recipe('atom', 'switch', 'Switch', [slot('track', 'control'), slot('label', 'text', true)], { variants: [axis('Checked', ['False', 'True']), axis('State', ['Default', 'Disabled'])] }),
    recipe('atom', 'text', 'Text', [slot('content', 'text')], { variants: [axis('Role', ['Body', 'BodyStrong', 'Label', 'LabelStrong', 'Caption', 'Code', 'Kbd'])] }),
    recipe('atom', 'textarea', 'Textarea', [slot('value', 'text')], { variants: [axis('State', ['Default', 'Focus', 'Disabled'])] }),
    recipe('atom', 'toggle', 'Toggle', [slot('icon', 'icon', true), slot('label', 'text')], { variants: [axis('Pressed', ['False', 'True']), axis('State', ['Default', 'Disabled'])] }),
    recipe('atom', 'tooltip', 'Tooltip', [slot('trigger', 'content'), slot('content', 'text')], { fidelity: 'behavioral-only', description: 'Documents Tooltip trigger and overlay anatomy; hover timing and placement remain Rust behavior.' }),
];

const cells: ComponentRecipe[] = [
    recipe('cell', 'list-item', 'ListItem', [slot('leading', 'icon', true), slot('label', 'text'), slot('trailing', 'action', true)], { variants: [axis('State', ['Default', 'Selected', 'Disabled'])] }),
    recipe('cell', 'menu-item', 'MenuItem', [slot('leading', 'icon', true), slot('label', 'text'), slot('shortcut', 'text', true)], { variants: [axis('State', ['Default', 'Highlighted', 'Disabled'])] }),
    recipe('cell', 'property-row', 'PropertyRow', [slot('label', 'text'), slot('control', 'control')]),
    recipe('cell', 'responsive-row', 'ResponsiveRow', [slot('label', 'text'), slot('content', 'content')], { variants: [axis('Layout', ['Wide', 'Narrow'])] }),
    recipe('cell', 'table-cell', 'TableCell', [slot('content', 'content')], { variants: [axis('Align', ['Start', 'Center', 'End']), axis('Header', ['False', 'True'])] }),
    recipe('cell', 'table-row', 'TableRow', [slot('cells', 'collection')], { variants: [axis('State', ['Default', 'Selected', 'Hover'])] }),
    recipe('cell', 'toolbar-button', 'ToolbarButton', [slot('icon', 'icon'), slot('label', 'text', true)], { variants: [axis('State', ['Default', 'Active', 'Disabled'])] }),
    recipe('cell', 'tree-node', 'TreeNode', [slot('disclosure', 'control'), slot('icon', 'icon', true), slot('label', 'text')], { variants: [axis('Expanded', ['False', 'True']), axis('Selected', ['False', 'True'])] }),
];

const molecules: ComponentRecipe[] = [
    recipe('molecule', 'alert', 'Alert', [slot('icon', 'icon'), slot('title', 'text', true), slot('message', 'text'), slot('action', 'action', true)], { variants: [axis('Variant', ['Info', 'Success', 'Warning', 'Error'])] }),
    recipe('molecule', 'breadcrumb', 'Breadcrumb', [slot('items', 'collection')], { fidelity: 'behavioral-only', description: 'Documents the Breadcrumb collection slot; item and separator composition remain Rust behavior.' }),
    recipe('molecule', 'card', 'Card', [slot('header', 'content', true), slot('content', 'content'), slot('footer', 'content', true)], { variants: [axis('Size', ['Default', 'Sm'])] }),
    recipe('molecule', 'checkbox-card', 'CheckboxCard', [slot('control', 'control'), slot('title', 'text'), slot('description', 'text', true)], { variants: [axis('Checked', ['False', 'True'])] }),
    recipe('molecule', 'collapsible', 'Collapsible', [slot('trigger', 'action'), slot('content', 'content')], { fidelity: 'behavioral-only', variants: [axis('Expanded', ['False', 'True'])], description: 'Documents Collapsible open and closed frames; persistence and animation remain Rust behavior.' }),
    recipe('molecule', 'color-field', 'ColorField', [slot('swatch', 'control'), slot('value', 'control')]),
    recipe('molecule', 'field', 'Field', [slot('label', 'text'), slot('control', 'control'), slot('hint-or-error', 'text', true)], { variants: [axis('Orientation', ['Vertical', 'Horizontal', 'Responsive']), axis('State', ['Default', 'Error'])] }),
    recipe('molecule', 'field-group', 'FieldGroup', [slot('fields', 'collection')]),
    recipe('molecule', 'field-set', 'FieldSet', [slot('legend', 'text', true), slot('fields', 'collection')], { variants: [axis('Legend', ['Hidden', 'Visible'])] }),
    recipe('molecule', 'field-separator', 'FieldSeparator', [slot('label', 'text', true)], { variants: [axis('Label', ['Hidden', 'Visible'])] }),
    recipe('molecule', 'input-group', 'InputGroup', [slot('leading', 'content', true), slot('input', 'control'), slot('trailing', 'content', true)]),
    recipe('molecule', 'radio-card', 'RadioCard', [slot('control', 'control'), slot('title', 'text'), slot('description', 'text', true)], { variants: [axis('Selected', ['False', 'True'])] }),
    recipe('molecule', 'radio-group', 'RadioGroup', [slot('options', 'collection')], { fidelity: 'behavioral-only', description: 'Documents the RadioGroup option slot; selection coordination remains Rust behavior.' }),
    recipe('molecule', 'search-field', 'SearchField', [slot('search-icon', 'icon'), slot('value', 'text'), slot('clear', 'action', true)], { variants: [axis('State', ['Empty', 'Filled', 'Focus'])] }),
    recipe('molecule', 'tabs', 'Tabs', [slot('tabs', 'collection')], { variants: [axis('Variant', ['Container', 'Line'])] }),
    recipe('molecule', 'toggle-group', 'ToggleGroup', [slot('items', 'collection')], { fidelity: 'behavioral-only', description: 'Documents the ToggleGroup item slot; coordinated selection remains Rust behavior.' }),
    recipe('molecule', 'vector-field', 'VectorField', [slot('axes', 'collection')], { fidelity: 'behavioral-only', description: 'Documents the VectorField axis slot; numeric axis behavior remains Rust behavior.' }),
];

const organisms: ComponentRecipe[] = [
    recipe('organism', 'accordion', 'Accordion', [slot('items', 'collection')], { fidelity: 'behavioral-only', variants: [axis('Expanded', ['None', 'Item'])], description: 'Documents Accordion disclosure states; coordinated expansion remains Rust behavior.' }),
    recipe('organism', 'autocomplete', 'Autocomplete', [slot('input', 'control'), slot('results', 'collection')], { fidelity: 'behavioral-only', variants: [axis('State', ['Idle', 'Open', 'Empty'])], description: 'Documents Autocomplete states; filtering, focus, and selection remain Rust behavior.' }),
    recipe('organism', 'dialog', 'Dialog', [slot('title', 'text'), slot('content', 'content'), slot('actions', 'collection')], { fidelity: 'behavioral-only', variants: [axis('State', ['Open', 'Confirming'])], description: 'Documents Dialog chrome and choices; modal focus and results remain Rust behavior.' }),
    recipe('organism', 'dropdown-menu', 'DropdownMenu', [slot('trigger', 'action'), slot('items', 'collection')], { fidelity: 'behavioral-only', variants: [axis('State', ['Closed', 'Open'])], description: 'Documents DropdownMenu states; anchoring and keyboard navigation remain Rust behavior.' }),
    recipe('organism', 'menubar', 'Menubar', [slot('menus', 'collection')], { fidelity: 'behavioral-only', description: 'Documents Menubar anatomy; cross-menu navigation remains Rust behavior.' }),
    recipe('organism', 'panel', 'Panel', [slot('header', 'content', true), slot('body', 'content'), slot('footer', 'content', true)], { variants: [axis('Edge', ['None', 'Left', 'Right', 'Top', 'Bottom'])] }),
    recipe('organism', 'popover', 'Popover', [slot('trigger', 'action'), slot('content', 'content')], { fidelity: 'behavioral-only', variants: [axis('State', ['Closed', 'Open'])], description: 'Documents Popover states; anchoring and dismissal remain Rust behavior.' }),
    recipe('organism', 'select', 'Select', [slot('trigger', 'control'), slot('options', 'collection')], { fidelity: 'behavioral-only', variants: [axis('State', ['Closed', 'Open', 'Disabled'])], description: 'Documents Select states; selection and keyboard behavior remain Rust behavior.' }),
    recipe('organism', 'sidebar', 'Sidebar', [slot('header', 'content', true), slot('navigation', 'collection'), slot('footer', 'content', true)], { variants: [axis('State', ['Expanded', 'Collapsed'])] }),
    recipe('organism', 'splitter', 'Splitter', [slot('primary-panel', 'content'), slot('handle', 'control'), slot('secondary-panel', 'content')], { fidelity: 'behavioral-only', variants: [axis('Axis', ['Horizontal', 'Vertical'])], description: 'Documents Splitter geometry; drag constraints and persistence remain Rust behavior.' }),
    recipe('organism', 'tab-view', 'TabView', [slot('tabs', 'collection'), slot('content', 'content')], { fidelity: 'behavioral-only', description: 'Documents TabView anatomy; tab lifecycle and selection remain Rust behavior.' }),
    recipe('organism', 'table', 'Table', [slot('header', 'collection'), slot('rows', 'collection')], { variants: [axis('Layout', ['Fixed', 'Auto'])] }),
    recipe('organism', 'toast', 'Toast', [slot('icon', 'icon', true), slot('message', 'text'), slot('action', 'action', true)], { fidelity: 'behavioral-only', variants: [axis('State', ['Visible', 'Dismissing'])], description: 'Documents Toast frames; queueing and timeout remain Rust behavior.' }),
    recipe('organism', 'toolbar', 'Toolbar', [slot('items', 'collection')], { variants: [axis('Axis', ['Horizontal', 'Vertical'])] }),
    recipe('organism', 'tree-view', 'TreeView', [slot('nodes', 'collection')], { fidelity: 'behavioral-only', variants: [axis('State', ['Collapsed', 'Expanded'])], description: 'Documents TreeView hierarchy states; traversal and selection remain Rust behavior.' }),
];

const graphs: ComponentRecipe[] = [
    recipe('graph', 'graph-view', 'GraphView', [slot('canvas', 'content'), slot('nodes-and-edges', 'collection'), slot('controls', 'action', true), slot('minimap', 'content', true)], {
        fidelity: 'behavioral-only',
        variants: [axis('Grid', ['On', 'Off']), axis('Controls', ['Off', 'On']), axis('Minimap', ['Off', 'On'])],
        description: 'Documents GraphView canvas options; pan, zoom, selection, edge routing, and viewport state remain Rust behavior.',
    }),
    recipe('graph', 'node-frame', 'NodeFrame', [slot('title', 'text', true), slot('ports', 'collection', true), slot('body', 'content'), slot('appendix', 'text', true)], {
        variants: [axis('Kind', ['Base', 'Placeholder']), axis('Selected', ['False', 'True']), axis('Status', ['None', 'Ok', 'Warning', 'Error', 'Running'])],
        description: 'GraphCtx::node visual frame with NodeFrame chrome, ports, selection, placeholder, and status variants.',
    }),
    recipe('graph', 'node-search', 'NodeSearch', [slot('search-input', 'control'), slot('node-kinds', 'collection')], {
        fidelity: 'behavioral-only',
        variants: [axis('State', ['Closed', 'Open', 'Empty'])],
        description: 'Documents NodeSearch popover states; filtering, anchoring, and selection remain Rust behavior.',
    }),
];

/** Exact public component inventory at the pinned Ouroboros source revision. */
export const OUROBOROS_COMPONENT_RECIPES: readonly ComponentRecipe[] = [
    ...atoms,
    ...cells,
    ...molecules,
    ...organisms,
    ...graphs,
];

export const OUROBOROS_COMPONENT_COVERAGE: Readonly<Record<ComponentLayer, number>> = {
    atom: atoms.length,
    cell: cells.length,
    molecule: molecules.length,
    organism: organisms.length,
    graph: graphs.length,
};
