import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OUROBOROS_COMPONENT_RECIPES } from '../adapters/ouroborosComponents';
import { resolveComponentVisual, syncOuroborosComponents } from './componentSync';

function createFigmaMock() {
    let idCounter = 0;
    const managedCollection = {
        id: 'col-ouroboros',
        getSharedPluginData(namespace: string, key: string) {
            return namespace === 'ouroforge' && key === 'managedCollection'
                ? JSON.stringify({ adapterId: 'ouroboros', schemaVersion: 1 })
                : '';
        },
    };
    const unmanagedCollection = {
        id: 'col-user',
        getSharedPluginData() { return ''; },
    };
    const managedVariable = (id: string, name: string, resolvedType: string) => ({
        id,
        name,
        resolvedType,
        variableCollectionId: managedCollection.id,
        getSharedPluginData(namespace: string, key: string) {
            return namespace === 'ouroforge' && key === 'managedToken'
                ? JSON.stringify({ adapterId: 'ouroboros', tokenId: `ouroboros:${name}`, schemaVersion: 1 })
                : '';
        },
    });
    const variables = [
        managedVariable('var-card', 'card', 'COLOR'),
        managedVariable('var-foreground', 'foreground', 'COLOR'),
        managedVariable('var-muted', 'muted', 'COLOR'),
        managedVariable('var-muted-foreground', 'muted-foreground', 'COLOR'),
        managedVariable('var-border', 'border', 'COLOR'),
        managedVariable('var-border-strong', 'border-strong', 'COLOR'),
        managedVariable('var-primary', 'primary', 'COLOR'),
        managedVariable('var-primary-foreground', 'primary-foreground', 'COLOR'),
        managedVariable('var-primary-hover', 'primary-hover', 'COLOR'),
        managedVariable('var-secondary', 'secondary', 'COLOR'),
        managedVariable('var-secondary-foreground', 'secondary-foreground', 'COLOR'),
        managedVariable('var-accent', 'accent', 'COLOR'),
        managedVariable('var-accent-foreground', 'accent-foreground', 'COLOR'),
        managedVariable('var-ring', 'ring', 'COLOR'),
        managedVariable('var-destructive', 'destructive', 'COLOR'),
        managedVariable('var-destructive-foreground', 'destructive-foreground', 'COLOR'),
        managedVariable('var-success', 'success', 'COLOR'),
        managedVariable('var-success-bg', 'success-bg', 'COLOR'),
        managedVariable('var-warning', 'warning', 'COLOR'),
        managedVariable('var-warning-bg', 'warning-bg', 'COLOR'),
        managedVariable('var-info', 'info', 'COLOR'),
        managedVariable('var-info-bg', 'info-bg', 'COLOR'),
        managedVariable('var-error', 'error', 'COLOR'),
        managedVariable('var-error-bg', 'error-bg', 'COLOR'),
        managedVariable('var-hover-overlay', 'hover-overlay', 'COLOR'),
        managedVariable('var-disabled-foreground', 'disabled-foreground', 'COLOR'),
        managedVariable('var-opacity-disabled', 'opacity/disabled', 'FLOAT'),
        managedVariable('var-space-2', 'spacing/2', 'FLOAT'),
        managedVariable('var-space-3', 'spacing/3', 'FLOAT'),
        managedVariable('var-space-4', 'spacing/4', 'FLOAT'),
        managedVariable('var-space-5', 'spacing/5', 'FLOAT'),
        managedVariable('var-radius-md', 'radius/md', 'FLOAT'),
        managedVariable('var-radius-lg', 'radius/lg', 'FLOAT'),
    ];

    const makeNode = (type: string) => {
        const pluginData: Record<string, string> = {};
        const componentPropertyDefinitions: Record<string, any> = {};
        const node: any = {
            id: `node-${++idCounter}`,
            type,
            name: '',
            description: '',
            children: [],
            parent: null,
            fills: [],
            strokes: [],
            boundVariables: {},
            componentPropertyDefinitions,
            componentPropertyReferences: null,
            visible: true,
            x: 0,
            y: 0,
            setPluginData(key: string, value: string) { pluginData[key] = value; },
            getPluginData(key: string) { return pluginData[key] || ''; },
            setBoundVariable(field: string, variable: any) { node.boundVariables[field] = variable; },
            appendChild(child: any) {
                if (child.parent) {
                    const oldIndex = child.parent.children.indexOf(child);
                    if (oldIndex >= 0) child.parent.children.splice(oldIndex, 1);
                }
                child.parent = node;
                node.children.push(child);
            },
            remove() {
                if (!node.parent) return;
                const index = node.parent.children.indexOf(node);
                if (index >= 0) node.parent.children.splice(index, 1);
                node.parent = null;
            },
            resizeWithoutConstraints(width: number, height: number) {
                node.width = width;
                node.height = height;
            },
            addComponentProperty(
                name: string,
                propertyType: string,
                defaultValue: string | boolean,
                options?: { preferredValues?: any[] },
            ) {
                const key = `${name}#${++idCounter}:0`;
                componentPropertyDefinitions[key] = {
                    type: propertyType,
                    defaultValue,
                    ...(options?.preferredValues ? { preferredValues: options.preferredValues } : {}),
                };
                return key;
            },
            editComponentProperty(
                key: string,
                value: { name?: string; defaultValue?: string | boolean; preferredValues?: any[] },
            ) {
                const current = componentPropertyDefinitions[key];
                const nextKey = value.name ? `${value.name}${key.slice(key.lastIndexOf('#'))}` : key;
                componentPropertyDefinitions[nextKey] = { ...current, ...value };
                if (nextKey !== key) delete componentPropertyDefinitions[key];
                return nextKey;
            },
            deleteComponentProperty(key: string) {
                delete componentPropertyDefinitions[key];
            },
        };
        return node;
    };

    const page = makeNode('PAGE');
    page.name = 'Ouroboros UI Library';
    page.loadAsync = async () => {};
    const findAllWithCriteria = function (this: any, { types }: { types: string[] }) {
        const found: any[] = [];
        const visit = (node: any) => {
            for (const child of node.children) {
                if (types.includes(child.type)) found.push(child);
                visit(child);
            }
        };
        visit(this);
        return found;
    };
    page.findAllWithCriteria = findAllWithCriteria;
    const root = makeNode('DOCUMENT');
    root.appendChild(page);

    const figmaMock: any = {
        root,
        currentPage: page,
        async loadAllPagesAsync() {},
        variables: {
            async getLocalVariableCollectionsAsync() { return [managedCollection, unmanagedCollection]; },
            async getLocalVariablesAsync() { return variables; },
            setBoundVariableForPaint(paint: any, field: string, variable: any) {
                return { ...paint, boundVariables: { [field]: { id: variable.id } } };
            },
        },
        async loadFontAsync() {},
        createComponent() {
            const component = makeNode('COMPONENT');
            component.key = `component-key-${component.id}`;
            component.createInstance = () => {
                const instance = makeNode('INSTANCE');
                instance.mainComponent = component;
                instance.width = component.width;
                instance.height = component.height;
                const propertyOwner = component.parent?.type === 'COMPONENT_SET'
                    ? component.parent
                    : component;
                instance.componentProperties = Object.fromEntries(
                    Object.entries(propertyOwner.componentPropertyDefinitions || {})
                        .map(([key, definition]: [string, any]) => [key, {
                            type: definition.type,
                            value: definition.defaultValue,
                            ...(definition.preferredValues
                                ? { preferredValues: definition.preferredValues }
                                : {}),
                        }]),
                );
                instance.setProperties = (properties: Record<string, string | boolean>) => {
                    for (const [key, value] of Object.entries(properties)) {
                        if (instance.componentProperties[key]) instance.componentProperties[key].value = value;
                    }
                };
                figmaMock.currentPage.appendChild(instance);
                return instance;
            };
            return component;
        },
        createFrame() { return makeNode('FRAME'); },
        createText() { return makeNode('TEXT'); },
        createPage() {
            const created = makeNode('PAGE');
            created.loadAsync = async () => {};
            created.findAllWithCriteria = findAllWithCriteria;
            root.appendChild(created);
            return created;
        },
        combineAsVariants(nodes: any[], parent: any) {
            const set = makeNode('COMPONENT_SET');
            set.key = `component-set-key-${set.id}`;
            parent.appendChild(set);
            for (const node of nodes) set.appendChild(node);
            return set;
        },
    };

    return { figmaMock, page, variables, unmanagedCollection };
}

function variantsFor(recipe: typeof OUROBOROS_COMPONENT_RECIPES[number]): number {
    return (recipe.variants || []).reduce((count, axis) => count * axis.values.length, 1);
}

describe('Ouroboros component sync', () => {
    let mock: ReturnType<typeof createFigmaMock>;

    beforeEach(() => {
        mock = createFigmaMock();
        vi.stubGlobal('figma', mock.figmaMock);
    });

    afterEach(() => vi.unstubAllGlobals());

    it('gives every declared axis on visual facsimiles an explicit visual treatment', () => {
        for (const recipe of OUROBOROS_COMPONENT_RECIPES.filter(item => item.fidelity === 'visual-facsimile')) {
            const defaults = Object.fromEntries((recipe.variants || []).map(axis => [axis.name, axis.defaultValue]));
            const baseline = JSON.stringify(resolveComponentVisual(recipe, defaults));
            for (const axis of recipe.variants || []) {
                for (const value of axis.values.filter(candidate => candidate !== axis.defaultValue)) {
                    const changed = JSON.stringify(resolveComponentVisual(recipe, { ...defaults, [axis.name]: value }));
                    expect(changed, `${recipe.id}.${axis.name}=${value}`).not.toBe(baseline);
                }
            }
        }
    });

    it('materializes the full inventory with all declared variants', async () => {
        const result = await syncOuroborosComponents();
        const expectedComponents = OUROBOROS_COMPONENT_RECIPES.reduce((count, recipe) => count + variantsFor(recipe), 0);
        const expectedSets = OUROBOROS_COMPONENT_RECIPES.filter(recipe => (recipe.variants || []).length > 0).length;

        expect(result.recipes).toBe(66);
        expect(expectedComponents).toBe(217);
        expect(expectedSets).toBe(50);
        expect(result.components).toBe(217);
        expect(result.componentSets).toBe(50);
        expect(result.visualFacsimiles).toBe(38);
        expect(result.behavioralOnly).toBe(28);
        expect(mock.page.findAllWithCriteria({ types: ['COMPONENT'] })).toHaveLength(expectedComponents + 5);
        expect(mock.page.findAllWithCriteria({ types: ['COMPONENT_SET'] })).toHaveLength(expectedSets + 1);
    });

    it('covers every editable slot declared by visual-facsimile recipes', async () => {
        await syncOuroborosComponents();
        const topLevels = [
            ...mock.page.findAllWithCriteria({ types: ['COMPONENT_SET'] }),
            ...mock.page.findAllWithCriteria({ types: ['COMPONENT'] })
                .filter((node: any) => node.parent?.type !== 'COMPONENT_SET'),
        ];
        let textProperties = 0;
        let visibilityProperties = 0;
        let instanceSwapProperties = 0;

        for (const recipe of OUROBOROS_COMPONENT_RECIPES) {
            const owner = topLevels.find((node: any) => node.getPluginData('ouroforge:recipe') === recipe.id);
            const managed = JSON.parse(owner.getPluginData('ouroforge:componentProperties') || '{}');
            if (recipe.fidelity === 'behavioral-only') {
                expect(managed, recipe.id).toEqual({});
                continue;
            }

            const expected = recipe.slots.flatMap(slot => [
                ...(slot.kind === 'text' ? [`slot:${slot.name}:text`] : []),
                ...(slot.kind !== 'text' ? [`slot:${slot.name}:swap`] : []),
                ...(slot.optional ? [`slot:${slot.name}:visible`] : []),
            ]);
            expect(Object.keys(managed).sort(), recipe.id).toEqual(expected.sort());
            for (const slot of recipe.slots.filter(slot => slot.kind !== 'text')) {
                const propertyKey = managed[`slot:${slot.name}:swap`];
                expect(owner.componentPropertyDefinitions[propertyKey], `${recipe.id}.${slot.name}`)
                    .toMatchObject({
                        type: 'INSTANCE_SWAP',
                        defaultValue: expect.any(String),
                        preferredValues: [{ type: 'COMPONENT_SET', key: expect.any(String) }],
                    });
            }
            textProperties += recipe.slots.filter(slot => slot.kind === 'text').length;
            visibilityProperties += recipe.slots.filter(slot => slot.optional).length;
            instanceSwapProperties += recipe.slots.filter(slot => slot.kind !== 'text').length;
        }

        expect(textProperties).toBe(32);
        expect(visibilityProperties).toBe(31);
        expect(instanceSwapProperties).toBe(47);

        for (const set of mock.page.findAllWithCriteria({ types: ['COMPONENT_SET'] })) {
            const positions = set.children.map((node: any) => `${node.x},${node.y}`);
            expect(new Set(positions).size, set.name).toBe(set.children.length);
            expect(set.clipsContent, set.name).toBe(false);
            for (const child of set.children) {
                expect(child.x + child.width, set.name).toBeLessThanOrEqual(set.width);
                expect(child.y + child.height, set.name).toBeLessThanOrEqual(set.height);
            }
        }
    });

    it('creates auto-layout component sets with token-bound paints, spacing, and radii', async () => {
        const selected = OUROBOROS_COMPONENT_RECIPES.filter(recipe => ['button', 'dialog', 'icon'].includes(recipe.id));
        await syncOuroborosComponents({ recipes: selected });

        const sets = mock.page.findAllWithCriteria({ types: ['COMPONENT_SET'] });
        const buttonSet = sets.find((node: any) => node.name === 'Ouroboros/atoms/Button');
        expect(buttonSet).toBeDefined();
        expect(buttonSet.children).toHaveLength(18);

        const button = buttonSet.children[0];
        expect(button.layoutMode).toBe('HORIZONTAL');
        expect(button.fills[0].boundVariables.color.id).toBe('var-primary');
        expect(button.strokes[0].boundVariables.color.id).toBe('var-primary');
        expect(button.boundVariables.paddingLeft.id).toBe('var-space-3');
        expect(button.boundVariables.itemSpacing.id).toBe('var-space-2');
        expect(button.boundVariables.topLeftRadius.id).toBe('var-radius-md');
        expect(button.getPluginData('ouroforge:rustPath')).toBe('ouroboros_ui::atoms::Button');

        const buttonDefinitions = Object.entries(buttonSet.componentPropertyDefinitions) as [string, any][];
        const label = buttonDefinitions.find(([key]) => key.startsWith('Label#'))!;
        const leadingIcon = buttonDefinitions.find(([key]) => key.startsWith('Show Leading Icon#'))!;
        const leadingIconSwap = buttonDefinitions.find(([key]) => key.startsWith('Leading Icon#'))!;
        const providerSet = sets.find((node: any) => node.name === 'Ouroboros/internal/SlotProvider');
        const providerLabelKey = Object.keys(providerSet.componentPropertyDefinitions)
            .find(key => key.startsWith('Placeholder Label#'))!;
        expect(label[1]).toEqual({ type: 'TEXT', defaultValue: 'Button' });
        expect(leadingIcon[1]).toEqual({ type: 'BOOLEAN', defaultValue: false });
        expect(leadingIconSwap[1]).toMatchObject({
            type: 'INSTANCE_SWAP',
            preferredValues: [{ type: 'COMPONENT_SET', key: expect.any(String) }],
        });
        for (const variant of buttonSet.children) {
            const labelNode = variant.children.find((node: any) => node.characters === 'Button');
            const iconNode = variant.children.find((node: any) => node.name === 'leading-icon (optional)');
            expect(labelNode.componentPropertyReferences.characters).toBe(label[0]);
            expect(iconNode.componentPropertyReferences.visible).toBe(leadingIcon[0]);
            expect(iconNode.type).toBe('INSTANCE');
            expect(iconNode.componentPropertyReferences.mainComponent).toBe(leadingIconSwap[0]);
            expect(iconNode.mainComponent.id).toBe(leadingIconSwap[1].defaultValue);
            expect(iconNode.componentProperties[providerLabelKey].value).toBe('◇');
            expect(iconNode.visible).toBe(false);
        }

        expect(buttonSet.clipsContent).toBe(false);
        expect(buttonSet.width).toBe(668);
        expect(buttonSet.height).toBe(400);
        expect(buttonSet.children.map((node: any) => [node.x, node.y])).toEqual([
            [24, 24], [244, 24], [464, 24],
            [24, 88], [244, 88], [464, 88],
            [24, 152], [244, 152], [464, 152],
            [24, 216], [244, 216], [464, 216],
            [24, 280], [244, 280], [464, 280],
            [24, 344], [244, 344], [464, 344],
        ]);

        const dialogSet = sets.find((node: any) => node.name === 'Ouroboros/organisms/Dialog');
        expect(dialogSet.description).toContain('Fidelity: behavioral-only');
        expect(dialogSet.children[0].children.some((node: any) => node.characters === 'Behavior implemented in Rust')).toBe(true);
    });

    it('exposes declared text and optional slots as managed editable properties', async () => {
        const selected = OUROBOROS_COMPONENT_RECIPES.filter(recipe =>
            recipe.fidelity === 'visual-facsimile' && ['alert', 'field-set', 'list-item'].includes(recipe.id));
        await syncOuroborosComponents({ recipes: selected });

        const sets = mock.page.findAllWithCriteria({ types: ['COMPONENT_SET'] });
        const alert = sets.find((node: any) => node.name === 'Ouroboros/molecules/Alert');
        const alertDefinitions = Object.entries(alert.componentPropertyDefinitions) as [string, any][];
        expect(alertDefinitions.map(([key, value]) => [key.slice(0, key.lastIndexOf('#')), value.type]))
            .toEqual(expect.arrayContaining([
                ['Title', 'TEXT'],
                ['Message', 'TEXT'],
                ['Show Title', 'BOOLEAN'],
                ['Show Action', 'BOOLEAN'],
            ]));

        const fieldSet = sets.find((node: any) => node.name === 'Ouroboros/molecules/FieldSet');
        expect(Object.keys(fieldSet.componentPropertyDefinitions)
            .some(key => key.startsWith('Legend Text#'))).toBe(true);
        expect(Object.keys(fieldSet.componentPropertyDefinitions)
            .some(key => key.startsWith('Legend#'))).toBe(false);

        const listItem = sets.find((node: any) => node.name === 'Ouroboros/cells/ListItem');
        const first = listItem.children[0];
        const labelSlot = first.children.find((node: any) => node.name === 'label');
        const labelText = labelSlot.children.find((node: any) => node.type === 'TEXT');
        const labelKey = Object.keys(listItem.componentPropertyDefinitions)
            .find(key => key.startsWith('Label#'))!;
        expect(labelText.componentPropertyReferences.characters).toBe(labelKey);
    });

    it('keeps editable property identities and variant geometry stable across reimport', async () => {
        const selected = OUROBOROS_COMPONENT_RECIPES.filter(recipe => recipe.id === 'button');
        await syncOuroborosComponents({ recipes: selected });
        const buttonSet = mock.page.findAllWithCriteria({ types: ['COMPONENT_SET'] })
            .find((node: any) => node.name === 'Ouroboros/atoms/Button');
        const firstDefinitions = { ...buttonSet.componentPropertyDefinitions };
        const firstPositions = buttonSet.children.map((node: any) => [node.x, node.y]);

        await syncOuroborosComponents({ recipes: selected });

        expect(buttonSet.componentPropertyDefinitions).toEqual(firstDefinitions);
        expect(buttonSet.children.map((node: any) => [node.x, node.y])).toEqual(firstPositions);
        expect(Object.keys(buttonSet.componentPropertyDefinitions)).toHaveLength(3);
    });

    it('creates one reusable provider set and stable instance-swap properties for every non-text slot kind', async () => {
        const selected = OUROBOROS_COMPONENT_RECIPES.filter(recipe =>
            recipe.fidelity === 'visual-facsimile'
            && ['alert', 'button', 'card', 'property-row', 'table'].includes(recipe.id));
        await syncOuroborosComponents({ recipes: selected });

        const providerSets = mock.page.findAllWithCriteria({ types: ['COMPONENT_SET'] })
            .filter((node: any) => node.getPluginData('ouroforge:slotProviderSet') === 'true');
        expect(providerSets).toHaveLength(1);
        const providerSet = providerSets[0];
        expect(providerSet.name).toBe('Ouroboros/internal/SlotProvider');
        expect(providerSet.children.map((node: any) => node.getPluginData('ouroforge:slotProviderKind')))
            .toEqual(['icon', 'control', 'content', 'action', 'collection']);
        expect(providerSet.children.every((node: any) =>
            node.fills[0].boundVariables.color.id === 'var-muted'
            && node.strokes[0].boundVariables.color.id === 'var-border')).toBe(true);

        const topLevels = [
            ...mock.page.findAllWithCriteria({ types: ['COMPONENT_SET'] }),
            ...mock.page.findAllWithCriteria({ types: ['COMPONENT'] })
                .filter((node: any) => node.parent?.type !== 'COMPONENT_SET'),
        ].filter((node: any) => !!node.getPluginData('ouroforge:recipe'));
        const swapDefinitions = topLevels.flatMap((owner: any) =>
            Object.entries(owner.componentPropertyDefinitions)
                .filter(([, definition]: [string, any]) => definition.type === 'INSTANCE_SWAP')
                .map(([key, definition]: [string, any]) => ({ owner, key, definition })));
        expect(swapDefinitions).toHaveLength(9);
        for (const { owner, key, definition } of swapDefinitions) {
            expect(definition.preferredValues).toEqual([
                { type: 'COMPONENT_SET', key: providerSet.key },
            ]);
            expect(providerSet.children.map((node: any) => node.id)).toContain(definition.defaultValue);
            const variants = owner.type === 'COMPONENT_SET' ? owner.children : [owner];
            for (const variant of variants) {
                const bound = variant.children.filter((node: any) =>
                    node.componentPropertyReferences?.mainComponent === key);
                expect(bound.length, `${owner.name}.${key}`).toBeGreaterThan(0);
                expect(bound.every((node: any) => node.type === 'INSTANCE')).toBe(true);
                const labelKey = Object.keys(providerSet.componentPropertyDefinitions)
                    .find(candidate => candidate.startsWith('Placeholder Label#'))!;
                for (const node of bound) {
                    const kind = node.mainComponent.getPluginData('ouroforge:slotProviderKind');
                    expect(node.componentProperties[labelKey].value).toBe(
                        kind === 'icon' ? '◇' : node.name.replace(' (optional)', ''),
                    );
                }
            }
        }
    });

    it('preserves provider IDs, property IDs, and existing instance overrides across reimport', async () => {
        const selected = OUROBOROS_COMPONENT_RECIPES.filter(recipe => recipe.id === 'button');
        await syncOuroborosComponents({ recipes: selected });
        const sets = mock.page.findAllWithCriteria({ types: ['COMPONENT_SET'] });
        const providerSet = sets.find((node: any) => node.getPluginData('ouroforge:slotProviderSet') === 'true');
        const buttonSet = sets.find((node: any) => node.name === 'Ouroboros/atoms/Button');
        const providerIds = providerSet.children.map((node: any) => node.id);
        const managedBefore = JSON.parse(buttonSet.getPluginData('ouroforge:componentProperties'));
        const swapKey = managedBefore['slot:leading-icon:swap'];
        const externalInstance = buttonSet.children[0].createInstance();
        const alternateProviderId = providerIds[1];
        externalInstance.setProperties({ [swapKey]: alternateProviderId });
        const externalInstanceId = externalInstance.id;

        await syncOuroborosComponents({ recipes: selected });

        const providerSets = mock.page.findAllWithCriteria({ types: ['COMPONENT_SET'] })
            .filter((node: any) => node.getPluginData('ouroforge:slotProviderSet') === 'true');
        expect(providerSets).toHaveLength(1);
        expect(providerSets[0].id).toBe(providerSet.id);
        expect(providerSets[0].children.map((node: any) => node.id)).toEqual(providerIds);
        expect(JSON.parse(buttonSet.getPluginData('ouroforge:componentProperties'))).toEqual(managedBefore);
        expect(externalInstance.id).toBe(externalInstanceId);
        expect(externalInstance.componentProperties[swapKey].value).toBe(alternateProviderId);
    });

    it('migrates a pre-schema component set while reusing an existing manual text property', async () => {
        const selected = OUROBOROS_COMPONENT_RECIPES.filter(recipe => recipe.id === 'button');
        await syncOuroborosComponents({ recipes: selected });
        const buttonSet = mock.page.findAllWithCriteria({ types: ['COMPONENT_SET'] })
            .find((node: any) => node.name === 'Ouroboros/atoms/Button');
        const originalSetId = buttonSet.id;
        const labelKey = Object.keys(buttonSet.componentPropertyDefinitions)
            .find(key => key.startsWith('Label#'))!;
        const booleanKey = Object.keys(buttonSet.componentPropertyDefinitions)
            .find(key => key.startsWith('Show Leading Icon#'))!;

        // Simulate an old import: no renderer version or managed property map,
        // with only a user-created Label property remaining on the set.
        buttonSet.deleteComponentProperty(booleanKey);
        buttonSet.setPluginData('ouroforge:componentProperties', '');
        buttonSet.setPluginData('ouroforge:renderSchema', '');
        for (const variant of buttonSet.children) {
            for (const child of variant.children) child.componentPropertyReferences = null;
        }

        await syncOuroborosComponents({ recipes: selected });

        expect(buttonSet.id).toBe(originalSetId);
        expect(buttonSet.getPluginData('ouroforge:renderSchema')).toBe('3');
        expect(Object.keys(buttonSet.componentPropertyDefinitions)).toContain(labelKey);
        expect(Object.keys(buttonSet.componentPropertyDefinitions)
            .some(key => key.startsWith('Show Leading Icon#'))).toBe(true);
        expect(Object.keys(buttonSet.componentPropertyDefinitions)).toHaveLength(3);
        expect(JSON.parse(buttonSet.getPluginData('ouroforge:componentProperties')))
            .toMatchObject({
                'slot:label:text': labelKey,
                'slot:leading-icon:visible': expect.stringMatching(/^Show Leading Icon#/),
                'slot:leading-icon:swap': expect.stringMatching(/^Leading Icon#/),
            });
    });

    it('reuses a managed library across pages instead of duplicating on the active canvas', async () => {
        const selected = OUROBOROS_COMPONENT_RECIPES.filter(recipe => recipe.id === 'button');
        await syncOuroborosComponents({ recipes: selected });
        const originalIds = mock.page.findAllWithCriteria({ types: ['COMPONENT'] })
            .map((node: any) => node.id);
        mock.page.name = 'Renamed component library';

        const activePage = mock.figmaMock.createPage();
        activePage.name = 'Sapodilla Parity';
        mock.figmaMock.currentPage = activePage;
        await syncOuroborosComponents({ recipes: selected });

        expect(mock.page.findAllWithCriteria({ types: ['COMPONENT'] })
            .map((node: any) => node.id)).toEqual(originalIds);
        expect(activePage.findAllWithCriteria({ types: ['COMPONENT', 'COMPONENT_SET'] })).toEqual([]);
        expect(mock.page.getPluginData('ouroforge:componentLibraryPage')).toBe('true');
    });

    it('creates a dedicated library page when the file has no managed component page', async () => {
        mock.page.name = 'Sapodilla Parity';
        const selected = OUROBOROS_COMPONENT_RECIPES.filter(recipe => recipe.id === 'button');
        await syncOuroborosComponents({ recipes: selected });

        const library = mock.figmaMock.root.children.find((node: any) =>
            node.name === 'Ouroboros UI Library');
        expect(library).toBeDefined();
        expect(library).not.toBe(mock.page);
        expect(library.findAllWithCriteria({ types: ['COMPONENT'] })).toHaveLength(23);
        expect(mock.page.findAllWithCriteria({ types: ['COMPONENT', 'COMPONENT_SET'] })).toEqual([]);
    });

    it('renders semantic variants with different managed tokens and state geometry', async () => {
        const selected = OUROBOROS_COMPONENT_RECIPES.filter(recipe => ['button', 'badge', 'checkbox', 'node-frame'].includes(recipe.id));
        await syncOuroborosComponents({ recipes: selected });
        const sets = mock.page.findAllWithCriteria({ types: ['COMPONENT_SET'] });
        const variant = (setName: string, name: string) => sets.find((node: any) => node.name === setName)
            .children.find((node: any) => node.name === name);

        const hover = variant('Ouroboros/atoms/Button', 'Variant=Default, State=Hover');
        const disabled = variant('Ouroboros/atoms/Button', 'Variant=Default, State=Disabled');
        const success = variant('Ouroboros/atoms/Badge', 'Variant=Success');
        const checked = variant('Ouroboros/atoms/Checkbox', 'Checked=True, State=Default');
        const selectedNode = variant('Ouroboros/graphs/NodeFrame', 'Kind=Base, Selected=True, Status=None');

        expect(hover.fills[0].boundVariables.color.id).toBe('var-primary-hover');
        expect(disabled.boundVariables.opacity.id).toBe('var-opacity-disabled');
        expect(disabled.opacity).toBe(0.5);
        expect(success.fills[0].boundVariables.color.id).toBe('var-success-bg');
        expect(success.children.find((node: any) => node.characters === 'Badge').fills[0].boundVariables.color.id).toBe('var-success');
        expect(checked.fills[0].boundVariables.color.id).toBe('var-primary');
        expect(checked.children.some((node: any) => node.characters === '✓')).toBe(true);
        expect(selectedNode.strokes[0].boundVariables.color.id).toBe('var-ring');
        expect(selectedNode.strokeWeight).toBe(2);
    });

    it('updates managed nodes in place without duplicating components or sets', async () => {
        const selected = OUROBOROS_COMPONENT_RECIPES.filter(recipe => ['checkbox', 'card', 'toolbar'].includes(recipe.id));
        const first = await syncOuroborosComponents({ recipes: selected });
        const firstComponentIds = mock.page.findAllWithCriteria({ types: ['COMPONENT'] }).map((node: any) => node.id);
        const firstSetIds = mock.page.findAllWithCriteria({ types: ['COMPONENT_SET'] }).map((node: any) => node.id);
        const checkboxSet = mock.page.findAllWithCriteria({ types: ['COMPONENT_SET'] })
            .find((node: any) => node.name === 'Ouroboros/atoms/Checkbox');
        checkboxSet.x = 1234;
        checkboxSet.y = 5678;

        const second = await syncOuroborosComponents({ recipes: selected });
        expect(first.created).toBeGreaterThan(0);
        expect(second.created).toBe(0);
        expect(second.updated).toBe(second.components);
        expect(mock.page.findAllWithCriteria({ types: ['COMPONENT'] }).map((node: any) => node.id)).toEqual(firstComponentIds);
        expect(mock.page.findAllWithCriteria({ types: ['COMPONENT_SET'] }).map((node: any) => node.id)).toEqual(firstSetIds);
        expect({ x: checkboxSet.x, y: checkboxSet.y }).toEqual({ x: 1234, y: 5678 });
    });

    it('removes stale managed variants and retired recipes without touching user nodes', async () => {
        const checkbox = OUROBOROS_COMPONENT_RECIPES.find(recipe => recipe.id === 'checkbox')!;
        const card = OUROBOROS_COMPONENT_RECIPES.find(recipe => recipe.id === 'card')!;
        await syncOuroborosComponents({ recipes: [checkbox, card] });
        const userNode = mock.figmaMock.createComponent();
        userNode.name = 'User component';
        mock.page.appendChild(userNode);

        const narrowedCheckbox = {
            ...checkbox,
            variants: checkbox.variants!.map(axis => axis.name === 'State'
                ? { ...axis, values: ['Default'], defaultValue: 'Default' }
                : axis),
        };
        const reconciled = await syncOuroborosComponents({ recipes: [narrowedCheckbox], pruneRetired: true });

        const sets = mock.page.findAllWithCriteria({ types: ['COMPONENT_SET'] });
        const checkboxSet = sets.find((node: any) => node.name === 'Ouroboros/atoms/Checkbox');
        expect(checkboxSet.children.map((node: any) => node.name)).toEqual([
            'Checked=False, State=Default',
            'Checked=True, State=Default',
        ]);
        expect(sets.some((node: any) => node.name === 'Ouroboros/molecules/Card')).toBe(false);
        expect(mock.page.findAllWithCriteria({ types: ['COMPONENT'] })).toContain(userNode);
        expect(reconciled.removed).toBe(5); // two Checkbox variants + Card set and its two variants
    });

    it('binds component recipes only to variables managed by the Ouroboros adapter', async () => {
        mock.variables.unshift(
            {
                id: 'user-primary', name: 'primary', resolvedType: 'COLOR',
                variableCollectionId: mock.unmanagedCollection.id,
                getSharedPluginData() { return ''; },
            },
            {
                id: 'other-managed-primary', name: 'primary', resolvedType: 'COLOR',
                variableCollectionId: mock.unmanagedCollection.id,
                getSharedPluginData(namespace: string, key: string) {
                    return namespace === 'ouroforge' && key === 'managedToken'
                        ? JSON.stringify({ adapterId: 'shadcn', tokenId: 'shadcn:primary', schemaVersion: 1 })
                        : '';
                },
            },
            {
                id: 'renamed-imposter', name: 'primary', resolvedType: 'COLOR',
                variableCollectionId: 'col-ouroboros',
                getSharedPluginData(namespace: string, key: string) {
                    return namespace === 'ouroforge' && key === 'managedToken'
                        ? JSON.stringify({ adapterId: 'ouroboros', tokenId: 'ouroboros:not-primary', schemaVersion: 1 })
                        : '';
                },
            },
        );

        const selected = OUROBOROS_COMPONENT_RECIPES.filter(recipe => recipe.id === 'button');
        await syncOuroborosComponents({ recipes: selected });

        const buttonSet = mock.page.findAllWithCriteria({ types: ['COMPONENT_SET'] })
            .find((node: any) => node.name === 'Ouroboros/atoms/Button');
        expect(buttonSet.children[0].fills[0].boundVariables.color.id).toBe('var-primary');
    });
});
