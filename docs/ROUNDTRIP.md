# OuroForge round-trip contract

OuroForge synchronizes a constrained design-system model. It does not attempt
to translate arbitrary Rust control flow into Figma or arbitrary Figma layers
into executable Rust.

## Managed data

The following values round-trip through the versioned manifest:

- Core and semantic colors, including Light and Dark modes
- Spacing, radii, typography metrics, control sizes, borders, and opacity
- Named text and shadow styles
- Registered component recipes, variants, fidelity, and auto-layout geometry
- Auto-layout measurements and named application-shell geometry

Callbacks, application state, rendering algorithms, and custom canvas behavior
remain code-owned.

## Stable identity

Managed collections and variables store plugin-owned adapter and token IDs.
Display-name edits therefore do not create duplicates on the next import.
Numeric variables also carry the corresponding public Rust path as metadata,
for example:

```text
spacing/4 → ouroboros_ui::tokens::core::SPACE_4
radius/lg → ouroboros_ui::tokens::core::RADIUS_LG
control/md → ouroboros_ui::tokens::core::CONTROL_MD
```

Renaming a managed Figma variable is cosmetic; export and re-import continue to
use its stable token ID. Changing that ID is a schema change.

## Synchronization phases

1. **Import:** an adapter materializes the pinned Ouroboros snapshot in Figma.
2. **Diff:** OuroForge compares the selected incoming categories with existing
   managed variables and shows component recipes that will be created or
   refreshed. Applying is a separate user action.
3. **Design edit:** designers modify supported values and compose registered
   components without losing stable token names.
4. **Export:** OuroForge exports only the collection, styles, and components it
   owns. DTCG, CSS, and the manifest preserve every declared mode; the manifest
   also preserves aliases, units, scopes, code syntax, text-style variable
   bindings, effect payloads, and the source revision.
5. **Generate:** the CLI validates the manifest and updates only four fixed
   `.generated.rs` files, replacing each file atomically. `--check` performs no
   writes and returns a failure when those files are stale.

The import review is deliberately non-destructive to variables that are outside
the selected contract, and export refuses unnamed or ambiguous managed
collections. Generated files include the pinned source revision so code review
can reject a manifest based on the wrong Ouroboros snapshot. OuroForge does not
silently merge arbitrary edits from handwritten Rust: upstream Rust changes are
first represented by updating the pinned adapter snapshot, then reviewed in the
same Figma diff.

Apply is tied to a one-use review ID, the exact import settings, the reviewed
adapter payload, and fingerprints of both the managed variable collection and
managed component structure. If any of them changes between review and apply,
the import stops and requires a new review.

## Component boundary

Figma components are wireframing facsimiles of public Ouroboros types, not a
claim that egui rendering or interaction has been reproduced one-to-one.
Static anatomy, variants, token bindings, and supported geometry are managed.
Callbacks, state machines, focus, keyboard behavior, animation, canvas drawing,
and rendering algorithms remain Rust-owned. Repeat syncs update managed recipes
in place while retaining their top-level Figma page positions.

## Contract compatibility

The current manifest schema is version `2`. Component recipes contain a stable
record for every variant, including its name, layout, dimensions, gap, and
four-sided padding. Unknown schema versions, duplicate
token paths or component IDs, undeclared modes, incompatible units, broken
aliases, alias cycles, and missing source revisions are rejected before any Rust
file is written. Schema changes require an explicit generator update.
