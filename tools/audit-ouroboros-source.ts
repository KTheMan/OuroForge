#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { ouroborosAdapter, OUROBOROS_COMMIT } from '../src/adapters/ouroborosAdapter';
import { OUROBOROS_COMPONENT_RECIPES } from '../src/adapters/ouroborosComponents';
import { colorsMatch, parseColorValue, type FigmaColor } from '../src/core/colorUtils';
import { parseShadowValue } from '../src/core/parser';

const execFileAsync = promisify(execFile);

function sourceArg(args: string[]): string {
    const index = args.indexOf('--source');
    if (index < 0 || !args[index + 1]) {
        throw new Error('Usage: audit-ouroboros-source --source <ouroboros-ui-checkout>');
    }
    return resolve(args[index + 1]);
}

function exportedNames(source: string): Set<string> {
    const names = new Set<string>();
    for (const match of source.matchAll(/pub\s+use\s+[\s\S]*?;/g)) {
        const statement = match[0];
        const tail = statement.includes('{')
            ? statement.slice(statement.indexOf('{') + 1, statement.lastIndexOf('}'))
            : statement.slice(statement.lastIndexOf('::') + 2, -1);
        for (const part of tail.split(',')) {
            const name = part.trim().split(/\s+as\s+/).pop()?.trim();
            if (name && /^[A-Z][A-Za-z0-9_]*$/.test(name)) names.add(name);
        }
    }
    return names;
}

function pascalCase(moduleName: string): string {
    return moduleName.split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('');
}

function balancedBlock(source: string, openingBrace: number): string | undefined {
    let depth = 0;
    for (let index = openingBrace; index < source.length; index++) {
        if (source[index] === '{') depth++;
        else if (source[index] === '}' && --depth === 0) return source.slice(openingBrace + 1, index);
    }
    return undefined;
}

function hasPublicShow(source: string, typeName: string): boolean {
    const escapedName = typeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const implementation = new RegExp(
        `impl(?:\\s*<[^>{}]*>)?\\s+${escapedName}(?:\\s*<[^>{}]*>)?\\s*\\{`,
        'g',
    );
    for (const match of source.matchAll(implementation)) {
        const openingBrace = match.index + match[0].lastIndexOf('{');
        const body = balancedBlock(source, openingBrace);
        if (body && /pub\s+fn\s+show\b/.test(body)) return true;
    }
    return false;
}

function assertExactSet(label: string, expected: Set<string>, actual: Set<string>): void {
    const missing = [...expected].filter(name => !actual.has(name)).sort();
    const extra = [...actual].filter(name => !expected.has(name)).sort();
    if (missing.length || extra.length) {
        const details = [
            missing.length ? `missing: ${missing.join(', ')}` : '',
            extra.length ? `extra: ${extra.join(', ')}` : '',
        ].filter(Boolean).join('; ');
        throw new Error(`${label} differs from the pinned source (${details}).`);
    }
}

async function sourceComponentInventory(
    sourceRoot: string,
    layer: 'atoms' | 'cells' | 'molecules' | 'organisms' | 'graph',
    moduleSource: string,
    exports: Set<string>,
): Promise<Set<string>> {
    const modules = [...moduleSource.matchAll(/^pub\s+mod\s+([a-z][a-z0-9_]*);/gm)].map(match => match[1]);
    const sources = new Map<string, string>();
    for (const moduleName of modules) {
        sources.set(moduleName, await readFile(resolve(sourceRoot, 'src', layer, `${moduleName}.rs`), 'utf8'));
    }

    if (layer !== 'graph') {
        // A public module is a component boundary in the four standard tiers. Its
        // primary public builder follows the module's snake_case -> PascalCase name.
        // Additional public builders (FieldGroup/FieldSet/etc.) are discovered by
        // their own public show method rather than maintained in a second list.
        const renderables = new Set(modules.map(pascalCase));
        for (const source of sources.values()) {
            for (const match of source.matchAll(/pub\s+struct\s+([A-Z][A-Za-z0-9_]*)\b/g)) {
                if (exports.has(match[1]) && hasPublicShow(source, match[1])) renderables.add(match[1]);
            }
        }
        for (const name of renderables) {
            if (!exports.has(name)) throw new Error(`${layer} component ${name} is not publicly exported by the pinned source.`);
        }
        return renderables;
    }

    // The graph tier also exposes model/state types. UI renderables are the
    // exported builders with a public show entrypoint plus exported frame
    // descriptors consumed by GraphCtx::node.
    const renderables = new Set<string>();
    for (const source of sources.values()) {
        for (const match of source.matchAll(/pub\s+struct\s+([A-Z][A-Za-z0-9_]*)\b/g)) {
            const name = match[1];
            if (exports.has(name) && (hasPublicShow(source, name) || name.endsWith('Frame'))) renderables.add(name);
        }
    }
    return renderables;
}

function numericMap(source: string, inherited: Map<string, number> = new Map()): Map<string, number> {
    const values = new Map(inherited);
    for (const match of source.matchAll(/(?:pub\s+)?const\s+([A-Z][A-Z0-9_]*)\s*:\s*(?:f32|u8|usize)\s*=\s*([^;]+);/g)) {
        const expression = match[2].trim();
        const direct = Number(expression.replace(/_/g, ''));
        const reference = expression.match(/(?:super::core|core)::([A-Z][A-Z0-9_]*)/);
        const value = Number.isFinite(direct) ? direct : reference ? values.get(reference[1]) : undefined;
        if (value !== undefined) values.set(match[1], value);
    }
    return values;
}

function sourceColors(source: string): Map<string, FigmaColor> {
    const colors = new Map<string, FigmaColor>();
    for (const match of source.matchAll(
        /pub\s+const\s+([A-Z][A-Z0-9_]*)\s*:\s*Color32\s*=\s*Color32::from_(rgb|rgba_(?:unmultiplied|premultiplied))\(([^)]+)\);/g
    )) {
        const channels = match[3].split(',').map(value => Number(value.trim()));
        colors.set(match[1], {
            r: channels[0] / 255,
            g: channels[1] / 255,
            b: channels[2] / 255,
            a: match[2] === 'rgb' ? 1 : channels[3] / 255,
        });
    }
    return colors;
}

function primitivePath(constant: string): string {
    return `primitive/${constant.toLowerCase().replace(/_/g, '/')}`;
}

function functionBody(source: string, name: string): string {
    const marker = new RegExp(`pub\\s+fn\\s+${name}\\s*\\([^)]*\\)\\s*->\\s*Self\\s*\\{`, 'm').exec(source);
    if (!marker) throw new Error(`Could not locate Theme::${name}.`);
    const start = marker.index + marker[0].length;
    let depth = 1;
    for (let index = start; index < source.length; index++) {
        if (source[index] === '{') depth++;
        else if (source[index] === '}' && --depth === 0) return source.slice(start, index);
    }
    throw new Error(`Could not parse Theme::${name}.`);
}

function themeAssignments(body: string): Map<string, string> {
    const values = new Map<string, string>();
    for (const match of body.matchAll(/^\s*([a-z][a-z0-9_]*)\s*:\s*(.+),\s*$/gm)) values.set(match[1], match[2].trim());
    return values;
}

function evaluateColor(
    expression: string,
    colors: Map<string, FigmaColor>,
    numbers: Map<string, number>,
    statusAlpha: number,
): FigmaColor | undefined {
    const reference = expression.match(/^core::([A-Z][A-Z0-9_]*)$/);
    if (reference) return colors.get(reference[1]);
    const alpha = expression.match(/^Color32::from_(black|white)_alpha\(\(core::([A-Z][A-Z0-9_]*) \* 255\.0\) as u8\)$/);
    if (alpha) {
        const channel = alpha[1] === 'white' ? 1 : 0;
        return { r: channel, g: channel, b: channel, a: Math.trunc((numbers.get(alpha[2]) || 0) * 255) / 255 };
    }
    const tint = expression.match(/^tint\(core::([A-Z][A-Z0-9_]*), STATUS_BG_ALPHA\)$/);
    if (tint) {
        const base = colors.get(tint[1]);
        return base ? { ...base, a: statusAlpha / 255 } : undefined;
    }
    return undefined;
}

function assertColor(label: string, actualRaw: string | undefined, expected: FigmaColor | undefined): void {
    const actual = actualRaw ? parseColorValue(actualRaw) : null;
    if (!actual || !expected || !colorsMatch(actual, expected, 0.005)) {
        throw new Error(`${label} differs from pinned source (${actualRaw || '(missing)'}).`);
    }
}

async function run(args: string[]): Promise<void> {
    const sourceRoot = sourceArg(args);
    const { stdout } = await execFileAsync('git', ['-C', sourceRoot, 'rev-parse', 'HEAD']);
    const revision = stdout.trim();
    if (revision !== OUROBOROS_COMMIT) {
        throw new Error(`Expected Ouroboros ${OUROBOROS_COMMIT}, received ${revision || '(unknown)'}.`);
    }

    const { stdout: status } = await execFileAsync('git', ['-C', sourceRoot, 'status', '--porcelain']);
    if (status.trim()) {
        throw new Error('Pinned Ouroboros source checkout must be pristine before it can be audited.');
    }

    const layers = ['atoms', 'cells', 'molecules', 'organisms', 'graph'] as const;
    const exportsByLayer = new Map<string, Set<string>>();
    const sourceComponentsByLayer = new Map<string, Set<string>>();
    for (const layer of layers) {
        const moduleSource = await readFile(resolve(sourceRoot, 'src', layer, 'mod.rs'), 'utf8');
        const exports = exportedNames(moduleSource);
        exportsByLayer.set(layer, exports);
        sourceComponentsByLayer.set(layer, await sourceComponentInventory(sourceRoot, layer, moduleSource, exports));
    }
    for (const layer of layers) {
        const recipeLayer = layer === 'graph' ? 'graph' : layer.slice(0, -1);
        const recipes = new Set(OUROBOROS_COMPONENT_RECIPES
            .filter(recipe => recipe.layer === recipeLayer)
            .map(recipe => recipe.name));
        assertExactSet(`${layer} component recipe inventory`, sourceComponentsByLayer.get(layer)!, recipes);
    }

    const result = await ouroborosAdapter.fetchAndParse();
    if (result.type !== 'theme') throw new Error('Ouroboros adapter did not return a theme contract.');
    if (result.source?.version !== revision) throw new Error('Adapter source revision does not match the checkout.');

    const core = await readFile(resolve(sourceRoot, 'src', 'tokens', 'core.rs'), 'utf8');
    const layout = await readFile(resolve(sourceRoot, 'src', 'tokens', 'layout.rs'), 'utf8');
    const coreNumbers = numericMap(core);
    const layoutNumbers = numericMap(layout, coreNumbers);
    const coreColors = sourceColors(core);
    const missingConstants: string[] = [];
    const adapterConstantPaths = new Set<string>();
    for (const token of result.extras?.floats || []) {
        const match = token.codeSyntax?.match(/::(core|layout)::([A-Z][A-Z0-9_]*)$/);
        if (!match) continue;
        adapterConstantPaths.add(`${match[1]}::${match[2]}`);
        const source = match[1] === 'layout' ? layout : core;
        if (!new RegExp(`pub\\s+const\\s+${match[2]}\\b`).test(source)) missingConstants.push(token.codeSyntax!);
        const expected = (match[1] === 'layout' ? layoutNumbers : coreNumbers).get(match[2]);
        if (expected === undefined || Math.abs(token.value - expected) > 1e-9) {
            throw new Error(`${token.name}=${token.value} differs from ${match[1]}::${match[2]}=${String(expected)}.`);
        }
    }
    if (missingConstants.length) {
        throw new Error(`Adapter constants missing from pinned source: ${missingConstants.join(', ')}`);
    }
    const numericConstants = (source: string, module: 'core' | 'layout') =>
        [...source.matchAll(/pub\s+const\s+([A-Z][A-Z0-9_]*)\s*:\s*(?:f32|u8|usize)\b/g)]
            .map(match => `${module}::${match[1]}`);
    const omittedConstants = [
        ...numericConstants(core, 'core'),
        ...numericConstants(layout, 'layout'),
    ].filter(path => !adapterConstantPaths.has(path));
    if (omittedConstants.length) {
        throw new Error(`Pinned numeric constants missing from adapter: ${omittedConstants.join(', ')}`);
    }

    const semantic = await readFile(resolve(sourceRoot, 'src', 'tokens', 'semantic.rs'), 'utf8');
    for (const [constant, expected] of coreColors) {
        assertColor(primitivePath(constant), result.tokens.light[primitivePath(constant)], expected);
    }
    const themeStruct = semantic.match(/pub\s+struct\s+Theme\s*\{([\s\S]*?)\n\}/)?.[1] || '';
    const semanticFields = [...themeStruct.matchAll(/pub\s+([a-z][a-z0-9_]*)\s*:/g)].map(match => match[1]);
    const adapterSemanticNames = new Set(Object.keys(result.tokens.light).filter(name =>
        !name.startsWith('primitive/') && !name.startsWith('theme/zinc/')
    ).map(name => name.replace(/-/g, '_')));
    const missingSemantic = semanticFields.filter(field => !adapterSemanticNames.has(field));
    if (missingSemantic.length) throw new Error(`Semantic fields missing from adapter: ${missingSemantic.join(', ')}`);
    const extraSemantic = [...adapterSemanticNames].filter(field => !semanticFields.includes(field));
    if (extraSemantic.length) throw new Error(`Adapter semantic fields absent from source: ${extraSemantic.join(', ')}`);

    const semanticNumbers = numericMap(semantic, coreNumbers);
    const statusAlpha = semanticNumbers.get('STATUS_BG_ALPHA');
    if (statusAlpha === undefined) throw new Error('STATUS_BG_ALPHA is missing from the pinned source.');
    const lightAssignments = themeAssignments(functionBody(semantic, 'light'));
    const darkAssignments = themeAssignments(functionBody(semantic, 'dark'));
    for (const field of semanticFields) {
        const token = field.replace(/_/g, '-');
        assertColor(`Light ${token}`, result.tokens.light[token], evaluateColor(lightAssignments.get(field) || '', coreColors, coreNumbers, statusAlpha));
        assertColor(`Dark ${token}`, result.tokens.dark[token], evaluateColor(darkAssignments.get(field) || '', coreColors, coreNumbers, statusAlpha));
    }

    const aliases = new Map((result.extras?.aliases || []).map(alias => [alias.name, alias]));
    for (const field of semanticFields) {
        const lightRef = lightAssignments.get(field)?.match(/^core::([A-Z][A-Z0-9_]*)$/)?.[1];
        const darkRef = darkAssignments.get(field)?.match(/^core::([A-Z][A-Z0-9_]*)$/)?.[1];
        if (!lightRef || !darkRef) continue;
        const alias = aliases.get(field.replace(/_/g, '-'));
        if (alias?.lightTarget !== primitivePath(lightRef) || alias.darkTarget !== primitivePath(darkRef)) {
            throw new Error(`Semantic alias ${field} does not match the pinned Light/Dark assignments.`);
        }
    }
    const zincLight = new Map([...functionBody(semantic, 'zinc_light').matchAll(/t\.([a-z][a-z0-9_]*)\s*=\s*core::([A-Z][A-Z0-9_]*);/g)]
        .map(match => [match[1], match[2]]));
    const zincDark = new Map([...functionBody(semantic, 'zinc_dark').matchAll(/t\.([a-z][a-z0-9_]*)\s*=\s*core::([A-Z][A-Z0-9_]*);/g)]
        .map(match => [match[1], match[2]]));
    for (const field of new Set([...zincLight.keys(), ...zincDark.keys()])) {
        const lightRef = zincLight.get(field)!;
        const darkRef = zincDark.get(field)!;
        const name = `theme/zinc/${field.replace(/_/g, '-')}`;
        assertColor(`Light ${name}`, result.tokens.light[name], coreColors.get(lightRef));
        assertColor(`Dark ${name}`, result.tokens.dark[name], coreColors.get(darkRef));
        const alias = aliases.get(name);
        if (alias?.lightTarget !== primitivePath(lightRef) || alias.darkTarget !== primitivePath(darkRef)) {
            throw new Error(`Zinc alias ${name} does not match the pinned assignments.`);
        }
    }

    const sourceShadows = [...core.matchAll(/pub\s+const\s+SHADOW_([A-Z][A-Z0-9_]*)\s*:\s*Shadow\s*=\s*Shadow\s*\{([\s\S]*?)\n\};/g)];
    const adapterShadows = new Map((result.extras?.shadows || []).map(shadow => [shadow.name, shadow.value]));
    const sourceShadowNames = new Set(sourceShadows.map(shadow => `shadow/${shadow[1].toLowerCase().replace(/_/g, '-')}`));
    assertExactSet('Shadow inventory', sourceShadowNames, new Set(adapterShadows.keys()));
    for (const shadow of sourceShadows) {
        const name = `shadow/${shadow[1].toLowerCase().replace(/_/g, '-')}`;
        const number = '(-?\\d+(?:\\.\\d+)?)';
        const offset = shadow[2].match(new RegExp(`offset:\\s*\\[${number},\\s*${number}\\]`));
        const blur = Number(shadow[2].match(new RegExp(`blur:\\s*${number}`))?.[1]);
        const spread = Number(shadow[2].match(new RegExp(`spread:\\s*${number}`))?.[1]);
        const color = shadow[2].match(/Color32::from_rgba_(premultiplied|unmultiplied)\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
        if (!offset || !Number.isFinite(blur) || !Number.isFinite(spread) || !color) {
            throw new Error(`${name} could not be parsed from the pinned source.`);
        }
        const channels = color.slice(2, 6).map(Number);
        const alpha = channels[3] / 255;
        const divisor = color[1] === 'premultiplied' && alpha > 0 ? channels[3] : 255;
        const expectedColor: FigmaColor = {
            r: alpha === 0 ? 0 : Math.min(1, channels[0] / divisor),
            g: alpha === 0 ? 0 : Math.min(1, channels[1] / divisor),
            b: alpha === 0 ? 0 : Math.min(1, channels[2] / divisor),
            a: alpha,
        };
        const parsedLayers = parseShadowValue(adapterShadows.get(name) || '');
        const parsed = parsedLayers[0];
        if (parsedLayers.length !== 1 || !parsed || parsed.x !== Number(offset[1]) || parsed.y !== Number(offset[2]) ||
            parsed.blur !== blur || parsed.spread !== spread || !colorsMatch(parsed.color, expectedColor, 0.005)) {
            throw new Error(`${name} differs from the pinned source.`);
        }
    }

    const typography = await readFile(resolve(sourceRoot, 'src', 'theme', 'typography.rs'), 'utf8');
    const sourceRoles = new Set([...typography.matchAll(/pub\s+fn\s+([a-z][a-z0-9_]*)\s*\(\)\s*->\s*TypeStyle/g)]
        .map(match => match[1].replace(/_/g, '-')));
    const adapterRoles = new Set((result.extras?.textStyles || []).map(style => style.name.replace(/^ouroboros\//, '')));
    const missingRoles = [...sourceRoles].filter(role => !adapterRoles.has(role));
    if (missingRoles.length) throw new Error(`Typography roles missing from adapter: ${missingRoles.join(', ')}`);
    const extraRoles = [...adapterRoles].filter(role => !sourceRoles.has(role));
    if (extraRoles.length) throw new Error(`Adapter typography roles absent from source: ${extraRoles.join(', ')}`);
    const textStyles = new Map((result.extras?.textStyles || []).map(style => [style.name.replace(/^ouroboros\//, ''), style]));
    for (const role of sourceRoles) {
        const sourceName = role.replace(/-/g, '_');
        const body = typography.match(new RegExp(`pub\\s+fn\\s+${sourceName}\\s*\\(\\)\\s*->\\s*TypeStyle\\s*\\{([\\s\\S]*?)\\n\\}`, 'm'))?.[1] || '';
        const refs = body.match(/style\(\s*(sans\(Weight::([A-Za-z]+)\)|mono\((true|false)\)),\s*core::([A-Z0-9_]+),\s*core::([A-Z0-9_]+),\s*core::([A-Z0-9_]+)/m);
        const style = textStyles.get(role);
        if (!refs || !style) throw new Error(`Could not audit typography role ${role}.`);
        const weight = refs[2];
        const mono = refs[3];
        const expectedFamily = mono
            ? 'Iosevka Term'
            : weight === 'SemiBold' ? 'Iosevka Semibold'
                : weight === 'Light' ? 'Iosevka Light'
                    : weight === 'Medium' ? 'Iosevka Medium' : 'Iosevka';
        const expectedStyle = mono === 'true' || weight === 'Bold' ? 'Bold' : 'Regular';
        const size = coreNumbers.get(refs[4]);
        const leading = coreNumbers.get(refs[5]);
        const tracking = coreNumbers.get(refs[6]);
        if (style.family !== expectedFamily || style.fontStyle !== expectedStyle || style.fontSize !== size ||
            style.lineHeight === undefined || Math.abs(style.lineHeight - (size! * leading!)) > 1e-9 ||
            style.letterSpacing !== tracking) {
            throw new Error(`Typography role ${role} differs from the pinned source.`);
        }
    }

    process.stdout.write([
        `Ouroboros source audit passed at ${revision}.`,
        `${Object.keys(result.tokens.light).length} Light / ${Object.keys(result.tokens.dark).length} Dark tokens.`,
        `${result.extras?.floats?.length || 0} numeric tokens; ${result.extras?.aliases?.length || 0} aliases.`,
        `${result.extras?.textStyles?.length || 0} text roles; ${OUROBOROS_COMPONENT_RECIPES.length} public UI recipes.`,
    ].join('\n') + '\n');
}

run(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
});
