## Context

`src/lib/` is the primary internal library directory of specflow-node. It currently carries 55 TypeScript files (~10,000 lines) spread across the root and three subdirectories (`agent-session/`, `phase-router/`, `task-planner/`). Two pressures have accumulated:

1. **Dormant bootstrap code.** `ecosystem-detector.ts` (425 lines) and `profile-diff.ts` (186 lines) were written in anticipation of a `setup` CLI that was never shipped. They are imported by no production code and by no tests. Only archived change docs reference them.
2. **Fragmented small files.** A handful of files under ~50 lines live alongside much larger siblings. Some of these small files have a single internal consumer and could be absorbed without losing cohesion. Others (e.g., `phase-router/errors.ts`) have multiple internal consumers and are not merge candidates.

The proposal authorises (a) deletion of the two dormant modules plus retirement of the matching requirement in `project-bootstrap-installation/spec.md`, and (b) absorption of single-consumer small files into their consumer module. This design records the concrete, reality-checked list of files to delete and merge, corrects two factual errors that slipped into the proposal, and spells out the verification path.

## Goals / Non-Goals

**Goals:**

- Delete `src/lib/ecosystem-detector.ts` and `src/lib/profile-diff.ts`.
- Delete any test whose sole subject is a deleted module (enumerated below — zero matches found).
- Retire the `setup` rerun diff-and-resolve requirement from `openspec/specs/project-bootstrap-installation/spec.md` via the change's spec delta.
- Absorb single-consumer small files into the module that actually consumes them, preserving the public `index.ts` barrel surface by exported symbol names and types.
- Keep `npm run check` (typecheck + lint + format + coverage + validate:contracts) green throughout.
- Keep the observable behaviour of every `bin/specflow-*` command unchanged.

**Non-Goals:**

- Restructuring multi-consumer utility modules (`fs.ts`, `git.ts`, `process.ts`, `json.ts`, etc.).
- Removing or touching dormant-by-design modules that implement still-active baseline specs (`artifact-phase-gates.ts`, all of `phase-router/`, all of `agent-session/` apart from confirmed single-consumer merges).
- Changing the public `exports` surface in `package.json` (`./conformance` remains the only published subpath).
- Introducing a numeric file-count reduction target — the contract is the qualitative rule in the proposal.
- Adding new features, tests beyond those that compensate for deletions, or new public API.

## Decisions

### D1 — Delete exactly two lib files; delete zero test files

`ecosystem-detector.ts` and `profile-diff.ts` are the only `src/lib/` files that satisfy both conditions: (a) no non-test `import` resolves to them, and (b) no `src/tests/**` file has them as its sole subject.

Verification recipe (executed during implementation):

1. `grep -rn "from ['\"].*lib/<name>['\"]" src/` for each deletion candidate.
2. `grep -rn "<PublicSymbol>" src/` for each exported symbol the file defined.
3. Confirm the only hits live inside the file itself or inside archived docs under `openspec/changes/archive/**`.

Current readings (2026-04-18):

| File | Non-test consumers | Tests whose only subject is this file |
|---|---|---|
| `src/lib/ecosystem-detector.ts` | 0 | 0 |
| `src/lib/profile-diff.ts` | 0 | 0 |

**Rationale over alternatives:** Keeping the files "just in case" was rejected in clarification — the user preferred physical deletion plus a clean spec retirement so that shipped code and shipped spec stay aligned.

**Proposal erratum:** the proposal said `src/tests/interaction-records.test.ts` would be deleted because its sole subject is `profile-diff.ts`. This was wrong. `interaction-records.test.ts` actually imports `in-memory-interaction-record-store.ts` (not touched by this change) and `types/interaction-records.ts` (not in lib). No test file is deleted under D1.

### D2 — Retire the `setup` rerun diff-and-resolve requirement via spec delta

The spec delta `specs/project-bootstrap-installation/spec.md` already contains a `## REMOVED Requirements` block that physically retires the requirement "`setup` rerun performs deterministic diff-and-resolve on existing profile" (and its four scenarios). No other requirement in `project-bootstrap-installation` is touched: the `setup` command's detection, schema validation, and migration requirements remain, since they are not tied to the deleted implementation files.

**Rationale over alternatives:** A deprecation marker was rejected in clarification because OpenSpec has no standard retirement annotation — physical removal via spec delta is the project convention. Git history is the audit trail.

### D3 — Merge single-consumer small files into their consumer

Reality-checked merge list:

| From | Into | Why |
|---|---|---|
| `src/lib/task-planner/completion.ts` (12L) | `src/lib/task-planner/window.ts` (21L) | `window.ts` is the only production file that imports from `completion.ts`; they share the `ArtifactChecker` type and both concern bundle readiness. Resulting file keeps the name `window.ts` to minimise diff noise. Barrel re-exports (`checkBundleCompletion`, `ArtifactChecker`) migrate from `./completion.js` to `./window.js`. |
| `src/lib/agent-session/send-queue.ts` (43L) | `src/lib/agent-session/session-manager.ts` (173L) | `session-manager.ts` is the only module that imports `SendQueue`. The barrel re-export `SendQueue` migrates from `./send-queue.js` to `./session-manager.js`. |

**Not merged (proposal erratum corrected):**

| File | Reason for keeping |
|---|---|
| `src/lib/phase-router/errors.ts` (50L) | TWO internal consumers: `router.ts` AND `derive-action.ts`. Not a single-consumer file. The proposal's claim that it should merge into `router.ts` was incorrect. |
| `src/lib/agent-session/types.ts` (80L) | Six internal consumers (`index.ts`, `session-manager.ts`, `errors.ts`, 3 adapters). Not a single-consumer file. |

**Rationale over alternatives:** Merging `completion.ts` into `advance.ts` (as the proposal originally stated) is factually impossible — `advance.ts` never imports from `completion.ts`. Merging into `window.ts` (the actual importer) is the faithful application of the "absorb into consumer" rule. Similarly, `phase-router/errors.ts` violates the single-consumer precondition, so leaving it alone is the correct application of the rule, not a regression.

### D4 — Barrel export guarantee: public symbol/type equivalence

For each of `task-planner/index.ts`, `phase-router/index.ts`, and `agent-session/index.ts`:

- The set of exported names (types, functions, classes, constants) after the change MUST equal the set before the change.
- Each exported name MUST resolve to the same value/type (same function signature, same class shape) as before.
- Internal `from "./x.js"` paths inside the barrel MAY change when a merged file no longer exists.

This is verified by `tsc -p tsconfig.json --noEmit` plus a dedicated barrel-equivalence check in `src/tests/*` if one does not already exist (decision: add a small test if absent; see D6).

**Rationale over alternatives:** "Byte-for-byte identical `index.ts`" was rejected in clarification because it prevents removing a merged file's import path, which is the whole point of the consolidation.

### D5 — Deep imports under `src/lib/` are not a concern

`package.json#exports` publishes only `./conformance`. Any external consumer that imports a `src/lib/**` subpath is relying on non-public surface. The clarification confirmed the repo does not support such imports, so deleting or renaming any non-barrel file inside `src/lib/` is not a breaking change.

**Implication for tests in this repo:** `src/tests/task-planner-core.test.ts` imports directly from `src/lib/task-planner/completion.js` and `src/lib/task-planner/window.js`. When `completion.ts` is merged into `window.ts`, the test SHALL be updated to import both `checkBundleCompletion` and `selectNextWindow` from `../lib/task-planner/window.js` (or through the `task-planner/index.js` barrel — preferred).

### D6 — Verification is `npm run check` + a barrel-equivalence check

The change is successful when:

1. `npm run check` exits zero with no new lint/format/test regressions.
2. The coverage report's "lines" metric does not drop by more than the lines actually removed from `src/lib/` (which is roughly the size of the deleted modules plus a proportional amount in the retargeted tests).
3. `openspec validate librefactoring --type change` remains valid.
4. A barrel-equivalence smoke test confirms every symbol in the `before` barrel snapshot resolves in the `after` barrel.

The barrel-equivalence smoke test is a one-liner per barrel: `import * as mod from "../lib/<barrel>/index.js"` followed by an assertion on the keys. Added only if an equivalent test does not already exist.

## Risks / Trade-offs

- **Risk:** A hidden deep-import from outside this repo breaks when `completion.ts` or `send-queue.ts` disappears.
  - **Mitigation:** Clarification confirmed deep imports are unsupported. If a downstream consumer surfaces, we can republish `completion.ts` as a re-export shim in a follow-up change without reverting the merge.
- **Risk:** The retired `setup` rerun requirement is reintroduced later and someone resurrects `profile-diff.ts` / `ecosystem-detector.ts` from git history, re-adding tech debt.
  - **Mitigation:** The spec delta's `## REMOVED Requirements` block explicitly names the modules and documents why they were retired. Future design for a real `setup` CLI must state a fresh approach.
- **Risk:** Coverage drops because the deleted modules had no tests and therefore contributed zero "hit" lines but non-zero "total" lines; deletion removes total lines, so coverage percentage may actually *increase*. This is acceptable and matches the refactor's intent.
  - **Mitigation:** No action — we accept the coverage increase.
- **Trade-off:** Merging `completion.ts` into `window.ts` leaves a file named `window.ts` that also owns bundle-completion logic. A future reader may find the name misleading. Renaming was considered and rejected — renaming changes every `from "./window.js"` consumer's import path and increases diff noise without solving a real problem. A rename can happen in a follow-up if it becomes painful.
- **Trade-off:** Not merging `phase-router/errors.ts` and `agent-session/types.ts` keeps the file count higher than the original survey suggested. Accepted — the single-consumer rule is more important than a file-count target.

## Migration Plan

This is an internal refactor with no migration surface for downstream users. The sequence inside this change is:

1. Write the barrel-equivalence smoke test first (red if it does not already exist, otherwise confirm it passes on `main`).
2. Delete `src/lib/ecosystem-detector.ts`. Run `npm run typecheck` — expect green (zero non-test consumers).
3. Delete `src/lib/profile-diff.ts`. Run `npm run typecheck` — expect green.
4. Apply the spec delta so `openspec validate librefactoring --type change` is still green and archive will trim the baseline spec on completion.
5. Merge `completion.ts` → `window.ts`:
   - Move `ArtifactChecker` and `checkBundleCompletion` into `window.ts` (keeping both exports).
   - Delete `completion.ts`.
   - Update `task-planner/index.ts` to re-export from `./window.js`.
   - Update `src/tests/task-planner-core.test.ts` to import from `../lib/task-planner/window.js` (or from the barrel).
   - Run `npm run check`.
6. Merge `send-queue.ts` → `session-manager.ts`:
   - Move `SendQueue` into `session-manager.ts`.
   - Delete `send-queue.ts`.
   - Update `agent-session/index.ts` barrel re-export.
   - Run `npm run check`.
7. Run `npm run check` one final time and confirm the barrel-equivalence test is still green.
8. Hand off to review via `/specflow.review_design`.

Rollback: revert the offending commit. Each merge step is a separate commit to keep rollback granular.

## Open Questions

- None. The three open points from the challenge phase (barrel definition, deep-import support, spec retirement mechanics) were all resolved in reclarify and are reflected in D4, D5, and D2 respectively.

## Concerns

Two user-facing-adjacent concerns, each resolving a specific problem:

- **C-DEAD — "Shipped code does not match shipped spec."** `profile-diff.ts` and `ecosystem-detector.ts` exist in `src/lib/` but nothing runs them, while `project-bootstrap-installation/spec.md` promises that `setup` can diff-and-resolve against an existing profile. Maintainers reading the code cannot tell whether the spec is aspirational or broken. D1+D2 remove both the code and the matching requirement so the two artifacts agree.
- **C-MERGE — "Fragmented small files hide their ownership."** `completion.ts` and `send-queue.ts` live in their own files but each has a single real consumer; a reader has to jump files to follow the logic. D3 absorbs them into their consumer module so the logic lives where it is used.

The concerns are intentionally small because this is an internal refactor, not a user-facing feature.

## State / Lifecycle

- **Canonical state:** the `src/lib/` directory tree itself. No runtime state is added, removed, or reshaped by this change. No persisted artifact schema changes.
- **Derived state:** the `dist/` build output reflects the updated `src/` structure; `state-machine.json` and the rendered workflow diagram are unaffected (they derive from `workflow-machine.ts`, which is explicitly out of scope).
- **Lifecycle boundaries:** all changes apply at build time and static code level. No migration of existing run-state JSON, no coordination with in-flight runs.
- **Persistence-sensitive state:** none. No database, no file-schema, no on-disk run artifacts touched.

## Contracts / Interfaces

- **`task-planner/index.ts` barrel:** exported names (`ArtifactChecker`, `checkBundleCompletion`, `selectNextWindow`, `advanceBundleStatus`, `generateTaskGraph`, `renderTasksMd`, `validateTaskGraph`, `assertValidTaskGraph`, `updateBundleStatus`, bundle/task types) and their signatures remain identical before and after (see D4).
- **`phase-router/index.ts` barrel:** unchanged. No merge affects this barrel.
- **`agent-session/index.ts` barrel:** exported names (`SendQueue`, adapters, `SessionError`, `ConfigMismatchError`, `DefaultAgentSessionManager`, `SessionMetadataStore`, types) and their signatures remain identical.
- **CLI surfaces:** no change. No `bin/specflow-*` entrypoint imports a deleted or merged module.
- **Conformance package (`./conformance`):** no change. Its source lives in `src/conformance/`, not `src/lib/`.
- **Baseline spec `project-bootstrap-installation/spec.md`:** REMOVED the "setup rerun" requirement via spec delta; all other requirements untouched.

## Persistence / Ownership

- **Source ownership:** all changes live under `src/lib/` and `openspec/changes/librefactoring/specs/`. No other directory is modified.
- **Storage mechanisms:** filesystem only (source files). No database, no run-state JSON, no generated artifact registry touched.
- **Artifact ownership (refactor scope):** the refactor owns `src/lib/ecosystem-detector.ts`, `src/lib/profile-diff.ts`, `src/lib/task-planner/completion.ts`, `src/lib/task-planner/window.ts`, `src/lib/agent-session/send-queue.ts`, `src/lib/agent-session/session-manager.ts`, `src/lib/task-planner/index.ts`, `src/lib/agent-session/index.ts`, `src/tests/task-planner-core.test.ts`, and the spec delta. Nothing else is written.
- **Ownership boundaries outside scope:** `workflow-machine.ts`, `schemas.ts`, `review-ledger.ts`, `review-runtime.ts`, `spec-verify.ts`, and all of `phase-router/`, `artifact-phase-gates.ts`, multi-consumer utility modules are explicitly not owned by this change.

## Integration Points

- **Build system (`src/build.ts`, `src/validate.ts`):** must continue to compile and validate contracts after deletions/merges. These files import from `src/lib/contracts.ts`, `src/lib/paths.ts`, `src/lib/schemas.ts` — none of which this change touches.
- **Test runner (`node --test dist/tests/*.test.js`):** `src/tests/task-planner-core.test.ts` is updated to the new import path (see D5).
- **OpenSpec:** `openspec validate librefactoring --type change` and the archive flow must accept the spec delta. Already green per Step 8 of the upstream `/specflow`.
- **External services:** none. No HTTP client, no queue, no subprocess management is added or removed.
- **Save / restore boundaries:** not applicable — the refactor does not persist anything.

## Ordering / Dependency Notes

Foundational first, then leaf-level merges, then verification:

1. **Foundation:** confirm baseline `npm run check` is green; add or confirm the barrel-equivalence smoke test (D6). This unblocks every subsequent step by giving a before/after assertion.
2. **Deletions (independent, can run in parallel):** delete `ecosystem-detector.ts`; delete `profile-diff.ts`. Each deletion is independently typecheck-green. The spec delta is already committed and is verified once via `openspec validate`.
3. **Merge `completion.ts` → `window.ts`:** depends on `task-planner-core.test.ts` being updated in the same commit so the test suite stays green. Independent of the deletions.
4. **Merge `send-queue.ts` → `session-manager.ts`:** independent of steps 2 and 3; can proceed in parallel within a separate commit.
5. **Final verification:** `npm run check` run after all commits land. Must be green.

Steps 2, 3, and 4 are independent and can be applied in any order. Sequencing them as separate commits keeps rollback granular.

## Completion Conditions

Per concern:

- **C-DEAD complete when:**
  - `src/lib/ecosystem-detector.ts` and `src/lib/profile-diff.ts` no longer exist on disk.
  - `openspec/specs/project-bootstrap-installation/spec.md` no longer contains the "setup rerun performs deterministic diff-and-resolve on existing profile" requirement after archive.
  - `openspec validate librefactoring --type change` is green.
- **C-MERGE complete when:**
  - `src/lib/task-planner/completion.ts` and `src/lib/agent-session/send-queue.ts` no longer exist on disk.
  - `ArtifactChecker`, `checkBundleCompletion`, `selectNextWindow`, and `SendQueue` remain exported from their respective barrels with unchanged signatures.
  - The barrel-equivalence smoke test is green.
- **Overall change complete when:**
  - Both concerns are complete per the conditions above.
  - `npm run check` (typecheck + lint + format + coverage + validate:contracts + tests) passes on the final commit.
  - Design review via `/specflow.review_design` has no outstanding findings.

Each concern is independently reviewable: a reviewer can inspect C-DEAD in isolation by looking at the deletion commits and the spec delta, and C-MERGE in isolation by looking at the merge commits and the barrel-equivalence test result.
