import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImportPayload, MainMessage, UIMessage } from './shared/messaging';

type DataNode = ReturnType<typeof pluginData>;

function pluginData(initial: Record<string, string> = {}) {
    const data = new Map(Object.entries(initial));
    return {
        getPluginData(key: string) { return data.get(`private:${key}`) || ''; },
        setPluginData(key: string, value: string) { data.set(`private:${key}`, value); },
        getSharedPluginData(namespace: string, key: string) { return data.get(`${namespace}:${key}`) || ''; },
        setSharedPluginData(namespace: string, key: string, value: string) { data.set(`${namespace}:${key}`, value); },
    };
}

function managedCollectionData(sourceVersion = 'c390d7deffa7955e28b2e3bcb9c22ac0899a261b') {
    return JSON.stringify({ adapterId: 'ouroboros', sourceVersion, schemaVersion: 1 });
}

function managedTokenData(tokenId: string, sourcePath?: string) {
    return JSON.stringify({ adapterId: 'ouroboros', tokenId: `ouroboros:${tokenId}`, sourcePath, schemaVersion: 1 });
}

function managedStyleData(kind: 'text' | 'effect') {
    return JSON.stringify({ adapterId: 'ouroboros', kind, schemaVersion: 1 });
}

interface FigmaHarness {
    figma: any;
    messages: MainMessage[];
    collections: any[];
    variables: any[];
    components: any[];
    textStyles: any[];
    effectStyles: any[];
    createCollection(name: string, managed?: boolean): any;
    createVariable(collection: any, name: string, type: VariableResolvedDataType, tokenId?: string): any;
}

function createHarness(): FigmaHarness {
    const messages: MainMessage[] = [];
    const collections: any[] = [];
    const variables: any[] = [];
    const components: any[] = [];
    const textStyles: any[] = [];
    const effectStyles: any[] = [];
    let nextId = 1;

    const createPageNode = (name: string) => {
        const page = pluginData() as DataNode & any;
        page.id = `page-${nextId++}`;
        page.type = 'PAGE';
        page.name = name;
        page.children = [];
        page.loadAsync = async () => {};
        page.appendChild = (child: any) => {
            child.parent = page;
            if (!page.children.includes(child)) page.children.push(child);
        };
        page.findAllWithCriteria = ({ types }: { types: string[] }) => {
            const found: any[] = [];
            const visit = (node: any) => {
                for (const child of node.children || []) {
                    if (types.includes(child.type)) found.push(child);
                    visit(child);
                }
            };
            visit(page);
            return found;
        };
        return page;
    };
    const initialPage = createPageNode('Page 1');
    const root = { type: 'DOCUMENT', children: [initialPage] };

    const createCollection = (name: string, managed = false) => {
        const shared: Record<string, string> = managed
            ? { 'ouroforge:managedCollection': managedCollectionData() }
            : {};
        const node = pluginData(shared) as DataNode & any;
        node.id = `collection-${nextId++}`;
        node.name = name;
        node.modes = [{ name: 'Mode 1', modeId: `mode-${nextId++}` }];
        node.addMode = (modeName: string) => {
            const id = `mode-${nextId++}`;
            node.modes.push({ name: modeName, modeId: id });
            return id;
        };
        node.renameMode = (id: string, modeName: string) => {
            const mode = node.modes.find((candidate: any) => candidate.modeId === id);
            if (mode) mode.name = modeName;
        };
        node.remove = () => {
            const index = collections.indexOf(node);
            if (index >= 0) collections.splice(index, 1);
        };
        collections.push(node);
        return node;
    };

    const createVariable = (
        collection: any,
        name: string,
        type: VariableResolvedDataType,
        tokenId?: string,
    ) => {
        const shared: Record<string, string> = tokenId
            ? { 'ouroforge:managedToken': managedTokenData(tokenId) }
            : {};
        const node = pluginData(shared) as DataNode & any;
        node.id = `variable-${nextId++}`;
        node.name = name;
        node.variableCollectionId = collection.id;
        node.resolvedType = type;
        node.valuesByMode = {};
        node.scopes = [];
        node.codeSyntax = {};
        node.description = '';
        node.setValueForMode = (modeId: string, value: unknown) => { node.valuesByMode[modeId] = value; };
        node.setVariableCodeSyntax = (platform: string, value: string) => { node.codeSyntax[platform] = value; };
        variables.push(node);
        return node;
    };

    const figma: any = {
        root,
        showUI: vi.fn(),
        closePlugin: vi.fn(),
        ui: {
            onmessage: undefined as undefined | ((message: UIMessage) => void),
            postMessage: vi.fn((message: MainMessage) => { messages.push(message); }),
        },
        variables: {
            async getLocalVariableCollectionsAsync() { return collections; },
            createVariableCollection: (name: string) => createCollection(name),
            async getLocalVariablesAsync(type?: VariableResolvedDataType) {
                return type ? variables.filter(variable => variable.resolvedType === type) : variables;
            },
            createVariable: (name: string, collection: any, type: VariableResolvedDataType) =>
                createVariable(collection, name, type),
            setBoundVariableForPaint: (paint: unknown) => paint,
        },
        currentPage: initialPage,
        async loadAllPagesAsync() {},
        createPage() {
            const page = createPageNode('Page');
            root.children.push(page);
            return page;
        },
        async getLocalTextStylesAsync() { return textStyles; },
        async getLocalEffectStylesAsync() { return effectStyles; },
        async getLocalGridStylesAsync() { return []; },
        async loadFontAsync() {},
        createTextStyle: vi.fn(),
        createEffectStyle: vi.fn(),
        createGridStyle: vi.fn(),
    };

    return {
        figma,
        messages,
        collections,
        variables,
        components,
        textStyles,
        effectStyles,
        createCollection,
        createVariable,
    };
}

async function loadPlugin(harness: FigmaHarness) {
    vi.stubGlobal('figma', harness.figma);
    vi.stubGlobal('__html__', '<html></html>');
    await import('./code');
    await vi.waitFor(() => expect(harness.messages.some(message => message.type === 'CAPABILITIES')).toBe(true));
    expect(harness.figma.ui.onmessage).toBeTypeOf('function');
}

async function sendAndWait<T extends MainMessage['type']>(
    harness: FigmaHarness,
    message: UIMessage,
    responseType: T,
    previousCount = harness.messages.filter(candidate => candidate.type === responseType).length,
): Promise<Extract<MainMessage, { type: T }>> {
    harness.figma.ui.onmessage(message);
    await vi.waitFor(() => {
        expect(harness.messages.filter(candidate => candidate.type === responseType).length).toBeGreaterThan(previousCount);
    });
    const matches = harness.messages.filter(
        (candidate): candidate is Extract<MainMessage, { type: T }> => candidate.type === responseType,
    );
    return matches[matches.length - 1];
}

const basePayload: ImportPayload = {
    adapterIds: ['ouroboros'],
    collectionName: 'Ouroboros',
    categories: ['colors'],
};

function addManagedComponent(harness: FigmaHarness, id = 'button') {
    const data = pluginData() as DataNode & any;
    data.type = 'COMPONENT';
    data.name = 'Ouroboros/atoms/Button';
    data.width = 180;
    data.height = 32;
    data.visible = true;
    data.opacity = 1;
    data.layoutMode = 'HORIZONTAL';
    data.itemSpacing = 8;
    data.paddingTop = 8;
    data.paddingRight = 12;
    data.paddingBottom = 8;
    data.paddingLeft = 12;
    data.cornerRadius = 6;
    data.fills = [];
    data.strokes = [];
    data.strokeWeight = 1;
    data.boundVariables = {};
    data.children = [];
    data.setPluginData('ouroforge:recipe', id);
    data.setPluginData('ouroforge:variant', 'Variant=Default');
    data.setPluginData('ouroforge:fidelity', 'visual-facsimile');
    data.setPluginData('ouroforge:rustPath', 'ouroboros_ui::atoms::Button');
    harness.components.push(data);
    harness.figma.currentPage.appendChild(data);
    return data;
}

function addManagedComponentSetWithGuardedVariant(harness: FigmaHarness) {
    const componentSet = pluginData() as DataNode & any;
    Object.assign(componentSet, {
        type: 'COMPONENT_SET',
        name: 'Ouroboros/atoms/Button',
        width: 320,
        height: 120,
        visible: true,
        opacity: 1,
        layoutMode: 'NONE',
        itemSpacing: 0,
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
        cornerRadius: 0,
        fills: [],
        strokes: [],
        strokeWeight: 0,
        boundVariables: {},
        componentPropertyDefinitions: { Variant: { type: 'VARIANT', defaultValue: 'Default' } },
        componentPropertyReferences: null,
        children: [],
    });
    componentSet.setPluginData('ouroforge:recipe', 'button');
    componentSet.setPluginData('ouroforge:fidelity', 'visual-facsimile');
    componentSet.setPluginData('ouroforge:rustPath', 'ouroboros_ui::atoms::Button');

    const variant = pluginData() as DataNode & any;
    Object.assign(variant, {
        type: 'COMPONENT',
        name: 'Variant=Default, State=Default',
        parent: componentSet,
        x: 24,
        y: 24,
        width: 180,
        height: 32,
        visible: true,
        opacity: 1,
        layoutMode: 'HORIZONTAL',
        itemSpacing: 8,
        paddingTop: 8,
        paddingRight: 12,
        paddingBottom: 8,
        paddingLeft: 12,
        cornerRadius: 6,
        fills: [],
        strokes: [],
        strokeWeight: 1,
        boundVariables: {},
        componentPropertyReferences: null,
        children: [],
    });
    variant.setPluginData('ouroforge:recipe', 'button');
    variant.setPluginData('ouroforge:variant', 'State=Default, Variant=Default');
    let forbiddenReads = 0;
    Object.defineProperty(variant, 'componentPropertyDefinitions', {
        get() {
            forbiddenReads++;
            throw new Error('Can only get component property definitions of a component set or non-variant component');
        },
    });
    componentSet.children.push(variant);
    harness.components.push(componentSet, variant);
    harness.figma.currentPage.appendChild(componentSet);
    return { forbiddenReads: () => forbiddenReads };
}

describe.sequential('code.ts message orchestration', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        vi.resetModules();
    });

    it('reuses the reviewed source and accepts a valid one-use apply', async () => {
        const harness = createHarness();
        const { getAdapter } = await import('./adapters/registry');
        const adapter = getAdapter('ouroboros')!;
        const fetch = vi.spyOn(adapter, 'fetchAndParse');
        await loadPlugin(harness);

        const diff = await sendAndWait(harness, { type: 'REQUEST_DIFF', payload: basePayload }, 'DIFF_RESULT');
        expect(diff.reviewId).toBeTruthy();
        expect(fetch).toHaveBeenCalledTimes(1);
        fetch.mockRejectedValue(new Error('must not refetch during apply'));

        const complete = await sendAndWait(harness, {
            type: 'IMPORT_TOKENS', payload: basePayload, reviewId: diff.reviewId,
        }, 'IMPORT_COMPLETE');
        expect(complete.sources[0].source?.version).toMatch(/^[0-9a-f]{40}$/);
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(harness.variables.length).toBeGreaterThan(0);
    });

    it('rejects missing and changed reviews, then allows the exact reviewed payload', async () => {
        const harness = createHarness();
        await loadPlugin(harness);
        const diff = await sendAndWait(harness, { type: 'REQUEST_DIFF', payload: basePayload }, 'DIFF_RESULT');

        let errors = harness.messages.filter(message => message.type === 'IMPORT_ERROR').length;
        const missing = await sendAndWait(harness, {
            type: 'IMPORT_TOKENS', payload: basePayload, reviewId: '',
        }, 'IMPORT_ERROR', errors);
        expect(missing.error).toMatch(/not been reviewed|expired/);

        errors++;
        const changed = await sendAndWait(harness, {
            type: 'IMPORT_TOKENS',
            payload: { ...basePayload, categories: ['colors', 'spacing'] },
            reviewId: diff.reviewId,
        }, 'IMPORT_ERROR', errors);
        expect(changed.error).toMatch(/settings changed/);

        await sendAndWait(harness, {
            type: 'IMPORT_TOKENS', payload: basePayload, reviewId: diff.reviewId,
        }, 'IMPORT_COMPLETE');
    });

    it('rejects a stale variable snapshot', async () => {
        const harness = createHarness();
        const collection = harness.createCollection('Ouroboros', true);
        collection.modes[0].name = 'Light';
        const variable = harness.createVariable(collection, 'user/change', 'FLOAT', 'spacing/4');
        variable.setValueForMode(collection.modes[0].modeId, 1);
        await loadPlugin(harness);
        const diff = await sendAndWait(harness, { type: 'REQUEST_DIFF', payload: basePayload }, 'DIFF_RESULT');
        variable.setValueForMode(collection.modes[0].modeId, 2);

        harness.figma.ui.onmessage({ type: 'IMPORT_TOKENS', payload: basePayload, reviewId: diff.reviewId });
        await vi.waitFor(() => expect(
            harness.messages.some(message => message.type === 'IMPORT_ERROR' || message.type === 'IMPORT_COMPLETE'),
        ).toBe(true));
        const error = harness.messages.find(message => message.type === 'IMPORT_ERROR');
        expect(error, JSON.stringify(harness.messages)).toBeDefined();
        if (!error || error.type !== 'IMPORT_ERROR') throw new Error('Expected IMPORT_ERROR');
        expect(error.error).toMatch(/collection "Ouroboros" changed after review/);
        expect(variable.valuesByMode[collection.modes[0].modeId]).toBe(2);
    });

    it('rejects a stale component snapshot', async () => {
        const harness = createHarness();
        await loadPlugin(harness);
        const payload = { ...basePayload, categories: ['colors', 'components'] as ImportPayload['categories'] };
        const diff = await sendAndWait(harness, { type: 'REQUEST_DIFF', payload }, 'DIFF_RESULT');
        const activePage = harness.figma.currentPage;
        const libraryPage = harness.figma.createPage();
        libraryPage.name = 'Ouroboros UI Library';
        harness.figma.currentPage = libraryPage;
        addManagedComponent(harness);
        harness.figma.currentPage = activePage;

        const error = await sendAndWait(harness, {
            type: 'IMPORT_TOKENS', payload, reviewId: diff.reviewId,
        }, 'IMPORT_ERROR');
        expect(error.error).toMatch(/components changed after review/);
    });

    it('never reads component property definitions from a component-set variant', async () => {
        const harness = createHarness();
        const guarded = addManagedComponentSetWithGuardedVariant(harness);
        await loadPlugin(harness);
        const payload = { ...basePayload, categories: ['colors', 'components'] as ImportPayload['categories'] };

        const diff = await sendAndWait(harness, { type: 'REQUEST_DIFF', payload }, 'DIFF_RESULT');

        expect(diff.diffs.some(item => item.collectionName === 'Ouroboros Components')).toBe(true);
        expect(guarded.forbiddenReads()).toBe(0);
    });

    it('allows only one of two concurrent Apply messages to consume a review', async () => {
        const harness = createHarness();
        await loadPlugin(harness);
        const diff = await sendAndWait(harness, { type: 'REQUEST_DIFF', payload: basePayload }, 'DIFF_RESULT');

        harness.figma.ui.onmessage({ type: 'IMPORT_TOKENS', payload: basePayload, reviewId: diff.reviewId });
        harness.figma.ui.onmessage({ type: 'IMPORT_TOKENS', payload: basePayload, reviewId: diff.reviewId });
        await vi.waitFor(() => {
            expect(harness.messages.filter(message => message.type === 'IMPORT_COMPLETE')).toHaveLength(1);
            expect(harness.messages.filter(message => message.type === 'IMPORT_ERROR')).toHaveLength(1);
        });
        expect(harness.messages.find(message => message.type === 'IMPORT_ERROR')).toMatchObject({
            type: 'IMPORT_ERROR',
            error: expect.stringMatching(/not been reviewed|expired/),
        });
    });

    it('assembles a managed-only manifest with aliases, modes, source, styles, effects, and components', async () => {
        const harness = createHarness();
        const collection = harness.createCollection('Ouroboros', true);
        collection.modes[0].name = 'Light';
        collection.modes.push({ name: 'Dark', modeId: 'dark-mode' });
        const lightMode = collection.modes[0].modeId;
        const darkMode = collection.modes[1].modeId;

        const light = harness.createVariable(collection, 'renamed light', 'COLOR', 'primitive/zinc/50');
        light.setValueForMode(lightMode, { r: 250 / 255, g: 250 / 255, b: 250 / 255, a: 1 });
        light.setValueForMode(darkMode, { r: 250 / 255, g: 250 / 255, b: 250 / 255, a: 1 });
        const dark = harness.createVariable(collection, 'renamed dark', 'COLOR', 'primitive/zinc/950');
        dark.setValueForMode(lightMode, { r: 9 / 255, g: 9 / 255, b: 11 / 255, a: 1 });
        dark.setValueForMode(darkMode, { r: 9 / 255, g: 9 / 255, b: 11 / 255, a: 1 });
        const background = harness.createVariable(collection, 'renamed background', 'COLOR', 'background');
        background.setValueForMode(lightMode, { type: 'VARIABLE_ALIAS', id: light.id });
        background.setValueForMode(darkMode, { type: 'VARIABLE_ALIAS', id: dark.id });
        const size = harness.createVariable(collection, 'renamed size', 'FLOAT', 'typography/size/base');
        size.scopes = ['FONT_SIZE'];
        size.setValueForMode(lightMode, 14);
        size.setValueForMode(darkMode, 14);
        const shadowColor = harness.createVariable(collection, 'shadow color', 'COLOR', 'shadow/color');
        shadowColor.setValueForMode(lightMode, { r: 0, g: 0, b: 0, a: 0.2 });
        shadowColor.setValueForMode(darkMode, { r: 0, g: 0, b: 0, a: 0.5 });
        const userVariable = harness.createVariable(collection, 'user/private', 'FLOAT');
        userVariable.setValueForMode(lightMode, 999);

        const textData = pluginData({ 'ouroforge:managedStyle': managedStyleData('text') }) as DataNode & any;
        Object.assign(textData, {
            name: 'ouroboros/body',
            fontName: { family: 'Iosevka Light', style: 'Regular' },
            fontSize: 14,
            lineHeight: { unit: 'PIXELS', value: 20.3 },
            letterSpacing: { unit: 'PIXELS', value: 0.6 },
            boundVariables: { fontSize: { type: 'VARIABLE_ALIAS', id: size.id } },
        });
        harness.textStyles.push(textData);
        const ignoredText = pluginData() as DataNode & any;
        Object.assign(ignoredText, textData, pluginData(), { name: 'user/style' });
        harness.textStyles.push(ignoredText);

        const effectData = pluginData({ 'ouroforge:managedStyle': managedStyleData('effect') }) as DataNode & any;
        Object.assign(effectData, {
            name: 'ouroboros/shadow/sm',
            effects: [{
                type: 'DROP_SHADOW',
                color: { r: 0, g: 0, b: 0, a: 0.2 },
                offset: { x: 0, y: 1 },
                radius: 2,
                spread: 0,
                visible: true,
                blendMode: 'NORMAL',
                boundVariables: { color: { type: 'VARIABLE_ALIAS', id: shadowColor.id } },
            }],
        });
        harness.effectStyles.push(effectData);
        const activePage = harness.figma.currentPage;
        const libraryPage = harness.figma.createPage();
        libraryPage.name = 'Ouroboros UI Library';
        harness.figma.currentPage = libraryPage;
        addManagedComponent(harness);
        harness.figma.currentPage = activePage;

        await loadPlugin(harness);
        const result = await sendAndWait(harness, { type: 'EXPORT_TOKENS' }, 'EXPORT_RESULT');
        const manifest = JSON.parse(result.manifest);

        expect(manifest.source.revision).toBe('c390d7deffa7955e28b2e3bcb9c22ac0899a261b');
        expect(manifest.collection.modes).toEqual(['Light', 'Dark']);
        expect(manifest.tokens.map((token: any) => token.path)).not.toContain('user/private');
        expect(manifest.tokens.find((token: any) => token.path === 'background').values).toEqual({
            Light: { alias: 'primitive/zinc/50' },
            Dark: { alias: 'primitive/zinc/950' },
        });
        expect(manifest.styles.text).toEqual([expect.objectContaining({
            name: 'ouroboros/body',
            bindings: { fontSize: 'typography/size/base' },
        })]);
        expect(manifest.styles.effects[0].effects[0].boundVariables.color).toEqual({ alias: 'shadow/color' });
        expect(manifest.components).toEqual([expect.objectContaining({
            id: 'button', rustPath: 'ouroboros_ui::atoms::Button', fidelity: 'visual-facsimile',
        })]);
        expect(manifest.components[0].variants).toEqual([expect.objectContaining({
            key: 'Variant=Default', name: 'Ouroboros/atoms/Button',
            layout: 'HORIZONTAL', width: 180, height: 32, itemSpacing: 8,
            padding: { top: 8, right: 12, bottom: 8, left: 12 },
        })]);
        expect(result.json).not.toContain('user/private');
    });
});
