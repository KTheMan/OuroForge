// ─── Zustand Store ───────────────────────────────────────────────────────────

import { create } from 'zustand';
import type { AdapterConfig, TokenCategory } from '../adapters/types';
import type { CollectionDiff } from '../core/diffEngine';

export type AppView = 'dashboard' | 'config' | 'diff' | 'importing' | 'exporting';

const DEFAULT_CATEGORIES: TokenCategory[] = [
    'colors', 'spacing', 'radius', 'shadows', 'blur', 'typography',
    'opacity', 'breakpoints', 'containers', 'fontWeights', 'tracking', 'leading',
    'maxWidth', 'borderWidth', 'skew',
    'motion', 'graph', 'layout', 'components',
];

interface StoreState {
    // Navigation
    view: AppView;
    setView: (view: AppView) => void;

    // Library selection
    selectedLibraryIds: string[];
    toggleLibrary: (id: string) => void;
    setLibrarySelected: (id: string, selected: boolean) => void;

    // Configuration (applied to every selected adapter)
    selectedCategories: TokenCategory[];
    toggleCategory: (cat: TokenCategory) => void;
    setSelectedCategories: (cats: TokenCategory[]) => void;
    collectionName: string;
    setCollectionName: (name: string) => void;

    // Per-adapter config (base color, accent, ...)
    adapterConfigs: Record<string, AdapterConfig>;
    setAdapterConfig: (adapterId: string, key: keyof AdapterConfig, value: string) => void;

    // Plan capability: does this file support multiple variable modes?
    multiMode: boolean | null;
    setMultiMode: (v: boolean) => void;

    // Import progress
    importProgress: number;
    importPhase: string;
    importMessage: string;
    setImportProgress: (progress: number, phase: string, message: string) => void;

    // Errors & status
    error: string | null;
    setError: (error: string | null) => void;
    successMessage: string | null;
    setSuccessMessage: (msg: string | null) => void;

    // Exported Figma variables
    exportJson: string;
    exportCss: string;
    exportManifest: string;
    setExportResult: (json: string, css: string, manifest?: string) => void;

    // Pre-import review
    diffs: CollectionDiff[];
    setDiffs: (diffs: CollectionDiff[]) => void;
    reviewId: string;
    setReviewId: (reviewId: string) => void;

    // Search
    searchQuery: string;
    setSearchQuery: (query: string) => void;

    // Reset
    reset: () => void;
}

export const useStore = create<StoreState>((set) => ({
    view: 'dashboard',
    setView: (view) => set({ view }),

    selectedLibraryIds: ['ouroboros'],

    toggleLibrary: (id) => set((state) => {
        const isSelected = state.selectedLibraryIds.includes(id);
        const newIds = isSelected
            ? state.selectedLibraryIds.filter(libId => libId !== id)
            : [...state.selectedLibraryIds, id];

        return { selectedLibraryIds: newIds };
    }),

    setLibrarySelected: (id, selected) => set((state) => {
        if (selected && !state.selectedLibraryIds.includes(id)) {
            return { selectedLibraryIds: [...state.selectedLibraryIds, id] };
        }
        if (!selected && state.selectedLibraryIds.includes(id)) {
            return { selectedLibraryIds: state.selectedLibraryIds.filter(libId => libId !== id) };
        }
        return state;
    }),

    selectedCategories: DEFAULT_CATEGORIES,

    toggleCategory: (cat) =>
        set((state) => ({
            selectedCategories: state.selectedCategories.includes(cat)
                ? state.selectedCategories.filter((c) => c !== cat)
                : [...state.selectedCategories, cat],
        })),
    setSelectedCategories: (cats) => set({ selectedCategories: cats }),

    collectionName: '',
    setCollectionName: (name) => set({ collectionName: name }),

    multiMode: null,
    setMultiMode: (v) => set({ multiMode: v }),

    adapterConfigs: { shadcn: { baseColor: 'neutral', accent: '' } },
    setAdapterConfig: (adapterId, key, value) =>
        set((state) => ({
            adapterConfigs: {
                ...state.adapterConfigs,
                [adapterId]: { ...state.adapterConfigs[adapterId], [key]: value },
            },
        })),

    importProgress: 0,
    importPhase: '',
    importMessage: '',
    setImportProgress: (progress, phase, message) =>
        set({ importProgress: progress, importPhase: phase, importMessage: message }),

    error: null,
    setError: (error) => set({ error }),

    successMessage: null,
    setSuccessMessage: (msg) => set({ successMessage: msg }),

    exportJson: '',
    exportCss: '',
    exportManifest: '',
    setExportResult: (json, css, manifest = '') => set({ exportJson: json, exportCss: css, exportManifest: manifest }),

    diffs: [],
    setDiffs: (diffs) => set({ diffs }),
    reviewId: '',
    setReviewId: (reviewId) => set({ reviewId }),

    searchQuery: '',
    setSearchQuery: (query) => set({ searchQuery: query }),

    reset: () =>
        set({
            view: 'dashboard',
            selectedLibraryIds: ['ouroboros'],
            selectedCategories: DEFAULT_CATEGORIES,
            collectionName: '',
            adapterConfigs: { shadcn: { baseColor: 'neutral', accent: '' } },
            importProgress: 0,
            importPhase: '',
            importMessage: '',
            error: null,
            successMessage: null,
            exportJson: '',
            exportCss: '',
            exportManifest: '',
            diffs: [],
            reviewId: '',
            searchQuery: '',
        }),
}));
