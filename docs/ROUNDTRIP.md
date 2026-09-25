# OuroForge round-trip contract

OuroForge synchronizes a constrained design-system model. It does not attempt
to translate arbitrary Rust control flow into Figma or arbitrary Figma layers
into executable Rust.

## Managed data

The following values can round-trip:

- Core and semantic colors, including Light and Dark modes
- Spacing, radii, typography metrics, control sizes, borders, and opacity
- Named text and shadow styles
- Component recipes and variants once registered in the OuroForge schema
- Auto-layout measurements and named application-shell geometry

Callbacks, application state, rendering algorithms, and custom canvas behavior
remain code-owned.

## Stable identity

Managed values use their Ouroboros token path as their stable identity. Numeric
variables also carry the corresponding public Rust path as Figma code syntax,
for example:

```text
spacing/4 → ouroboros_ui::tokens::core::SPACE_4
radius/lg → ouroboros_ui::tokens::core::RADIUS_LG
control/md → ouroboros_ui::tokens::core::CONTROL_MD
```

Renaming a managed Figma variable is therefore a schema change, not a cosmetic
edit.

## Synchronization phases

1. **Import:** an adapter materializes the pinned Ouroboros snapshot in Figma.
2. **Diff:** OuroForge compares the incoming snapshot with existing variables.
3. **Design edit:** designers modify supported values and compose registered
   components without losing stable token names.
4. **Export:** OuroForge emits DTCG JSON containing every mode.
5. **Generate:** a code-side generator validates the manifest and updates only
   generated Rust token and recipe files.

The generator will use the last synchronized manifest as a merge base. If both
Rust and Figma changed the same value, synchronization must report a conflict
instead of selecting a side silently.

## Current milestone

The first milestone implements the Ouroboros adapter, Figma variable import,
mode-aware export, and stable Rust references. Component-set generation and the
Rust manifest generator are the next layers on the same contract.
