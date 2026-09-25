import React from 'react';
import { useStore } from '../store';

interface Props {
    onApply: () => void;
}

export default function DiffPanel({ onApply }: Props) {
    const { diffs, error } = useStore();

    if (error) {
        return <div className="notice-warning">{error}</div>;
    }

    if (diffs.length === 0) {
        return <div className="export-loading">Comparing the pinned Ouroboros contract with this file…</div>;
    }

    const added = diffs.reduce((sum, diff) => sum + diff.added.length, 0);
    const changed = diffs.reduce((sum, diff) => sum + diff.changed.length, 0);
    const unmanaged = diffs.reduce((sum, diff) => sum + diff.unmanaged.length, 0);

    return (
        <div className="diff-panel">
            <div className="diff-summary">
                <div><strong>{added}</strong><span>new</span></div>
                <div><strong>{changed}</strong><span>changed</span></div>
                <div><strong>{unmanaged}</strong><span>unmanaged</span></div>
            </div>

            {diffs.map(diff => (
                <section className="diff-collection" key={diff.collectionName}>
                    <h3>{diff.collectionName}</h3>
                    {diff.isNew && <p className="diff-note">New managed collection</p>}
                    {diff.changed.slice(0, 30).map(change => (
                        <div className="diff-row" key={`${change.name}:${change.mode}`}>
                            <span>{change.name} · {change.mode}</span>
                            <small>{change.from} → {change.to}</small>
                        </div>
                    ))}
                    {diff.added.slice(0, 30).map(name => (
                        <div className="diff-row" key={`added:${name}`}>
                            <span>{name}</span><small>new</small>
                        </div>
                    ))}
                    {(diff.changed.length + diff.added.length) > 60 && (
                        <p className="diff-note">Showing the first 60 changes.</p>
                    )}
                    {diff.changed.length === 0 && diff.added.length === 0 && (
                        <p className="diff-note">Managed values are up to date.</p>
                    )}
                </section>
            ))}

            <p className="diff-note">
                Unmanaged variables are preserved. Apply only after reviewing value changes.
            </p>
            <footer className="sticky-footer">
                <button className="btn btn-primary btn-full" onClick={onApply}>
                    Apply import
                </button>
            </footer>
        </div>
    );
}
