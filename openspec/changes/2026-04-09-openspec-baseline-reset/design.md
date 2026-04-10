## Context

This repository has already converged on a contract-first Node implementation, but the committed OpenSpec change history still contains superseded proposal/design/tasks artifacts and review byproducts from earlier iterations. The committed `coverage/` tree also reflects generated output rather than source-of-truth behavior.

## Decisions

### D1: `openspec/specs/` remains the canonical truth

Stable behavior continues to live under `openspec/specs/`. This reset does not rewrite those specs unless a retained file explicitly depends on deleted historical artifacts.

### D2: Historical change records are recovered from Git, not from committed archive files

The repository will delete the committed `openspec/changes/archive/` tree and will not recreate review ledgers, approval summaries, or `current-phase.md` files for historical work. If old context is needed, it is recovered from Git history.

### D3: `coverage/` is a local generated artifact

The tracked `coverage/` directory is removed and ignored. No build or test command changes are introduced in this reset; the only policy change is that generated coverage output is not committed.

## Validation

- `openspec/changes/` contains only the active baseline-reset change
- `git ls-files coverage` returns no tracked files
- `npm run typecheck`, `npm test`, and `npm run validate:contracts` continue to pass
