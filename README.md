# OuroForge

OuroForge is a bidirectional design-system bridge between
[Ouroboros UI](https://github.com/Type-zero-labs/ouroboros-ui) and Figma.
It imports Ouroboros's Rust/egui token vocabulary as native Figma variables,
modes, text styles, and effect styles, then exports edited Figma variables as
DTCG JSON or CSS for review and code generation.

OuroForge is forked from
[StyleForge](https://github.com/vahiidl/styleforge-figma-plugin) and retains its
other framework adapters for comparison and migration work.

## Current Ouroboros coverage

- Core color ramps
- Light and dark semantic themes
- Spacing and radius scales
- Typography sizes, tracking, font families, and named text styles
- Control and icon sizes
- Border, focus, hit-target, and opacity tokens
- Shadow effect styles
- Stable Rust code references on numeric variables
- Idempotent import into Figma
- DTCG and CSS export from Figma

The bundled Ouroboros snapshot is pinned to commit
`c390d7deffa7955e28b2e3bcb9c22ac0899a261b`.

See [docs/ROUNDTRIP.md](docs/ROUNDTRIP.md) for the synchronization contract and
the boundary between editable design data and handwritten Rust behavior.

## Development

```bash
git clone https://github.com/KTheMan/OuroForge.git
cd OuroForge
npm install
npm test
npm run typecheck
npm run build
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

The Figma plugin operates on a versioned token contract rather than modifying
handwritten Rust directly. The planned code-side generator owns generated files
only, enabling conflict detection and safe round trips.

## Upstream

OuroForge began as a fork of StyleForge. The original MIT copyright notice is
retained in [LICENSE](LICENSE), and `upstream` should continue to point to
`https://github.com/vahiidl/styleforge-figma-plugin.git`.

## License

MIT
