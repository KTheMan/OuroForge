# OuroForge

OuroForge is a bidirectional design-system bridge between
[Ouroboros UI](https://github.com/Type-zero-labs/ouroboros-ui) and Figma.
It imports Ouroboros's Rust/egui design vocabulary as native Figma variables,
modes, text styles, effect styles, and component facsimiles. Edited managed
data exports as DTCG JSON, CSS, and a versioned manifest that can generate
owned Rust files.

OuroForge is forked from
[StyleForge](https://github.com/vahiidl/styleforge-figma-plugin) and retains its
other framework adapters for comparison and migration work.

## Ouroboros coverage

- 61 Light and 61 Dark theme colors, with semantic variables aliased to the
  managed primitive palette
- 101 numeric tokens: core and layout geometry, typography metrics, motion,
  graph, controls, icons, focus, hit targets, borders, and opacity
- 2 font-family tokens, 11 named text styles, and 3 shadow effect styles
- The alternate zinc semantic theme as a separate managed token group
- 66 public component recipes across atoms, cells, molecules, organisms, and
  graph: 38 visual facsimiles and 28 explicitly marked behavioral-only,
  producing 217 variant components across 50 component sets
- Native text, visibility, and instance-swap properties for every declared
  visual-facsimile slot, backed by one idempotent five-kind provider set
- Stable plugin-owned identities that survive cosmetic Figma renames
- A required pre-import diff, category-aware imports, and preservation of
  unmanaged variables and component-set page positions
- Managed-only, mode- and alias-preserving DTCG, CSS, and manifest exports
- Deterministic Rust generation with a no-write drift-check mode

The bundled Ouroboros snapshot is pinned to commit
`c390d7deffa7955e28b2e3bcb9c22ac0899a261b`.

See [docs/ROUNDTRIP.md](docs/ROUNDTRIP.md) for the synchronization contract and
the boundary between editable design data and handwritten Rust behavior.
[docs/COMPONENT_COVERAGE.md](docs/COMPONENT_COVERAGE.md) records component
coverage and fidelity, and [docs/FONTS.md](docs/FONTS.md) covers the required
Iosevka font installation.

## Generate Rust from a Figma export

Export **OuroForge Manifest** from the plugin, then run:

```bash
npm run generate:rust -- --manifest ./ouroforge-manifest.json --out-dir ./generated
npm run generate:rust -- --manifest ./ouroforge-manifest.json --out-dir ./generated --check
```

The generator validates the schema and writes only:

- `ouroforge_tokens.generated.rs`
- `ouroforge_theme.generated.rs`
- `ouroforge_components.generated.rs`
- `ouroforge_styles.generated.rs`

It never edits handwritten Ouroboros source files. Integrating those generated
modules into an application remains an explicit code-review step.

## Development

```bash
git clone https://github.com/KTheMan/OuroForge.git
cd OuroForge
npm install
npm test
npm run typecheck
npm run build
npm run audit:ouroboros -- --source /path/to/ouroboros-ui
```

Load `manifest.json` through **Figma → Plugins → Development → Import plugin
from manifest**.

## Architecture

```text
src/
├── adapters/                 # Ouroboros and comparison-system adapters
├── core/                     # Figma import, diff, and export engines
├── data/                     # Offline source snapshots
├── shared/                   # Typed plugin message protocol
├── ui/                       # React plugin interface
└── code.ts                   # Figma sandbox entry point
```

The Figma plugin operates on a versioned contract rather than modifying
handwritten Rust directly. The code-side generator owns generated files only;
the UI shows the managed variable diff before applying an import, and `--check`
fails when generated output differs from the reviewed manifest.

## Upstream

OuroForge began as a fork of StyleForge. The original MIT copyright notice is
retained in [LICENSE](LICENSE), and `upstream` should continue to point to
`https://github.com/vahiidl/styleforge-figma-plugin.git`.

**Upstream awareness is required; permanent compatibility is not.** OuroForge
reviews StyleForge for useful fixes and improvements, but Ouroboros fidelity and
the round-trip contract take priority whenever the projects' needs diverge.

See [docs/UPSTREAM_ALIGNMENT.md](docs/UPSTREAM_ALIGNMENT.md) for the selective
integration policy.

## License

MIT
