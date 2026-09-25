# StyleForge upstream policy

StyleForge is OuroForge's upstream foundation. Remaining aligned with it is a
useful maintenance practice, not a constraint on Ouroboros implementation.

Ouroboros fidelity, bidirectional synchronization, and the round-trip contract
are authoritative. When those goals conflict with StyleForge compatibility,
OuroForge must favor Ouroboros.

## Requirements

1. Keep the `upstream` remote pointed at
   `https://github.com/vahiidl/styleforge-figma-plugin.git`.
2. Review upstream changes periodically and before undertaking a major rewrite
   of shared infrastructure.
3. Selectively port fixes and improvements that benefit OuroForge. Wholesale
   merges are optional and should be used only when they reduce risk or effort.
4. Preserve OuroForge-specific behavior during upstream integration:
   - Ouroboros remains the default adapter.
   - The stable Ouroboros token identity and Rust references remain intact.
   - DTCG and CSS export remain accessible in the plugin UI.
   - The round-trip contract in `docs/ROUNDTRIP.md` remains authoritative.
5. StyleForge API and architectural compatibility may be broken deliberately
   when required for a stronger Ouroboros implementation.
6. Record any upstream change that was adopted and note material adaptations.
7. Run type checking, tests, and the production build after every upstream
   integration.

## Integration workflow

```bash
git fetch upstream
git log --oneline --left-right main...upstream/main
# Inspect the relevant changes, then cherry-pick or port only what helps.
npm run typecheck
npm test
npm run build
```

Do not merge upstream mechanically. A clean Git merge is not sufficient by
itself: the Ouroboros adapter and export round trip must still pass their tests.

## Merge criterion

An upstream integration is complete when the selected change benefits
OuroForge, preserves the Ouroboros contract, and passes verification. Matching
StyleForge for its own sake is not a merge criterion.
