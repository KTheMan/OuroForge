import React, { useState } from 'react';
import { useStore } from '../store';

type Format = 'manifest' | 'json' | 'css';

export default function ExportPanel() {
    const { exportJson, exportCss, exportManifest, error } = useStore();
    const [format, setFormat] = useState<Format>('manifest');
    const [copied, setCopied] = useState(false);

    const value = format === 'manifest' ? exportManifest : format === 'json' ? exportJson : exportCss;
    const extension = format === 'css' ? 'css' : 'json';

    const handleCopy = async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
    };

    const handleDownload = () => {
        const blob = new Blob([value], {
            type: format === 'css' ? 'text/css' : 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = format === 'manifest' ? 'ouroforge-manifest.json' : `ouroforge-tokens.${extension}`;
        link.click();
        URL.revokeObjectURL(url);
    };

    if (error) {
        return (
            <div className="export-panel">
                <div className="notice-warning">{error}</div>
            </div>
        );
    }

    if (!value) {
        return (
            <div className="export-panel export-loading">
                Reading variables and styles from this Figma file…
            </div>
        );
    }

    return (
        <div className="export-panel">
            <div className="export-tabs" role="tablist" aria-label="Export format">
                <button className={format === 'manifest' ? 'active' : ''} onClick={() => setFormat('manifest')}>
                    Manifest
                </button>
                <button className={format === 'json' ? 'active' : ''} onClick={() => setFormat('json')}>
                    DTCG JSON
                </button>
                <button className={format === 'css' ? 'active' : ''} onClick={() => setFormat('css')}>
                    CSS
                </button>
            </div>

            <textarea className="config-textarea export-output" value={value} readOnly spellCheck={false} />

            <footer className="sticky-footer export-actions">
                <button className="btn btn-secondary" onClick={handleDownload}>Download</button>
                <button className="btn btn-primary" onClick={handleCopy}>
                    {copied ? 'Copied' : 'Copy'}
                </button>
            </footer>
        </div>
    );
}
