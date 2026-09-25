import React from 'react';
import { useStore } from '../store';
import LibraryCard from './LibraryCard';
import { LIBRARIES } from '../libraryData';

interface DashboardProps {
    onContinue: () => void;
    onExport: () => void;
}

export default function Dashboard({ onContinue, onExport }: DashboardProps) {
    const {
        selectedLibraryIds,
        toggleLibrary,
        setCollectionName,
    } = useStore();

    const handleContinue = () => {
        // Find the "primary" adapter for default collection name
        const selectedThemes = LIBRARIES.filter(lib =>
            selectedLibraryIds.includes(lib.id) && lib.type === 'theme'
        );

        if (selectedThemes.length > 0) {
            setCollectionName(selectedThemes[0].defaultCollectionName);
        } else {
            setCollectionName('TailwindCSS');
        }

        onContinue();
    };

    return (
        <div className="dashboard-container">
            <header className="dashboard-header" style={{ alignItems: 'flex-start', textAlign: 'left', paddingBottom: '0' }}>
                <h1 className="dashboard-title" style={{ textAlign: 'left', marginBottom: '8px' }}>Design Tokens</h1>
                <p className="dashboard-description" style={{ textAlign: 'left', marginBottom: '16px' }}>
                    Sync Ouroboros UI tokens with Figma, or add another library for comparison.
                </p>
            </header>

            <div className="library-list">
                {LIBRARIES.map((lib) => (
                    <LibraryCard
                        key={lib.id}
                        id={lib.id}
                        name={lib.name}
                        description={lib.description}
                        iconSrc={lib.iconSrc}
                        selected={selectedLibraryIds.includes(lib.id)}
                        onToggle={() => toggleLibrary(lib.id)}
                        locked={false}
                    />
                ))}
            </div>

            <footer className="sticky-footer">
                <button className="btn btn-secondary btn-full" onClick={onExport}>
                    Export from Figma
                </button>
                <button
                    className="btn btn-primary btn-full"
                    onClick={handleContinue}
                    disabled={selectedLibraryIds.length === 0}
                >
                    Continue
                </button>
            </footer>
        </div>
    );
}
