# Component coverage

The pinned Ouroboros inventory contains 66 public renderable types. OuroForge
registers every one as a versioned component recipe:

| Layer | Recipes |
| --- | ---: |
| Atoms | 23 |
| Cells | 8 |
| Molecules | 17 |
| Organisms | 15 |
| Graph | 3 |
| **Total** | **66** |

Their declared axes expand to 217 Figma components. Fifty recipes have
variant axes and are emitted as component sets. Stable recipe IDs and Rust paths
are stored as plugin metadata so repeat imports update the same nodes.

## Fidelity labels

- **visual-facsimile (38):** represents static anatomy, named slots, token-bound
  semantic/state differences, variant axes, and useful auto-layout geometry.
- **behavioral-only (28):** documents important frames or states, while the
  defining behavior cannot exist in a static Figma component.

The fidelity label is exported in the manifest and generated Rust recipe table.
It is intentionally not a pixel-parity score. egui measurement, application
state, callbacks, focus, animation, keyboard navigation, overlay placement,
dragging, and custom painting remain code-owned.

## Editing and synchronization

Managed component contents are regenerated from their recipe, but their
top-level page positions are preserved after first creation so teams can arrange
the library and compose wireframes without the next sync resetting the page.
Changes intended for code return through per-variant manifest records; every
variant preserves its stable key, display name, layout, dimensions, gap, and
four-sided padding. They do not rewrite handwritten widget implementations.

Button, Badge, checked/selected controls, active/hover/focus/disabled states,
status variants, axes, sizes, and typography roles receive distinct token-bound
visual treatments. Recipes that remain generic structural documentation are
classified behavioral-only rather than presented as visual parity.
