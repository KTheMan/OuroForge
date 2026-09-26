import type { ComponentRecipe, ComponentSlotRecipe } from '../adapters/types';
import { OUROBOROS_COMPONENT_RECIPES } from '../adapters/ouroborosComponents';
import { getManagedCollectionMetadata, getManagedTokenMetadata } from './variableManager';

const RECIPE_KEY = 'ouroforge:recipe';
const VARIANT_KEY = 'ouroforge:variant';
const FIDELITY_KEY = 'ouroforge:fidelity';
const RUST_PATH_KEY = 'ouroforge:rustPath';
const COMPONENT_PROPERTIES_KEY = 'ouroforge:componentProperties';
const COMPONENT_LIBRARY_PAGE_KEY = 'ouroforge:componentLibraryPage';
const SLOT_PROVIDER_SET_KEY = 'ouroforge:slotProviderSet';
const SLOT_PROVIDER_KIND_KEY = 'ouroforge:slotProviderKind';
export const OUROBOROS_COMPONENT_LIBRARY_PAGE = 'Ouroboros UI Library';
export const COMPONENT_RENDER_SCHEMA_VERSION = '3';
export const COMPONENT_RENDER_SCHEMA_KEY = 'ouroforge:renderSchema';

type SwappableSlotKind = Exclude<ComponentSlotRecipe['kind'], 'text'>;

const SWAPPABLE_SLOT_KINDS: readonly SwappableSlotKind[] = [
    'icon',
    'control',
    'content',
    'action',
    'collection',
];

export interface ComponentSyncOptions {
    recipes?: readonly ComponentRecipe[];
    /** Remove managed recipes not present in `recipes`; defaults true for the full built-in inventory. */
    pruneRetired?: boolean;
    namePrefix?: string;
    origin?: { x: number; y: number };
    columns?: number;
}

export interface ComponentSyncResult {
    recipes: number;
    components: number;
    componentSets: number;
    created: number;
    updated: number;
    removed: number;
    visualFacsimiles: number;
    behavioralOnly: number;
}

type VariantValues = Record<string, string>;

type TokenIndex = Map<string, Variable>;

type EditablePropertyType = 'TEXT' | 'BOOLEAN' | 'INSTANCE_SWAP';
type EditablePropertyField = 'characters' | 'visible' | 'mainComponent';

interface EditablePropertyBinding {
    id: string;
    name: string;
    type: EditablePropertyType;
    defaultValue: string | boolean;
    node: SceneNode;
    field: EditablePropertyField;
    preferredValues?: InstanceSwapPreferredValue[];
}

interface SlotProviderCatalog {
    set: ComponentSetNode;
    byKind: ReadonlyMap<SwappableSlotKind, ComponentNode>;
    labelPropertyKey: string;
}

export function managedComponentsOnPage(page: PageNode): Array<ComponentNode | ComponentSetNode> {
    return [
        ...page.findAllWithCriteria({ types: ['COMPONENT_SET'] }),
        ...page.findAllWithCriteria({ types: ['COMPONENT'] })
            .filter(component => component.parent?.type !== 'COMPONENT_SET'),
    ].filter(node => !!node.getPluginData(RECIPE_KEY));
}

/**
 * Locate the one page that owns the managed component library. Dynamic-page
 * plugins cannot inspect unloaded pages, so discovery deliberately loads the
 * document before choosing a target. Existing managed content wins over an
 * empty named page. The most complete managed page wins; ties prefer the
 * canonical/tagged page, then document order.
 */
export async function resolveComponentLibraryPage(create = false): Promise<PageNode | null> {
    await figma.loadAllPagesAsync();
    const pages = figma.root.children.filter((node): node is PageNode => node.type === 'PAGE');
    const managedPages = pages
        .map((page, index) => ({
            page,
            index,
            count: managedComponentsOnPage(page).length
                + page.findAllWithCriteria({ types: ['COMPONENT_SET'] })
                    .filter(set => set.getPluginData(SLOT_PROVIDER_SET_KEY) === 'true').length,
        }))
        .filter(candidate => candidate.count > 0)
        .sort((left, right) => {
            if (left.count !== right.count) return right.count - left.count;
            const leftPreferred = left.page.name === OUROBOROS_COMPONENT_LIBRARY_PAGE
                || left.page.getPluginData(COMPONENT_LIBRARY_PAGE_KEY) === 'true';
            const rightPreferred = right.page.name === OUROBOROS_COMPONENT_LIBRARY_PAGE
                || right.page.getPluginData(COMPONENT_LIBRARY_PAGE_KEY) === 'true';
            if (leftPreferred !== rightPreferred) return leftPreferred ? -1 : 1;
            return left.index - right.index;
        });
    if (managedPages[0]) return managedPages[0].page;

    const existing = pages.find(page =>
        page.getPluginData(COMPONENT_LIBRARY_PAGE_KEY) === 'true'
        || page.name === OUROBOROS_COMPONENT_LIBRARY_PAGE);
    if (existing || !create) return existing || null;

    const page = figma.createPage();
    page.name = OUROBOROS_COMPONENT_LIBRARY_PAGE;
    page.setPluginData(COMPONENT_LIBRARY_PAGE_KEY, 'true');
    return page;
}

export interface ResolvedComponentVisual {
    fillToken: string | null;
    foregroundToken: string;
    borderToken: string | null;
    opacity: number;
    opacityToken?: string;
    strokeWeight: number;
    direction: 'horizontal' | 'vertical';
    width: number;
    minHeight: number;
    fontSize: number;
    fontSizeToken?: string;
    fontStyle: 'Regular' | 'Medium' | 'Semi Bold' | 'Bold';
    primaryAxisAlign: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';
    strokeSides?: { top: number; right: number; bottom: number; left: number };
    contentKey?: string;
}

/** Resolve variant semantics without depending on Figma, so state fidelity is testable. */
export function resolveComponentVisual(recipe: ComponentRecipe, values: VariantValues): ResolvedComponentVisual {
    const visual: ResolvedComponentVisual = {
        fillToken: recipe.layout.fillToken || 'card',
        foregroundToken: 'foreground',
        borderToken: recipe.layout.borderToken || 'border',
        opacity: 1,
        strokeWeight: 1,
        direction: recipe.layout.direction,
        width: recipe.layout.width,
        minHeight: recipe.layout.minHeight,
        fontSize: 13,
        fontStyle: 'Regular',
        primaryAxisAlign: 'MIN',
    };

    const variant = values.Variant;
    if (recipe.id === 'button' || recipe.id === 'badge') {
        const isBadge = recipe.id === 'badge';
        const variants: Record<string, [string | null, string, string | null]> = {
            Default: ['primary', 'primary-foreground', isBadge ? null : 'primary'],
            Secondary: ['secondary', 'secondary-foreground', 'border'],
            Destructive: ['destructive', 'destructive-foreground', 'destructive'],
            Outline: [null, 'foreground', 'border-strong'],
            Ghost: [null, 'foreground', null],
            Link: [null, 'primary', null],
            Success: ['success-bg', 'success', 'success'],
            Warning: ['warning-bg', 'warning', 'warning'],
            Info: ['info-bg', 'info', 'info'],
        };
        if (variant && variants[variant]) {
            [visual.fillToken, visual.foregroundToken, visual.borderToken] = variants[variant];
        }
    }
    if (recipe.id === 'alert') {
        const status: Record<string, [string, string, string]> = {
            Info: ['info-bg', 'info', 'info'], Success: ['success-bg', 'success', 'success'],
            Warning: ['warning-bg', 'warning', 'warning'], Error: ['error-bg', 'error', 'error'],
        };
        if (status[variant]) [visual.fillToken, visual.foregroundToken, visual.borderToken] = status[variant];
    }

    const binaryOn = values.Checked === 'True' || values.Selected === 'True' ||
        values.Pressed === 'True' || values.Expanded === 'True';
    if (binaryOn && recipe.id !== 'node-frame') {
        const primaryControl = ['checkbox', 'radio', 'switch'].includes(recipe.id);
        visual.fillToken = primaryControl ? 'primary' : 'accent';
        visual.foregroundToken = primaryControl ? 'primary-foreground' : 'accent-foreground';
        visual.borderToken = primaryControl ? 'primary' : 'ring';
    }
    if (values.State === 'Selected' || values.State === 'Active') {
        visual.fillToken = 'accent';
        visual.foregroundToken = 'accent-foreground';
        visual.borderToken = 'ring';
    }
    if (values.State === 'Hover' || values.State === 'Highlighted') {
        visual.fillToken = recipe.id === 'button' && variant === 'Default' ? 'primary-hover' : 'hover-overlay';
    }
    if (values.State === 'Focus') {
        visual.borderToken = 'ring';
        visual.strokeWeight = 2;
    }
    if (values.State === 'Error' || values.Status === 'Error') {
        visual.fillToken = 'error-bg';
        visual.foregroundToken = 'error';
        visual.borderToken = 'error';
    } else if (values.Status === 'Warning') {
        visual.fillToken = 'warning-bg';
        visual.foregroundToken = 'warning';
        visual.borderToken = 'warning';
    } else if (values.Status === 'Ok') {
        visual.fillToken = 'success-bg';
        visual.foregroundToken = 'success';
        visual.borderToken = 'success';
    } else if (values.Status === 'Running') {
        visual.fillToken = 'info-bg';
        visual.foregroundToken = 'info';
        visual.borderToken = 'info';
    }
    if (values.Selected === 'True') {
        visual.borderToken = 'ring';
        visual.strokeWeight = 2;
    }
    if (values.Kind === 'Placeholder') {
        visual.fillToken = 'muted';
        visual.foregroundToken = 'muted-foreground';
        visual.borderToken = 'border-strong';
    }
    if (values.State === 'Disabled') {
        visual.opacity = 0.5;
        visual.opacityToken = 'opacity/disabled';
        visual.foregroundToken = 'disabled-foreground';
    }

    if (recipe.id === 'surface') {
        const fills: Record<string, string | null> = { Card: 'card', Muted: 'muted', Background: 'background', None: null };
        const borders: Record<string, string | null> = { None: null, Default: 'border', Strong: 'border-strong' };
        visual.fillToken = fills[values.Fill];
        visual.borderToken = borders[values.Border];
    }
    if (values.Axis === 'Vertical') visual.direction = 'vertical';
    if (values.Axis === 'Horizontal') visual.direction = 'horizontal';
    if (recipe.id === 'responsive-row') {
        visual.direction = values.Layout === 'Narrow' ? 'vertical' : 'horizontal';
        visual.width = values.Layout === 'Narrow' ? 240 : 420;
    }
    if (recipe.id === 'field') {
        if (values.Orientation === 'Horizontal') visual.direction = 'horizontal';
        if (values.Orientation === 'Responsive') {
            visual.direction = 'horizontal';
            visual.width = 420;
        }
    }
    if (recipe.id === 'table-cell') {
        visual.primaryAxisAlign = values.Align === 'Center' ? 'CENTER' : values.Align === 'End' ? 'MAX' : 'MIN';
        if (values.Header === 'True') {
            visual.fillToken = 'muted';
            visual.fontStyle = 'Semi Bold';
            visual.contentKey = 'header';
        }
    }
    if (recipe.id === 'tabs') {
        if (variant === 'Line') {
            visual.fillToken = null;
            visual.borderToken = 'primary';
            visual.strokeSides = { top: 0, right: 0, bottom: 2, left: 0 };
        } else {
            visual.fillToken = 'muted';
            visual.borderToken = 'border';
        }
    }
    if (recipe.id === 'panel') {
        const edge = values.Edge;
        visual.strokeSides = {
            top: edge === 'Top' ? 1 : 0,
            right: edge === 'Right' ? 1 : 0,
            bottom: edge === 'Bottom' ? 1 : 0,
            left: edge === 'Left' ? 1 : 0,
        };
        visual.borderToken = edge === 'None' ? null : 'border-strong';
        if (edge === 'Top' || edge === 'Bottom') {
            visual.direction = 'horizontal';
            visual.width = 480;
            visual.minHeight = 160;
        } else if (edge === 'Left' || edge === 'Right') {
            visual.width = 320;
            visual.minHeight = 360;
        }
    }
    if (recipe.id === 'sidebar') {
        visual.width = values.State === 'Collapsed' ? 72 : 320;
        visual.contentKey = values.State;
    }
    if (recipe.id === 'table') {
        visual.width = values.Layout === 'Auto' ? 640 : 480;
        visual.contentKey = values.Layout;
    }
    if (recipe.id === 'search-field') {
        if (values.State === 'Empty') visual.foregroundToken = 'muted-foreground';
        if (values.State === 'Filled') visual.borderToken = 'border-strong';
        visual.contentKey = values.State;
    }
    if (recipe.id === 'field-set') visual.contentKey = values.Legend;
    if (recipe.id === 'field-separator') visual.contentKey = values.Label;
    if (values.Size === 'Sm') {
        visual.width = Math.round(visual.width * 0.8);
        visual.minHeight = Math.round(visual.minHeight * 0.8);
    } else if (values.Size === 'Lg') {
        visual.width = Math.round(visual.width * 1.2);
        visual.minHeight = Math.round(visual.minHeight * 1.2);
    }
    if (recipe.id === 'heading') {
        const sizes: Record<string, [number, string]> = {
            Display: [30, 'typography/size/3xl'], H1: [24, 'typography/size/2xl'],
            H2: [20, 'typography/size/xl'], Heading: [16, 'typography/size/lg'],
        };
        [visual.fontSize, visual.fontSizeToken] = sizes[values.Level] || sizes.H2;
        visual.fontStyle = values.Level === 'Display' ? 'Bold' : 'Semi Bold';
    } else if (recipe.id === 'text') {
        const role = values.Role;
        visual.fontSize = role === 'Caption' || role === 'Kbd' ? 12 : role === 'Label' || role === 'LabelStrong' || role === 'Code' ? 13 : 14;
        visual.fontSizeToken = visual.fontSize === 12 ? 'typography/size/xs' : visual.fontSize === 13 ? 'typography/size/sm' : 'typography/size/base';
        visual.fontStyle = role === 'BodyStrong' || role === 'LabelStrong' ? 'Medium' : role === 'Kbd' ? 'Bold' : 'Regular';
        visual.contentKey = role;
    }
    return visual;
}

function cartesianVariants(recipe: ComponentRecipe): VariantValues[] {
    const axes = recipe.variants || [];
    if (axes.length === 0) return [{}];
    let result: VariantValues[] = [{}];
    for (const axis of axes) {
        const next: VariantValues[] = [];
        for (const partial of result) {
            for (const value of axis.values) next.push({ ...partial, [axis.name]: value });
        }
        result = next;
    }
    return result;
}

function variantKey(values: VariantValues): string {
    return Object.keys(values).sort().map(key => `${key}=${values[key]}`).join(', ');
}

function displayVariantName(recipe: ComponentRecipe, values: VariantValues): string {
    const axes = recipe.variants || [];
    return axes.length === 0 ? recipe.name : axes.map(axis => `${axis.name}=${values[axis.name]}`).join(', ');
}

function normalizeTokenName(name: string): string {
    return name.replace(/^--/, '').replace(/^colors\//, '').toLowerCase();
}

async function buildTokenIndex(): Promise<TokenIndex> {
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const ouroborosCollectionIds = new Set(
        collections
            .filter(collection => getManagedCollectionMetadata(collection)?.adapterId === 'ouroboros')
            .map(collection => collection.id),
    );
    const variables = await figma.variables.getLocalVariablesAsync();
    const index: TokenIndex = new Map();
    for (const variable of variables) {
        const metadata = getManagedTokenMetadata(variable);
        if (!ouroborosCollectionIds.has(variable.variableCollectionId)
            || metadata?.adapterId !== 'ouroboros') continue;
        const prefix = 'ouroboros:';
        if (!metadata.tokenId.startsWith(prefix)) continue;
        // Index the canonical token id rather than its mutable display name so
        // a renamed managed token cannot impersonate a different recipe token.
        const canonicalName = metadata.tokenId.slice(prefix.length);
        index.set(canonicalName.toLowerCase(), variable);
        index.set(normalizeTokenName(canonicalName), variable);
    }
    return index;
}

function token(index: TokenIndex, name: string): Variable | undefined {
    const normalized = normalizeTokenName(name);
    const candidates = [
        name.toLowerCase(),
        normalized,
        `colors/${normalized}`,
        normalized.replace(/^radius\//, 'radius/'),
        normalized.replace(/^spacing\//, 'spacing/'),
    ];
    for (const candidate of candidates) {
        const value = index.get(candidate);
        if (value) return value;
    }
    return undefined;
}

function solidPaint(color: RGB, variable?: Variable): SolidPaint {
    const paint: SolidPaint = { type: 'SOLID', color };
    return variable ? figma.variables.setBoundVariableForPaint(paint, 'color', variable) : paint;
}

function bindFloat(node: SceneNode, field: VariableBindableNodeField, variable?: Variable): void {
    if (variable && variable.resolvedType === 'FLOAT' && 'setBoundVariable' in node) {
        node.setBoundVariable(field, variable);
    }
}

function setPadding(frame: FrameNode | ComponentNode, variable?: Variable): void {
    frame.paddingLeft = 12;
    frame.paddingRight = 12;
    frame.paddingTop = 8;
    frame.paddingBottom = 8;
    bindFloat(frame, 'paddingLeft', variable);
    bindFloat(frame, 'paddingRight', variable);
    bindFloat(frame, 'paddingTop', variable);
    bindFloat(frame, 'paddingBottom', variable);
}

function setGap(frame: FrameNode | ComponentNode, variable?: Variable): void {
    frame.itemSpacing = 8;
    bindFloat(frame, 'itemSpacing', variable);
}

function setRadius(node: ComponentNode | FrameNode, variable?: Variable): void {
    node.cornerRadius = 6;
    bindFloat(node, 'topLeftRadius', variable);
    bindFloat(node, 'topRightRadius', variable);
    bindFloat(node, 'bottomLeftRadius', variable);
    bindFloat(node, 'bottomRightRadius', variable);
}

function removeChildren(node: ComponentNode): void {
    for (const child of [...node.children]) child.remove();
}

async function addText(
    parent: ComponentNode | FrameNode,
    characters: string,
    index: TokenIndex,
    muted = false,
    foregroundToken?: string,
    fontSize = 13,
    fontSizeToken?: string,
    fontStyle: 'Regular' | 'Medium' | 'Semi Bold' | 'Bold' = 'Regular',
): Promise<TextNode> {
    const text = figma.createText();
    text.fontName = { family: 'Inter', style: fontStyle };
    text.characters = characters;
    text.fontSize = fontSize;
    text.fills = [solidPaint(
        muted ? { r: 0.40, g: 0.42, b: 0.46 } : { r: 0.10, g: 0.11, b: 0.13 },
        token(index, foregroundToken || (muted ? 'muted-foreground' : 'foreground')),
    )];
    const sizeVariable = fontSizeToken ? token(index, fontSizeToken) : undefined;
    if (sizeVariable?.resolvedType === 'FLOAT') text.setBoundVariable('fontSize', sizeVariable);
    parent.appendChild(text);
    return text;
}

async function addSlot(
    parent: ComponentNode,
    slotRecipe: ComponentSlotRecipe,
    index: TokenIndex,
): Promise<{ frame: FrameNode; text: TextNode }> {
    const frame = figma.createFrame();
    frame.name = slotRecipe.optional ? `${slotRecipe.name} (optional)` : slotRecipe.name;
    frame.layoutMode = 'HORIZONTAL';
    frame.primaryAxisSizingMode = 'AUTO';
    frame.counterAxisSizingMode = 'AUTO';
    frame.itemSpacing = 4;
    frame.paddingLeft = 6;
    frame.paddingRight = 6;
    frame.paddingTop = 4;
    frame.paddingBottom = 4;
    frame.cornerRadius = slotRecipe.kind === 'control' || slotRecipe.kind === 'icon' ? 6 : 3;
    frame.fills = [solidPaint({ r: 0.94, g: 0.95, b: 0.96 }, token(index, 'muted'))];
    frame.strokes = [solidPaint({ r: 0.82, g: 0.84, b: 0.87 }, token(index, 'border'))];
    frame.strokeWeight = 1;
    frame.strokeAlign = 'INSIDE';
    const text = await addText(frame, slotRecipe.kind === 'icon' ? '◇' : slotRecipe.name, index, true);
    parent.appendChild(frame);
    return { frame, text };
}

function isSwappableSlotKind(kind: ComponentSlotRecipe['kind']): kind is SwappableSlotKind {
    return kind !== 'text';
}

function slotProviderLabel(kind: SwappableSlotKind): string {
    return kind === 'icon' ? '◇' : kind;
}

async function renderSlotProvider(
    component: ComponentNode,
    kind: SwappableSlotKind,
    index: TokenIndex,
): Promise<TextNode> {
    removeChildren(component);
    component.name = `Kind=${propertyLabel(kind)}`;
    component.description = `OuroForge default provider for ${kind} instance-swap slots.`;
    component.setPluginData(SLOT_PROVIDER_KIND_KEY, kind);
    component.setPluginData(COMPONENT_RENDER_SCHEMA_KEY, COMPONENT_RENDER_SCHEMA_VERSION);
    component.layoutMode = 'HORIZONTAL';
    component.primaryAxisSizingMode = 'AUTO';
    component.counterAxisSizingMode = 'AUTO';
    component.itemSpacing = 4;
    component.paddingLeft = 6;
    component.paddingRight = 6;
    component.paddingTop = 4;
    component.paddingBottom = 4;
    component.cornerRadius = kind === 'control' || kind === 'icon' ? 6 : 3;
    component.fills = [solidPaint({ r: 0.94, g: 0.95, b: 0.96 }, token(index, 'muted'))];
    component.strokes = [solidPaint({ r: 0.82, g: 0.84, b: 0.87 }, token(index, 'border'))];
    component.strokeWeight = 1;
    component.strokeAlign = 'INSIDE';
    component.resizeWithoutConstraints(kind === 'icon' ? 28 : 28 + kind.length * 7, 27);
    return addText(component, slotProviderLabel(kind), index, true);
}

function arrangeSlotProviderSet(set: ComponentSetNode, providers: readonly ComponentNode[]): void {
    const padding = 16;
    const gap = 24;
    const cellWidth = Math.max(...providers.map(provider => provider.width));
    const cellHeight = Math.max(...providers.map(provider => provider.height));
    set.layoutMode = 'NONE';
    set.clipsContent = false;
    providers.forEach((provider, index) => {
        provider.x = padding + index * (cellWidth + gap);
        provider.y = padding;
    });
    set.resizeWithoutConstraints(
        padding * 2 + providers.length * cellWidth + Math.max(0, providers.length - 1) * gap,
        padding * 2 + cellHeight,
    );
}

async function ensureSlotProviders(
    page: PageNode,
    prefix: string,
    index: TokenIndex,
    origin: { x: number; y: number },
): Promise<SlotProviderCatalog> {
    const taggedSets = page.findAllWithCriteria({ types: ['COMPONENT_SET'] })
        .filter(set => set.getPluginData(SLOT_PROVIDER_SET_KEY) === 'true');
    let set = taggedSets[0];
    const existingByKind = new Map<SwappableSlotKind, ComponentNode>();
    if (set) {
        for (const child of set.children) {
            if (child.type !== 'COMPONENT') continue;
            const kind = child.getPluginData(SLOT_PROVIDER_KIND_KEY) as SwappableSlotKind;
            if (SWAPPABLE_SLOT_KINDS.includes(kind) && !existingByKind.has(kind)) {
                existingByKind.set(kind, child);
            }
        }
    }

    const providers: ComponentNode[] = [];
    const labels: TextNode[] = [];
    for (const kind of SWAPPABLE_SLOT_KINDS) {
        let provider = existingByKind.get(kind);
        if (!provider) {
            provider = figma.createComponent();
            if (set) set.appendChild(provider);
            else page.appendChild(provider);
        }
        labels.push(await renderSlotProvider(provider, kind, index));
        providers.push(provider);
    }

    if (!set) {
        set = figma.combineAsVariants(providers, page);
        set.x = origin.x;
        set.y = origin.y - 120;
    }
    set.name = `${prefix}/internal/SlotProvider`;
    set.description = 'Managed defaults for OuroForge instance-swap slot properties.';
    set.setPluginData(SLOT_PROVIDER_SET_KEY, 'true');
    set.setPluginData(COMPONENT_RENDER_SCHEMA_KEY, COMPONENT_RENDER_SCHEMA_VERSION);
    arrangeSlotProviderSet(set, providers);
    reconcileEditableProperties(set, labels.map(label => ({
        id: 'slot-provider:label',
        name: 'Placeholder Label',
        type: 'TEXT',
        defaultValue: 'slot',
        node: label,
        field: 'characters',
    })));
    const labelPropertyKey = managedPropertyMap(set)['slot-provider:label'];
    if (!labelPropertyKey) throw new Error('Could not create the slot-provider label property.');

    return {
        set,
        byKind: new Map(providers.map((provider, providerIndex) => [
            SWAPPABLE_SLOT_KINDS[providerIndex],
            provider,
        ])),
        labelPropertyKey,
    };
}

function addSwappableSlot(
    parent: ComponentNode,
    slotRecipe: ComponentSlotRecipe & { kind: SwappableSlotKind },
    providers: SlotProviderCatalog,
): InstanceNode {
    const provider = providers.byKind.get(slotRecipe.kind);
    if (!provider) throw new Error(`No slot provider exists for ${slotRecipe.kind}.`);
    const instance = provider.createInstance();
    instance.name = slotRecipe.optional ? `${slotRecipe.name} (optional)` : slotRecipe.name;
    instance.setProperties({
        [providers.labelPropertyKey]: slotRecipe.kind === 'icon' ? '◇' : slotRecipe.name,
    });
    parent.appendChild(instance);
    return instance;
}

function propertyLabel(name: string): string {
    return name
        .split('-')
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function textPropertyName(recipe: ComponentRecipe, slot: ComponentSlotRecipe): string {
    const label = propertyLabel(slot.name);
    const collidesWithVariant = (recipe.variants || [])
        .some(axis => axis.name.toLowerCase() === label.toLowerCase());
    return collidesWithVariant ? `${label} Text` : label;
}

function propertyDisplayName(key: string): string {
    const hash = key.lastIndexOf('#');
    return hash < 0 ? key : key.slice(0, hash);
}

function managedPropertyMap(owner: ComponentNode | ComponentSetNode): Record<string, string> {
    try {
        const parsed = JSON.parse(owner.getPluginData(COMPONENT_PROPERTIES_KEY) || '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function ensureEditableProperty(
    owner: ComponentNode | ComponentSetNode,
    managed: Record<string, string>,
    binding: EditablePropertyBinding,
): string {
    const definitions = owner.componentPropertyDefinitions;
    let key: string | undefined = managed[binding.id];
    let definition = key ? definitions[key] : undefined;

    if (!definition || definition.type !== binding.type) {
        const matching = Object.entries(definitions).find(([candidate, value]) =>
            value.type === binding.type && propertyDisplayName(candidate) === binding.name);
        key = matching?.[0];
        definition = matching?.[1];
    }

    if (!key || !definition) {
        return owner.addComponentProperty(
            binding.name,
            binding.type,
            binding.defaultValue,
            binding.preferredValues ? { preferredValues: binding.preferredValues } : undefined,
        );
    }

    const currentPreferred = definition.preferredValues || [];
    const nextPreferred = binding.preferredValues || [];
    const preferredChanged = JSON.stringify(currentPreferred) !== JSON.stringify(nextPreferred);
    if (definition.defaultValue !== binding.defaultValue || preferredChanged) {
        return owner.editComponentProperty(key, {
            defaultValue: binding.defaultValue,
            ...(binding.preferredValues ? { preferredValues: binding.preferredValues } : {}),
        });
    }
    return key;
}

function reconcileEditableProperties(
    owner: ComponentNode | ComponentSetNode,
    renderedBindings: readonly EditablePropertyBinding[],
): void {
    const managed = managedPropertyMap(owner);
    const bindingsById = new Map<string, EditablePropertyBinding[]>();
    for (const binding of renderedBindings) {
        const matches = bindingsById.get(binding.id) || [];
        matches.push(binding);
        bindingsById.set(binding.id, matches);
    }

    const nextManaged: Record<string, string> = {};
    for (const [id, bindings] of bindingsById) {
        let propertyKey: string;
        try {
            propertyKey = ensureEditableProperty(owner, managed, bindings[0]);
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            throw new Error(`Could not reconcile ${bindings[0].type} component property "${bindings[0].name}" on "${owner.name}": ${detail}`);
        }
        nextManaged[id] = propertyKey;
        for (const binding of bindings) {
            binding.node.componentPropertyReferences = {
                ...(binding.node.componentPropertyReferences || {}),
                [binding.field]: propertyKey,
            };
        }
    }

    for (const [id, propertyKey] of Object.entries(managed)) {
        if (nextManaged[id] || !owner.componentPropertyDefinitions[propertyKey]) continue;
        owner.deleteComponentProperty(propertyKey);
    }
    owner.setPluginData(COMPONENT_PROPERTIES_KEY, JSON.stringify(nextManaged));

    // Do not report a successful migration if Figma declined either the
    // definition or its layer binding. This turns API/version mismatches into
    // an actionable import error instead of a silently incomplete library.
    for (const [id, bindings] of bindingsById) {
        const propertyKey = nextManaged[id];
        const definition = owner.componentPropertyDefinitions[propertyKey];
        if (!definition || definition.type !== bindings[0].type) {
            throw new Error(`Figma did not retain component property "${bindings[0].name}" on "${owner.name}".`);
        }
        for (const binding of bindings) {
            if (binding.node.componentPropertyReferences?.[binding.field] !== propertyKey) {
                throw new Error(`Figma did not retain the ${binding.field} binding for component property "${bindings[0].name}" on "${owner.name}".`);
            }
        }
    }
}

function arrangeVariantSet(
    set: ComponentSetNode,
    rendered: readonly ComponentNode[],
    recipe: ComponentRecipe,
): void {
    const axes = recipe.variants || [];
    const columns = axes.length > 1
        ? axes[axes.length - 1].values.length
        : Math.min(4, rendered.length);
    const safeColumns = Math.max(1, columns);
    const rows = Math.ceil(rendered.length / safeColumns);
    const cellWidth = Math.max(...rendered.map(component => component.width));
    const cellHeight = Math.max(...rendered.map(component => component.height));
    const horizontalGap = 40;
    const verticalGap = 32;
    const padding = 24;

    set.layoutMode = 'NONE';
    set.clipsContent = false;
    rendered.forEach((component, index) => {
        component.x = padding + (index % safeColumns) * (cellWidth + horizontalGap);
        component.y = padding + Math.floor(index / safeColumns) * (cellHeight + verticalGap);
    });
    set.resizeWithoutConstraints(
        padding * 2 + safeColumns * cellWidth + Math.max(0, safeColumns - 1) * horizontalGap,
        padding * 2 + rows * cellHeight + Math.max(0, rows - 1) * verticalGap,
    );
}

async function renderComponent(
    component: ComponentNode,
    recipe: ComponentRecipe,
    values: VariantValues,
    index: TokenIndex,
    slotProviders: SlotProviderCatalog,
): Promise<EditablePropertyBinding[]> {
    removeChildren(component);
    component.name = displayVariantName(recipe, values);
    component.description = `${recipe.description}\nRust: ${recipe.rustPath}\nFidelity: ${recipe.fidelity}`;
    component.setPluginData(RECIPE_KEY, recipe.id);
    component.setPluginData(VARIANT_KEY, variantKey(values));
    component.setPluginData(FIDELITY_KEY, recipe.fidelity);
    component.setPluginData(RUST_PATH_KEY, recipe.rustPath);
    component.setPluginData(COMPONENT_RENDER_SCHEMA_KEY, COMPONENT_RENDER_SCHEMA_VERSION);

    const visual = resolveComponentVisual(recipe, values);
    component.layoutMode = visual.direction === 'horizontal' ? 'HORIZONTAL' : 'VERTICAL';
    component.primaryAxisSizingMode = 'AUTO';
    component.counterAxisSizingMode = 'FIXED';
    component.resizeWithoutConstraints(visual.width, visual.minHeight);
    component.minHeight = visual.minHeight;
    component.clipsContent = false;
    setPadding(component, token(index, recipe.layout.paddingToken));
    setGap(component, token(index, recipe.layout.gapToken));
    setRadius(component, token(index, recipe.layout.radiusToken || 'radius/md'));
    component.fills = visual.fillToken
        ? [solidPaint({ r: 1, g: 1, b: 1 }, token(index, visual.fillToken))]
        : [];
    component.strokes = visual.borderToken
        ? [solidPaint({ r: 0.82, g: 0.84, b: 0.87 }, token(index, visual.borderToken))]
        : [];
    component.strokeWeight = visual.strokeWeight;
    if (visual.strokeSides) {
        component.strokeTopWeight = visual.strokeSides.top;
        component.strokeRightWeight = visual.strokeSides.right;
        component.strokeBottomWeight = visual.strokeSides.bottom;
        component.strokeLeftWeight = visual.strokeSides.left;
    }
    component.strokeAlign = 'INSIDE';
    component.primaryAxisAlignItems = visual.primaryAxisAlign;
    component.opacity = visual.opacity;
    bindFloat(component, 'opacity', token(index, visual.opacityToken || ''));

    const semanticControl = ['button', 'badge', 'checkbox', 'radio', 'switch', 'toggle', 'toolbar-button'].includes(recipe.id);
    const bindings: EditablePropertyBinding[] = [];
    const enabledMark = values.Checked === 'True' || values.Selected === 'True' || values.Pressed === 'True' || values.State === 'Active';
    if (semanticControl && enabledMark) await addText(component, '✓', index, false, visual.foregroundToken, visual.fontSize, visual.fontSizeToken, visual.fontStyle);
    if (semanticControl) {
        for (const slotRecipe of recipe.slots.filter(slot => isSwappableSlotKind(slot.kind))) {
            const kind = slotRecipe.kind as SwappableSlotKind;
            const frame = recipe.fidelity === 'visual-facsimile'
                ? addSwappableSlot(
                    component,
                    slotRecipe as ComponentSlotRecipe & { kind: SwappableSlotKind },
                    slotProviders,
                )
                : (await addSlot(component, slotRecipe, index)).frame;
            // Optional semantic layers were hidden before editable properties
            // existed, so keep the established default appearance unchanged.
            if (slotRecipe.optional) frame.visible = false;
            if (recipe.fidelity === 'visual-facsimile') {
                bindings.push({
                    id: `slot:${slotRecipe.name}:swap`,
                    name: propertyLabel(slotRecipe.name),
                    type: 'INSTANCE_SWAP',
                    defaultValue: slotProviders.byKind.get(kind)!.id,
                    preferredValues: [{ type: 'COMPONENT_SET', key: slotProviders.set.key }],
                    node: frame,
                    field: 'mainComponent',
                });
            }
            if (slotRecipe.optional) {
                bindings.push({
                    id: `slot:${slotRecipe.name}:visible`,
                    name: `Show ${propertyLabel(slotRecipe.name)}`,
                    type: 'BOOLEAN',
                    defaultValue: false,
                    node: frame,
                    field: 'visible',
                });
            }
        }
    }
    const sampleLabel = recipe.id === 'text' ? values.Role : recipe.name;
    const sampleLabelNode = await addText(component, sampleLabel, index, false, visual.foregroundToken, visual.fontSize, visual.fontSizeToken, visual.fontStyle);
    if (semanticControl) {
        const labelSlot = recipe.slots.find(slot => slot.kind === 'text');
        if (labelSlot) {
            bindings.push({
                id: `slot:${labelSlot.name}:text`,
                name: textPropertyName(recipe, labelSlot),
                type: 'TEXT',
                defaultValue: sampleLabel,
                node: sampleLabelNode,
                field: 'characters',
            });
            if (labelSlot.optional) {
                bindings.push({
                    id: `slot:${labelSlot.name}:visible`,
                    name: `Show ${propertyLabel(labelSlot.name)}`,
                    type: 'BOOLEAN',
                    defaultValue: true,
                    node: sampleLabelNode,
                    field: 'visible',
                });
            }
        }
    }
    if (!semanticControl) {
        for (const slotRecipe of recipe.slots) {
            if ((recipe.id === 'field-set' && slotRecipe.name === 'legend' && values.Legend === 'Hidden') ||
                (recipe.id === 'field-separator' && slotRecipe.name === 'label' && values.Label === 'Hidden') ||
                (recipe.id === 'graph-view' && slotRecipe.name === 'controls' && values.Controls === 'Off') ||
                (recipe.id === 'graph-view' && slotRecipe.name === 'minimap' && values.Minimap === 'Off')) continue;
            const swappable = recipe.fidelity === 'visual-facsimile' && isSwappableSlotKind(slotRecipe.kind);
            const slotNode = swappable
                ? addSwappableSlot(
                    component,
                    slotRecipe as ComponentSlotRecipe & { kind: SwappableSlotKind },
                    slotProviders,
                )
                : await addSlot(component, slotRecipe, index);
            const frame = swappable ? slotNode as InstanceNode : (slotNode as { frame: FrameNode }).frame;
            const text = swappable ? null : (slotNode as { text: TextNode }).text;
            if (slotRecipe.kind === 'text') {
                bindings.push({
                    id: `slot:${slotRecipe.name}:text`,
                    name: textPropertyName(recipe, slotRecipe),
                    type: 'TEXT',
                    defaultValue: slotRecipe.name,
                    node: text!,
                    field: 'characters',
                });
            }
            if (swappable) {
                const kind = slotRecipe.kind as SwappableSlotKind;
                bindings.push({
                    id: `slot:${slotRecipe.name}:swap`,
                    name: propertyLabel(slotRecipe.name),
                    type: 'INSTANCE_SWAP',
                    defaultValue: slotProviders.byKind.get(kind)!.id,
                    preferredValues: [{ type: 'COMPONENT_SET', key: slotProviders.set.key }],
                    node: frame,
                    field: 'mainComponent',
                });
            }
            if (slotRecipe.optional) {
                bindings.push({
                    id: `slot:${slotRecipe.name}:visible`,
                    name: `Show ${propertyLabel(slotRecipe.name)}`,
                    type: 'BOOLEAN',
                    defaultValue: true,
                    node: frame,
                    field: 'visible',
                });
            }
        }
    }
    if (recipe.fidelity === 'behavioral-only') {
        await addText(component, 'Behavior implemented in Rust', index, true);
    }
    return recipe.fidelity === 'visual-facsimile' ? bindings : [];
}

function nodeMap<T extends ComponentNode | ComponentSetNode>(nodes: readonly T[]): Map<string, T> {
    const result = new Map<string, T>();
    for (const node of nodes) {
        const recipeId = node.getPluginData(RECIPE_KEY);
        if (!recipeId) continue;
        const variant = node.type === 'COMPONENT' ? node.getPluginData(VARIANT_KEY) : '';
        result.set(`${recipeId}|${variant}`, node);
    }
    return result;
}

/**
 * Materialize the public Ouroboros component inventory on the current Figma page.
 * The operation is idempotent: managed components are updated in place and new
 * variants are appended to their existing component set.
 */
export async function syncOuroborosComponents(options: ComponentSyncOptions = {}): Promise<ComponentSyncResult> {
    const recipes = options.recipes || OUROBOROS_COMPONENT_RECIPES;
    const prefix = options.namePrefix || 'Ouroboros';
    const origin = options.origin || { x: 0, y: 0 };
    const columns = Math.max(1, options.columns || 4);
    await Promise.all(['Regular', 'Medium', 'Semi Bold', 'Bold'].map(style =>
        figma.loadFontAsync({ family: 'Inter', style })));
    const index = await buildTokenIndex();
    const libraryPage = await resolveComponentLibraryPage(true);
    if (!libraryPage) throw new Error('Unable to create the Ouroboros component library page.');
    libraryPage.setPluginData(COMPONENT_LIBRARY_PAGE_KEY, 'true');
    const slotProviders = await ensureSlotProviders(libraryPage, prefix, index, origin);

    const components = libraryPage.findAllWithCriteria({ types: ['COMPONENT'] });
    const sets = libraryPage.findAllWithCriteria({ types: ['COMPONENT_SET'] });
    const componentByKey = nodeMap(components);
    const setByKey = nodeMap(sets);
    const recipeIds = new Set(recipes.map(recipe => recipe.id));
    const pruneRetired = options.pruneRetired ?? options.recipes === undefined;
    let created = 0;
    let updated = 0;
    let removed = 0;
    let componentCount = 0;
    let componentSetCount = 0;
    const removedComponentIds = new Set<string>();

    // Remove retired component sets before individual variants. Only nodes with
    // OuroForge recipe metadata are eligible, so user-authored nodes are safe.
    for (const set of sets) {
        const id = set.getPluginData(RECIPE_KEY);
        if (!id) continue;
        const recipe = recipes.find(candidate => candidate.id === id);
        const noLongerASet = !!recipe && (recipe.variants || []).length === 0;
        if ((pruneRetired && !recipeIds.has(id)) || noLongerASet) {
            removed += 1 + set.children.filter(child => child.type === 'COMPONENT').length;
            for (const child of set.children) {
                if (child.type === 'COMPONENT') {
                    componentByKey.delete(`${id}|${child.getPluginData(VARIANT_KEY)}`);
                    removedComponentIds.add(child.id);
                }
            }
            setByKey.delete(`${id}|`);
            set.remove();
        }
    }

    // Reconcile variants for every requested recipe and remove retired managed
    // singleton recipes on an authoritative full sync.
    for (const component of components) {
        if (removedComponentIds.has(component.id)) continue;
        const id = component.getPluginData(RECIPE_KEY);
        if (!id) continue;
        const recipe = recipes.find(candidate => candidate.id === id);
        if (!recipe) {
            if (pruneRetired && component.parent?.type !== 'COMPONENT_SET') {
                component.remove();
                removed++;
            }
            continue;
        }
        const expected = new Set(cartesianVariants(recipe).map(variantKey));
        const key = component.getPluginData(VARIANT_KEY);
        if (!expected.has(key)) {
            componentByKey.delete(`${id}|${key}`);
            component.remove();
            removed++;
        }
    }

    for (let recipeIndex = 0; recipeIndex < recipes.length; recipeIndex++) {
        const recipe = recipes[recipeIndex];
        const variants = cartesianVariants(recipe);
        const hasVariants = (recipe.variants || []).length > 0;
        const setKey = `${recipe.id}|`;
        let set = setByKey.get(setKey) as ComponentSetNode | undefined;
        const topLevelExisted = hasVariants
            ? !!set
            : componentByKey.has(`${recipe.id}|`);
        const rendered: ComponentNode[] = [];
        const editableBindings: EditablePropertyBinding[] = [];

        for (const values of variants) {
            const key = `${recipe.id}|${variantKey(values)}`;
            let component = componentByKey.get(key) as ComponentNode | undefined;
            if (!component) {
                component = figma.createComponent();
                componentByKey.set(key, component);
                if (set) set.appendChild(component);
                else libraryPage.appendChild(component);
                created++;
            } else {
                updated++;
            }
            editableBindings.push(...await renderComponent(component, recipe, values, index, slotProviders));
            rendered.push(component);
            componentCount++;
        }

        let topLevel: ComponentNode | ComponentSetNode = rendered[0];
        if (hasVariants) {
            if (!set) {
                set = figma.combineAsVariants(rendered, libraryPage);
                setByKey.set(setKey, set);
                created++;
            }
            set.name = `${prefix}/${recipe.layer}s/${recipe.name}`;
            set.description = `${recipe.description}\nRust: ${recipe.rustPath}\nFidelity: ${recipe.fidelity}`;
            set.setPluginData(RECIPE_KEY, recipe.id);
            set.setPluginData(FIDELITY_KEY, recipe.fidelity);
            set.setPluginData(RUST_PATH_KEY, recipe.rustPath);
            arrangeVariantSet(set, rendered, recipe);
            topLevel = set;
            componentSetCount++;
        } else {
            rendered[0].name = `${prefix}/${recipe.layer}s/${recipe.name}`;
        }
        reconcileEditableProperties(topLevel, editableBindings);
        topLevel.setPluginData(COMPONENT_RENDER_SCHEMA_KEY, COMPONENT_RENDER_SCHEMA_VERSION);

        // Preserve any page organization done in Figma. The grid is only an
        // initial placement policy for newly materialized recipes.
        if (!topLevelExisted) {
            topLevel.x = origin.x + (recipeIndex % columns) * 560;
            topLevel.y = origin.y + Math.floor(recipeIndex / columns) * 360;
        }
    }

    return {
        recipes: recipes.length,
        components: componentCount,
        componentSets: componentSetCount,
        created,
        updated,
        removed,
        visualFacsimiles: recipes.filter(recipe => recipe.fidelity === 'visual-facsimile').length,
        behavioralOnly: recipes.filter(recipe => recipe.fidelity === 'behavioral-only').length,
    };
}
