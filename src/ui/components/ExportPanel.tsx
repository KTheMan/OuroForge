import React, { useState } from 'react';
import { useStore } from '../store';

type Format = 'json' | 'css';

export default function ExportPanel() {
    const { exportJson, exportCss, error } = useStore();
    const [format, setFormat] = useState<Format>('json');
    const [copied, setCopied] = useState(false);

    const value = format === 'json' ? exportJson : exportCss;
    const extension = format === 'json' ? 'json' : 'css';

    const handleCopy = async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
    };

    const handleDownload = () => {
        const blob = new Blob([value], {
            type: format === 'json' ? 'application/json' : 'text/css',
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `ouroforge-tokens.${extension}`;
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
