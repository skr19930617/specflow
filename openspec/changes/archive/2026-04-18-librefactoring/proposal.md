## Why

Seeded from GitHub issue #161 ("libのrefactoring") on `skr19930617/specflow`.

> libが肥大化しているので使われていないものは削除し、関連するtestも削除する。役割が小さすぎるファイルは統合してファイル数を減らす。

`src/lib/` currently holds 55 TypeScript files totalling ~10,000 lines. Several of those files are imported only by tests (or not at all), and several others are too small to justify their own file. The result is a bloated lib surface that hides which modules carry real product contracts and which ones are orphaned or overly fragmented.

This proposal tightens `src/lib/` by (a) deleting modules and tests that no production consumer references and whose baseline specs have gone stale, and (b) consolidating trivially-sized files into their natural siblings — without changing any runtime CLI behaviour.

Source: https://github.com/skr19930617/specflow/issues/161

## What Changes

- **Delete dead-code modules** (no non-test consumer; their only baseline-spec owner is retired in the same change):
  - `src/lib/ecosystem-detector.ts` (425 lines) — ecosystem detector for the never-wired `setup` re-run flow.
  - `src/lib/profile-diff.ts` (186 lines) — profile diff helpers for the same flow.
- **Delete every test whose sole subject is a deleted module.** The closed list is produced in the design phase by grepping `src/tests/**/*.ts` for imports that resolve to a deleted file and then confirming the test's only production import is the deleted module. Current reading (recorded in design.md D1): **zero tests match.** `profile-diff.ts` has no tests at all, and `ecosystem-detector.ts` has no tests at all; `src/tests/interaction-records.test.ts` imports `in-memory-interaction-record-store.ts` (not touched) rather than `profile-diff.ts`, so it is NOT deleted.
- **Retire the corresponding requirements** from `openspec/specs/project-bootstrap-installation/spec.md` by **physical deletion** of the requirement "`setup` rerun performs deterministic diff-and-resolve on existing profile" and any scenario that depends on ecosystem detection or profile diffing. The deletion is encoded as a `## REMOVED Requirements` block in the spec delta at `openspec/changes/librefactoring/specs/project-bootstrap-installation/spec.md`; the baseline spec file is rewritten by OpenSpec at archive time. No deprecation markers — git history is the audit trail.
- **Do not touch** "dormant by design" modules whose baseline specs remain in force: `src/lib/artifact-phase-gates.ts`, `src/lib/phase-router/**` as a whole, and the majority of `src/lib/agent-session/**`. Re-evaluation of those modules is explicitly out of scope for this change. Exception: single-consumer files inside those directories may still be absorbed when design confirms the precondition (see next bullet).
- **Consolidate single-consumer small files** into the module that actually consumes them. Final reality-checked list (see design.md D3 for the verification trail):
  - `src/lib/task-planner/completion.ts` (12 lines) → absorbed into **`src/lib/task-planner/window.ts`** (its only production importer), not `advance.ts`. `advance.ts` does not import from `completion.ts`, so inlining there would have been factually wrong. `task-planner/index.ts` re-exports `checkBundleCompletion` and `ArtifactChecker` from `./window.js`.
  - `src/lib/agent-session/send-queue.ts` (43 lines) → absorbed into **`src/lib/agent-session/session-manager.ts`** (its only production importer). `agent-session/index.ts` re-exports `SendQueue` from `./session-manager.js`.
  - `src/lib/phase-router/errors.ts` is **NOT** merged. Verification in design found TWO internal consumers (`router.ts` and `derive-action.ts`), violating the single-consumer precondition. It remains a standalone file.
  - `src/lib/agent-session/types.ts` is **NOT** merged. It has six internal consumers, violating the precondition.
- **No other lib file is reorganised.** Multi-consumer utility files (e.g. `fs.ts`, `git.ts`, `process.ts`, `json.ts`) stay as-is.
- **Barrel-export guarantee:** the exported symbol names and types of `task-planner/index.ts`, `phase-router/index.ts`, and `agent-session/index.ts` remain equivalent before and after the change. Internal `from "./x.js"` paths inside the barrel may change when a merged-away module is removed; what matters is that `import { Foo } from "<barrel>"` keeps resolving to the same value/type for every `Foo` that was publicly exported.
- **Deep imports under `src/lib/` are unsupported.** `package.json#exports` only exposes `./conformance`; any external consumer that imports `src/lib/task-planner/completion` (or any other non-barrel subpath) is relying on non-public surface and is not a constraint for this change.

## Capabilities

### New Capabilities
<!-- None. This change is internal refactoring plus a spec retirement. -->

### Modified Capabilities
- `project-bootstrap-installation`: remove the "setup rerun performs deterministic diff-and-resolve on existing profile" requirement (and any scenarios that reference ecosystem detection or profile-diff). The spec retires the never-wired capability so the surviving requirements match the shipped implementation.

## Impact

- **Code removed:** ~611 lines from `src/lib/` (`ecosystem-detector.ts` + `profile-diff.ts`). No test files are deleted (see design.md D1 — zero tests have a deleted module as their sole subject).
- **Code consolidated:** single-consumer small files absorbed into their consumer module. Confirmed: `task-planner/completion.ts` → `task-planner/window.ts`; `agent-session/send-queue.ts` → `agent-session/session-manager.ts`. Not consolidated: `phase-router/errors.ts` (two consumers) and `agent-session/types.ts` (six consumers). No numeric reduction target — the qualitative rule is the contract.
- **Public API:** Unchanged. All `index.ts` barrels preserve their export surface.
- **CLI / user-facing behaviour:** Unchanged. No `bin/specflow-*` command consumes the removed modules today.
- **Tests:** No test file is deleted. `src/tests/task-planner-core.test.ts` is updated to import `checkBundleCompletion` and `ArtifactChecker` from `../lib/task-planner/window.js` (previously `../lib/task-planner/completion.js`). `src/tests/agent-session.test.ts` is updated to import `SendQueue` from `../lib/agent-session/session-manager.js` (previously `../lib/agent-session/send-queue.js`). A new `src/tests/barrel-equivalence.test.ts` pins the three barrels' runtime export surfaces.
- **Baseline specs:** `openspec/specs/project-bootstrap-installation/spec.md` will be modified at archive time (requirement retirement) via the spec delta. All other specs untouched.
- **Build / verification:** `npm run check` (typecheck + lint + format + coverage + validate:contracts) MUST pass after the refactor — no coverage regression allowed on the retained surface.
