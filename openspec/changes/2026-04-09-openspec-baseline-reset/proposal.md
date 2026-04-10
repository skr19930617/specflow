## Why

The repository currently carries committed OpenSpec change history and committed coverage artifacts that no longer help describe the active contract-first Node implementation. Keeping stale change records in-tree makes `openspec/` noisy, encourages drift between current truth and historical artifacts, and makes it harder to treat `openspec/specs/` as the authoritative description of the product.

## What Changes

- Reset `openspec/changes/` to a clean baseline by deleting the committed archive tree and the stale active change
- Re-establish a single active change record for the reset itself
- Treat `openspec/specs/` as the canonical description of the current system behavior
- Stop tracking `coverage/` in Git and treat it as a local generated artifact

## Non-Goals

- Rewriting the existing runtime capability specs under `openspec/specs/`
- Changing CLI behavior, runtime contracts, or TypeScript interfaces
- Reconstructing deleted review ledgers, approval summaries, or phase artifacts in a new archive tree

## Impact

- Historical change context moves to Git history instead of committed `openspec/changes/archive/` files
- The working tree keeps only the current active change record
- Coverage can still be generated locally, but it is no longer part of the canonical repository state
