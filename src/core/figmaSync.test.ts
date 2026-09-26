// Idempotence + integration tests for the sync engine against an in-memory
// mock of the Figma variables/styles API.

import { describe, it, expect, beforeEach } from 'vitest';
import { importThemeTokens, type ThemeImportOptions } from './figmaSync';

// ─── Minimal in-memory figma mock ────────────────────────────────────────────

interface MockVariable {
    id: string;
    name: string;
    variableCollectionId: string;
    resolvedType: string;
    valuesByMode: Record<string, unknown>;
    scopes: string[];
    codeSyntax: Record<string, string>;
    sharedData: Record<string, string>;
    setValueForMode(modeId: string, value: unknown): void;
    setVariableCodeSyntax(platform: string, value: string): void;
    getSharedPluginData(namespace: string, key: string): string;
    setSharedPluginData(namespace: string, key: string, value: string): void;
}

function createFigmaMock(opts?: {
    maxModes?: number;
    missingFontFamily?: string;
    addModeError?: Error;
}) {
    let idCounter = 0;
    const collections: any[] = [];
    const variables: MockVariable[] = [];
    const effectStyles: any[] = [];
    const textStyles: any[] = [];

    const figmaMock = {
        variables: {
            async getLocalVariableCollectionsAsync() { return collections; },
            async getLocalVariablesAsync(_type?: string) {
                return _type ? variables.filter(v => v.resolvedType === _type) : variables;
            },
            createVariableCollection(name: string) {
                const col = {
                    id: 'col-' + (++idCounter),
                    name,
                    modes: [{ name: 'Mode 1', modeId: 'mode-' + (++idCounter) }],
                    sharedData: {} as Record<string, string>,
                    getSharedPluginData(namespace: string, key: string) { return col.sharedData[`${namespace}:${key}`] || ''; },
                    setSharedPluginData(namespace: string, key: string, value: string) { col.sharedData[`${namespace}:${key}`] = value; },
                    renameMode(modeId: string, newName: string) {
                        const m = col.modes.find((mm: any) => mm.modeId === modeId);
                        if (m) m.name = newName;
                    },
                    addMode(name2: string) {
                        if (opts?.addModeError) throw opts.addModeError;
                        const maxModes = opts?.maxModes ?? Infinity;
                        if (col.modes.length >= maxModes) {
                            throw new Error('in addMode: Limited to ' + maxModes + ' modes only');
                        }
                        const modeId = 'mode-' + (++idCounter);
                        col.modes.push({ name: name2, modeId });
                        return modeId;
                    },
                };
                collections.push(col);
                return col;
            },
            createVariable(name: string, collection: any, type: string) {
                const v: MockVariable = {
                    id: 'var-' + (++idCounter),
                    name,
                    variableCollectionId: collection.id,
                    resolvedType: type,
                    valuesByMode: {},
                    scopes: [],
                    codeSyntax: {},
                    sharedData: {} as Record<string, string>,
                    setValueForMode(modeId, value) { v.valuesByMode[modeId] = value; },
                    setVariableCodeSyntax(platform, value) { v.codeSyntax[platform] = value; },
                    getSharedPluginData(namespace, key) { return v.sharedData[`${namespace}:${key}`] || ''; },
                    setSharedPluginData(namespace, key, value) { v.sharedData[`${namespace}:${key}`] = value; },
                };
                variables.push(v);
                return v;
            },
        },
        async getLocalEffectStylesAsync() { return effectStyles; },
        createEffectStyle() {
            const sharedData: Record<string, string> = {};
            const s = {
                id: 'eff-' + (++idCounter), name: '', effects: [] as unknown[],
                getSharedPluginData(namespace: string, key: string) { return sharedData[`${namespace}:${key}`] || ''; },
                setSharedPluginData(namespace: string, key: string, value: string) { sharedData[`${namespace}:${key}`] = value; },
            };
            effectStyles.push(s);
            return s;
        },
        async getLocalTextStylesAsync() { return textStyles; },
        createTextStyle() {
            const sharedData: Record<string, string> = {};
            const s: any = {
                id: 'txt-' + (++idCounter), name: '', fontName: null, fontSize: 0,
                boundVariables: {},
                setBoundVariable(field: string, variable: MockVariable) { s.boundVariables[field] = variable.id; },
                getSharedPluginData(namespace: string, key: string) { return sharedData[`${namespace}:${key}`] || ''; },
                setSharedPluginData(namespace: string, key: string, value: string) { sharedData[`${namespace}:${key}`] = value; },
            };
            textStyles.push(s);
            return s;
        },
        async loadFontAsync(font: { family?: string }) {
            if (opts?.missingFontFamily && font.family === opts.missingFontFamily) throw new Error('missing font');
        },
    };

    return { figmaMock, collections, variables, effectStyles, textStyles };
}

const baseOptions = {
    importColors: true, importSpacing: false, importRadius: true, importShadows: true,
    importBlur: false, importTypography: true, importBreakpoints: false,
    importContainers: false, importFontWeights: false, importTracking: false,
    importLeading: false, importMaxWidth: false, importBorderWidth: false,
    importOpacity: false, importSkew: false,
    importMotion: false, importGraph: false, importLayout: false,
};

function themeOptions(): ThemeImportOptions {
    return {
        ...baseOptions,
        collectionName: 'Shadcn',
        primitiveCollectionName: 'TailwindCSS',
        adapterId: 'shadcn',
        sourceVersion: 'test-revision',
        lightTokens: {
            '--background': 'oklch(1 0 0)',
            '--primary': 'oklch(0.205 0 0)',
            '--radius': '0.625rem',
        },
        darkTokens: {
            '--background': 'oklch(0.145 0 0)',
            '--primary': 'oklch(0.922 0 0)',
        },
        extras: {
            floats: [{ name: 'typography/size/display', value: 96, scopes: ['FONT_SIZE'] }],
            stateColors: [{ name: 'state/ring-50', light: 'rgba(163,163,163,0.5)', dark: 'rgba(115,115,115,0.5)', codeSyntax: '--ring 50%' }],
            strings: [{ name: 'typography/font-sans', value: 'Geist', scopes: ['FONT_FAMILY'] }],
            shadows: [{ name: 'shadow/xs', value: '0 1px 2px 0 rgb(0 0 0 / 0.05)' }],
            textStyles: [{
                name: 'mui/h1', family: 'Inter', fontSize: 96, fontWeight: 300, lineHeight: 1.167,
                bindings: { fontSize: 'typography/size/display' },
            }],
        },
    };
}

describe('importThemeTokens against figma mock', () => {
    let mock: ReturnType<typeof createFigmaMock>;

    beforeEach(() => {
        mock = createFigmaMock();
        (globalThis as Record<string, unknown>).figma = mock.figmaMock;
    });

    it('creates Light/Dark modes, color + float variables, radius scale, extras', async () => {
        await importThemeTokens(themeOptions());

        const col = mock.collections.find(c => c.name === 'Shadcn');
        expect(col).toBeDefined();
        expect(col.modes.map((m: any) => m.name)).toEqual(['Light', 'Dark']);

        const names = mock.variables.map(v => v.name);
        expect(names).toContain('background');
        expect(names).toContain('primary');
        expect(names).toContain('radius');
        // derived scale
        for (const s of ['radius-sm', 'radius-md', 'radius-lg', 'radius-xl', 'radius-2xl', 'radius-3xl', 'radius-4xl']) {
            expect(names).toContain(s);
        }
        const radiusMd = mock.variables.find(v => v.name === 'radius-md')!;
        expect(Object.values(radiusMd.valuesByMode)[0]).toBe(8);

        // extras
        expect(names).toContain('state/ring-50');
        expect(names).toContain('typography/font-sans');
        expect(mock.effectStyles.find(s => s.name === 'shadow/xs')).toBeDefined();
        expect(mock.textStyles.find(s => s.name === 'mui/h1')).toBeDefined();
        expect(mock.textStyles.find(s => s.name === 'mui/h1').boundVariables.fontSize).toBeDefined();

        // code syntax everywhere
        const bg = mock.variables.find(v => v.name === 'background')!;
        expect(bg.codeSyntax['WEB']).toBe('var(--background)');
        expect(JSON.parse(bg.getSharedPluginData('ouroforge', 'managedToken'))).toMatchObject({
            adapterId: 'shadcn', tokenId: 'shadcn:background', schemaVersion: 1,
        });
        expect(JSON.parse(col.getSharedPluginData('ouroforge', 'managedCollection'))).toMatchObject({
            adapterId: 'shadcn', sourceVersion: 'test-revision', schemaVersion: 1,
        });
    });

    it('is idempotent: re-importing creates zero duplicates', async () => {
        await importThemeTokens(themeOptions());
        const afterFirst = {
            collections: mock.collections.length,
            variables: mock.variables.length,
            effects: mock.effectStyles.length,
            texts: mock.textStyles.length,
        };

        await importThemeTokens(themeOptions());

        expect(mock.collections.length).toBe(afterFirst.collections);
        expect(mock.variables.length).toBe(afterFirst.variables);
        expect(mock.effectStyles.length).toBe(afterFirst.effects);
        expect(mock.textStyles.length).toBe(afterFirst.texts);
    });

    it('recovers renamed managed collections and variables by immutable metadata', async () => {
        await importThemeTokens(themeOptions());
        mock.collections[0].name = 'Renamed collection';
        mock.variables.find(v => v.name === 'background')!.name = 'Renamed background';

        await importThemeTokens(themeOptions());

        expect(mock.collections).toHaveLength(1);
        expect(mock.collections[0].name).toBe('Shadcn');
        expect(mock.variables.filter(v => v.name === 'background')).toHaveLength(1);
    });

    it('does not adopt an unmanaged collection that collides by display name', async () => {
        const userCollection = mock.figmaMock.variables.createVariableCollection('Shadcn');

        await importThemeTokens(themeOptions());

        expect(mock.collections).toHaveLength(2);
        expect(userCollection.name).toBe('Shadcn');
        expect(userCollection.getSharedPluginData('ouroforge', 'managedCollection')).toBe('');
        const managed = mock.collections.find(collection =>
            JSON.parse(collection.getSharedPluginData('ouroforge', 'managedCollection') || '{}').adapterId === 'shadcn'
        );
        expect(managed).toBeDefined();
        expect(managed.id).not.toBe(userCollection.id);
    });

    it('does not adopt a colliding unmanaged variable and binds text styles only to the managed token', async () => {
        const collection = mock.figmaMock.variables.createVariableCollection('Renamed managed collection');
        collection.setSharedPluginData('ouroforge', 'managedCollection', JSON.stringify({
            adapterId: 'shadcn', sourceVersion: 'legacy', schemaVersion: 1,
        }));
        const userVariable = mock.figmaMock.variables.createVariable('typography/size/display', collection, 'FLOAT');
        userVariable.setValueForMode(collection.modes[0].modeId, 777);

        await importThemeTokens(themeOptions());

        const collisions = mock.variables.filter(variable =>
            variable.variableCollectionId === collection.id && variable.name === 'typography/size/display'
        );
        expect(collisions).toHaveLength(2);
        expect(userVariable.valuesByMode[collection.modes[0].modeId]).toBe(777);
        expect(userVariable.getSharedPluginData('ouroforge', 'managedToken')).toBe('');
        const managedVariable = collisions.find(variable =>
            JSON.parse(variable.getSharedPluginData('ouroforge', 'managedToken') || '{}').tokenId
                === 'shadcn:typography/size/display'
        )!;
        const managedStyle = mock.textStyles.find(style =>
            JSON.parse(style.getSharedPluginData('ouroforge', 'managedStyle') || '{}').styleId
                === 'shadcn:text:mui/h1'
        );
        expect(managedStyle.boundVariables.fontSize).toBe(managedVariable.id);
        expect(managedStyle.boundVariables.fontSize).not.toBe(userVariable.id);
    });

    it('keeps colliding unmanaged styles untouched and preserves managed style identity across renames', async () => {
        const userTextStyle = mock.figmaMock.createTextStyle();
        userTextStyle.name = 'mui/h1';
        userTextStyle.fontSize = 777;
        const userEffectStyle = mock.figmaMock.createEffectStyle();
        userEffectStyle.name = 'shadow/xs';
        userEffectStyle.effects = ['user-effect'];

        await importThemeTokens(themeOptions());

        expect(mock.textStyles).toHaveLength(2);
        expect(mock.effectStyles).toHaveLength(2);
        expect(userTextStyle.fontSize).toBe(777);
        expect(userEffectStyle.effects).toEqual(['user-effect']);
        expect(userTextStyle.getSharedPluginData('ouroforge', 'managedStyle')).toBe('');
        expect(userEffectStyle.getSharedPluginData('ouroforge', 'managedStyle')).toBe('');

        const managedTextStyle = mock.textStyles.find(style => style !== userTextStyle)!;
        const managedEffectStyle = mock.effectStyles.find(style => style !== userEffectStyle)!;
        expect(JSON.parse(managedTextStyle.getSharedPluginData('ouroforge', 'managedStyle'))).toMatchObject({
            adapterId: 'shadcn', kind: 'text', styleId: 'shadcn:text:mui/h1', schemaVersion: 1,
        });
        expect(JSON.parse(managedEffectStyle.getSharedPluginData('ouroforge', 'managedStyle'))).toMatchObject({
            adapterId: 'shadcn', kind: 'effect', styleId: 'shadcn:effect:shadow/xs', schemaVersion: 1,
        });
        const managedTextId = managedTextStyle.id;
        const managedEffectId = managedEffectStyle.id;
        managedTextStyle.name = 'User renamed managed text';
        managedEffectStyle.name = 'User renamed managed effect';

        await importThemeTokens(themeOptions());

        expect(mock.textStyles).toHaveLength(2);
        expect(mock.effectStyles).toHaveLength(2);
        expect(mock.textStyles.find(style => style.id === managedTextId)?.name).toBe('mui/h1');
        expect(mock.effectStyles.find(style => style.id === managedEffectId)?.name).toBe('shadow/xs');
        expect(userTextStyle.fontSize).toBe(777);
        expect(userEffectStyle.effects).toEqual(['user-effect']);
    });

    it('migrates only a provably plugin-owned legacy style to stable identity metadata', async () => {
        const userStyle = mock.figmaMock.createTextStyle();
        userStyle.name = 'mui/h1';
        const legacyStyle = mock.figmaMock.createTextStyle();
        legacyStyle.name = 'mui/h1';
        legacyStyle.setSharedPluginData('ouroforge', 'managedStyle', JSON.stringify({
            adapterId: 'shadcn', kind: 'text', schemaVersion: 1,
        }));

        await importThemeTokens(themeOptions());

        expect(mock.textStyles).toHaveLength(2);
        expect(userStyle.getSharedPluginData('ouroforge', 'managedStyle')).toBe('');
        expect(JSON.parse(legacyStyle.getSharedPluginData('ouroforge', 'managedStyle'))).toMatchObject({
            adapterId: 'shadcn', kind: 'text', styleId: 'shadcn:text:mui/h1', schemaVersion: 1,
        });
    });

    it('honors theme category switches for colors, typography, shadows and radius', async () => {
        const options = themeOptions();
        options.importColors = false;
        options.importTypography = false;
        options.importShadows = false;
        options.importRadius = false;

        await importThemeTokens(options);

        expect(mock.variables).toHaveLength(0);
        expect(mock.effectStyles).toHaveLength(0);
        expect(mock.textStyles).toHaveLength(0);
    });

    it('keeps motion, graph, and layout metrics independent from spacing', async () => {
        const options = themeOptions();
        options.importSpacing = false;
        options.importMotion = true;
        options.importGraph = false;
        options.importLayout = true;
        options.extras = {
            floats: [
                { name: 'spacing/4', value: 16, scopes: ['GAP'] },
                { name: 'motion/duration/fast', value: 0.1, scopes: [] },
                { name: 'graph/grid-spacing', value: 28, scopes: ['GAP'] },
                { name: 'layout/window/default-width', value: 1280, scopes: ['WIDTH_HEIGHT'] },
                { name: 'control/height/md', value: 32, scopes: ['WIDTH_HEIGHT'] },
            ],
        };

        await importThemeTokens(options);

        const names = mock.variables.map(variable => variable.name);
        expect(names).not.toContain('spacing/4');
        expect(names).toContain('motion/duration/fast');
        expect(names).not.toContain('graph/grid-spacing');
        expect(names).toContain('layout/window/default-width');
        expect(names).toContain('control/height/md');
    });

    it('fails before mutation when a required Ouroboros font is unavailable', async () => {
        const missing = createFigmaMock({ missingFontFamily: 'Iosevka' });
        (globalThis as Record<string, unknown>).figma = missing.figmaMock;
        const options = themeOptions();
        options.importTypography = true;
        options.extras!.textStyles = [
            { name: 'ouroboros/display', family: 'Iosevka', fontSize: 30, fontWeight: 700 },
        ];

        await expect(importThemeTokens(options)).rejects.toThrow('Missing required Ouroboros font');
        expect(missing.collections).toHaveLength(0);
        expect(missing.variables).toHaveLength(0);
    });

    it('sets both mode values for colors present in both themes', async () => {
        await importThemeTokens(themeOptions());
        const primary = mock.variables.find(v => v.name === 'primary')!;
        expect(Object.keys(primary.valuesByMode)).toHaveLength(2);
    });

    it('degrades to Light-only on Free/Starter files (addMode plan limit)', async () => {
        const limited = createFigmaMock({ maxModes: 1 });
        (globalThis as Record<string, unknown>).figma = limited.figmaMock;

        const info = await importThemeTokens(themeOptions());

        // Import succeeded despite the plan limit and reported it
        expect(info.modeLimited).toBe(true);

        // Single mode, renamed Light, with light values only
        const col = limited.collections.find(c => c.name === 'Shadcn');
        expect(col.modes).toHaveLength(1);
        expect(col.modes[0].name).toBe('Light');

        const primary = limited.variables.find(v => v.name === 'primary')!;
        expect(Object.keys(primary.valuesByMode)).toHaveLength(1);
        const light = primary.valuesByMode[col.modes[0].modeId] as { r: number };
        // oklch(0.205 0 0) light value, not the dark 0.922
        expect(Math.round(light.r * 255)).toBe(23);

        // Radius scale, extras and styles still created in the single mode
        expect(limited.variables.find(v => v.name === 'radius-md')).toBeDefined();
        expect(limited.variables.find(v => v.name === 'state/ring-50')).toBeDefined();
        expect(limited.effectStyles.find(s => s.name === 'shadow/xs')).toBeDefined();

        // Idempotent under the limit too
        const count = limited.variables.length;
        await importThemeTokens(themeOptions());
        expect(limited.variables.length).toBe(count);
    });

    it('does not misreport unrelated addMode failures as a plan limit', async () => {
        const broken = createFigmaMock({ addModeError: new Error('addMode failed: document is unavailable') });
        (globalThis as Record<string, unknown>).figma = broken.figmaMock;

        await expect(importThemeTokens(themeOptions())).rejects.toThrow('document is unavailable');
        expect(broken.variables).toHaveLength(0);
    });

    it('adds Dark values idempotently when an existing Light-only file gains mode support', async () => {
        const plan = { maxModes: 1 };
        const upgraded = createFigmaMock(plan);
        (globalThis as Record<string, unknown>).figma = upgraded.figmaMock;

        const lightOnly = await importThemeTokens(themeOptions());
        const variableCount = upgraded.variables.length;
        expect(lightOnly.modeLimited).toBe(true);

        plan.maxModes = 2;
        const complete = await importThemeTokens(themeOptions());

        expect(complete.modeLimited).toBe(false);
        expect(complete.collection.modes.map((mode: { name: string }) => mode.name)).toEqual(['Light', 'Dark']);
        expect(upgraded.variables).toHaveLength(variableCount);
        expect(Object.keys(upgraded.variables.find(variable => variable.name === 'primary')!.valuesByMode))
            .toHaveLength(2);
    });
});
