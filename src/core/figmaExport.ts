import { getManagedTokenMetadata } from './variableManager';

const TEXT_STYLE_BINDING_FIELDS = [
    'fontFamily', 'fontStyle', 'fontSize', 'fontWeight', 'letterSpacing',
    'lineHeight', 'paragraphSpacing', 'paragraphIndent',
] as const;

function stableAliasPath(alias: VariableAlias, variablesById: Map<string, Variable>): string {
    const variable = variablesById.get(alias.id);
    const metadata = variable ? getManagedTokenMetadata(variable) : null;
    if (!variable || metadata?.adapterId !== 'ouroboros') {
        throw new Error(`A managed style references an unmanaged or missing variable (${alias.id}).`);
    }
    return metadata.tokenId.replace(/^ouroboros:/, '');
}

/** Only variables with immutable OuroForge token identity enter managed exports. */
export function selectManagedFigmaVariables(
    variables: Variable[],
    collectionId: string,
    adapterId = 'ouroboros',
): Variable[] {
    return variables.filter(variable =>
        variable.variableCollectionId === collectionId &&
        getManagedTokenMetadata(variable)?.adapterId === adapterId,
    );
}

/** Convert Figma variable ids in TextStyle bindings to stable token paths. */
export function exportTextStyleBindings(
    bindings: Partial<Record<string, VariableAlias>> | undefined,
    variablesById: Map<string, Variable>,
): Record<string, string> | undefined {
    if (!bindings) return undefined;
    const exported: Record<string, string> = {};
    for (const field of TEXT_STYLE_BINDING_FIELDS) {
        const alias = bindings[field];
        if (alias) exported[field] = stableAliasPath(alias, variablesById);
    }
    return Object.keys(exported).length ? exported : undefined;
}

/** Recursively replace effect VariableAlias ids with portable token paths. */
export function exportBoundAliases(value: unknown, variablesById: Map<string, Variable>): unknown {
    if (Array.isArray(value)) return value.map(item => exportBoundAliases(item, variablesById));
    if (!value || typeof value !== 'object') return value;
    const record = value as Record<string, unknown>;
    if (record.type === 'VARIABLE_ALIAS' && typeof record.id === 'string') {
        return { alias: stableAliasPath(record as unknown as VariableAlias, variablesById) };
    }
    return Object.fromEntries(Object.entries(record).map(([key, item]) => [
        key,
        exportBoundAliases(item, variablesById),
    ]));
}
