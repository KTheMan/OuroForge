import { describe, expect, it } from 'vitest';
import { exportBoundAliases, exportTextStyleBindings, selectManagedFigmaVariables } from './figmaExport';

function variable(id: string, tokenId?: string, collection = 'collection'): Variable {
    return {
        id,
        variableCollectionId: collection,
        getSharedPluginData(namespace: string, key: string) {
            if (namespace !== 'ouroforge' || key !== 'managedToken' || !tokenId) return '';
            return JSON.stringify({ adapterId: 'ouroboros', tokenId, schemaVersion: 1 });
        },
    } as unknown as Variable;
}

describe('managed Figma export assembly', () => {
    it('excludes unowned variables even inside a managed collection', () => {
        const managed = variable('managed', 'ouroboros:spacing/4');
        const userVariable = variable('user');
        const otherCollection = variable('other', 'ouroboros:spacing/5', 'other');
        expect(selectManagedFigmaVariables([managed, userVariable, otherCollection], 'collection')).toEqual([managed]);
    });

    it('exports text and nested effect bindings as stable token paths', () => {
        const color = variable('color-id', 'ouroboros:shadow/color');
        const size = variable('size-id', 'ouroboros:typography/size/base');
        const variables = new Map([[color.id, color], [size.id, size]]);

        expect(exportTextStyleBindings({
            fontSize: { type: 'VARIABLE_ALIAS', id: size.id },
        }, variables)).toEqual({ fontSize: 'typography/size/base' });
        expect(exportBoundAliases([{
            type: 'DROP_SHADOW',
            boundVariables: { color: { type: 'VARIABLE_ALIAS', id: color.id } },
        }], variables)).toEqual([{
            type: 'DROP_SHADOW',
            boundVariables: { color: { alias: 'shadow/color' } },
        }]);
    });

    it('rejects style bindings that escape the managed contract', () => {
        const userVariable = variable('user');
        expect(() => exportTextStyleBindings({
            fontSize: { type: 'VARIABLE_ALIAS', id: userVariable.id },
        }, new Map([[userVariable.id, userVariable]]))).toThrow(/unmanaged or missing/);
    });
});
