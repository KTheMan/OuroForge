import React, { useEffect } from 'react';
import { useStore } from './store';
import Dashboard from './components/Dashboard';
import ConfigPanel from './components/ConfigPanel';
import ImportProgress from './components/ImportProgress';
import ExportPanel from './components/ExportPanel';
import DiffPanel from './components/DiffPanel';
import type { MainMessage, UIMessage, ImportPayload } from '../shared/messaging';

export default function App() {
    const {
        view,
        setView,
        selectedLibraryIds,
        selectedCategories,
        collectionName,
        adapterConfigs,
        setError,
        setImportProgress,
        setSuccessMessage,
        setMultiMode,
        setExportResult,
        setDiffs,
        reviewId,
        setReviewId,
    } = useStore();

    const buildPayload = (): ImportPayload => ({
        adapterIds: selectedLibraryIds,
        collectionName,
        categories: selectedCategories,
        primitiveCollectionName: 'TailwindCSS',
        adapterConfigs,
    });

    // ── Listen for messages from main thread ──
    useEffect(() => {
        const handler = (event: MessageEvent) => {
            const msg = event.data.pluginMessage as MainMessage;
            if (!msg) return;

            switch (msg.type) {
                case 'CAPABILITIES':
                    setMultiMode(msg.multiMode);
                    break;

                case 'IMPORT_PROGRESS': {
                    const { current, total, phase, message } = msg.progress;
                    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
                    setImportProgress(pct, phase, message);
                    break;
                }

                case 'IMPORT_COMPLETE': {
                    const live = msg.sources.filter(s => s.source?.kind === 'live').length;
                    const suffix = msg.sources.length > 0
                        ? live > 0
                            ? ` ${live} of ${msg.sources.length} sources fetched live from upstream.`
                            : ' Imported from bundled snapshots (offline).'
                        : '';
                    const modeNote = msg.modesLimited
                        ? ' Light mode only — this file\u2019s plan allows a single variable mode, so Dark values were skipped.'
                        : '';
                    setSuccessMessage(
                        `Successfully imported ${msg.totalCreated} managed items into your Figma file.${modeNote}${suffix}`
                    );
                    break;
                }

                case 'IMPORT_ERROR':
                    setError(msg.error);
                    break;

                case 'EXPORT_RESULT':
                    setExportResult(msg.json, msg.css, msg.manifest);
                    break;

                case 'EXPORT_ERROR':
                    setError(msg.error);
                    break;

                case 'DIFF_RESULT':
                    setDiffs(msg.diffs);
                    setReviewId(msg.reviewId);
                    setView('diff');
                    break;

                case 'DIFF_ERROR':
                    setError(msg.error);
                    setView('diff');
                    break;
            }
        };

        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, [setDiffs, setError, setExportResult, setImportProgress, setReviewId, setSuccessMessage, setMultiMode, setView]);

    // ── Determine header title ──
    let headerTitle = 'OuroForge';
    let showBack = false;

    if (view === 'config') {
        headerTitle = 'Configure Import';
        showBack = true;
    } else if (view === 'importing') {
        headerTitle = 'Importing';
    } else if (view === 'exporting') {
        headerTitle = 'Export from Figma';
        showBack = true;
    } else if (view === 'diff') {
        headerTitle = 'Review Changes';
        showBack = true;
    }

    const handleBack = () => {
        if (view === 'config' || view === 'exporting') setView('dashboard');
        if (view === 'diff') setView('config');
    };

    const handleExport = () => {
        setError(null);
        setExportResult('', '', '');
        setView('exporting');
        const msg: UIMessage = { type: 'EXPORT_TOKENS' };
        parent.postMessage({ pluginMessage: msg }, '*');
    };

    const handleImport = () => {
        const payload = buildPayload();
        if (payload.adapterIds.length === 0) return;

        setView('importing');
        setError(null);
        setImportProgress(0, 'Starting...', 'Fetching tokens...');

        const msg: UIMessage = { type: 'IMPORT_TOKENS', payload, reviewId };
        parent.postMessage({ pluginMessage: msg }, '*');
    };

    const handleReview = () => {
        const payload = buildPayload();
        if (payload.adapterIds.length === 0) return;
        setError(null);
        setDiffs([]);
        setReviewId('');
        setView('diff');
        const msg: UIMessage = { type: 'REQUEST_DIFF', payload };
        parent.postMessage({ pluginMessage: msg }, '*');
    };

    return (
        <div className="app">
            {/* ── Header ── */}
            <div className="header">
                <div className="header-left">
                    {showBack ? (
                        <button className="header-back" onClick={handleBack}>
                            ← Back
                        </button>
                    ) : (
                        <div className="header-logo">OF</div>
                    )}
                    <span className="header-title">{headerTitle}</span>
                </div>
            </div>

            {/* ── Content ── */}
            <div className="content">
                {view === 'dashboard' && (
                    <Dashboard onContinue={() => setView('config')} onExport={handleExport} />
                )}

                {view === 'config' && <ConfigPanel onReview={handleReview} />}

                {view === 'diff' && <DiffPanel onApply={handleImport} />}

                {view === 'importing' && <ImportProgress />}

                {view === 'exporting' && <ExportPanel />}
            </div>
        </div>
    );
}
