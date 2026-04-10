## 1. OpenSpec Reset

- [x] Remove the committed `openspec/changes/archive/` tree
- [x] Remove the stale active change `openspec/changes/registry-validation-manifest/`
- [x] Keep `openspec/specs/` intact as the canonical truth for current behavior

## 2. Baseline Change Record

- [x] Create `openspec/changes/2026-04-09-openspec-baseline-reset/`
- [x] Add `proposal.md`, `design.md`, `tasks.md`, and the `spec-repository-hygiene` spec delta
- [x] Update `openspec/README.md` to reflect Git-based history retention and current change-id conventions

## 3. Coverage Policy

- [x] Remove the tracked `coverage/` tree
- [x] Add `coverage/` to `.gitignore`
- [x] Leave package scripts and test commands unchanged

## 4. Validation

- [x] Search retained files for stale references to the deleted change tree
- [x] Run `npm run typecheck`
- [x] Run `npm test`
- [x] Run `npm run validate:contracts`
