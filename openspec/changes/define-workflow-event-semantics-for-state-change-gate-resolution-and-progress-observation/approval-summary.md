# Approval Summary: define-workflow-event-semantics-for-state-change-gate-resolution-and-progress-observation

**Generated**: 2026-04-19 19:47 JST
**Branch**: `define-workflow-event-semantics-for-state-change-gate-resolution-and-progress-observation`
**Status**: ⚠️ 2 unresolved high

## What Changed

```
 openspec/specs/surface-event-contract/spec.md   |   3 +
 openspec/specs/workflow-gate-semantics/spec.md  |   4 +
 openspec/specs/workflow-run-state/spec.md       |   5 +
 src/bin/specflow-challenge-proposal.ts          | 113 ++--
 src/bin/specflow-review-apply.ts                | 108 ++--
 src/bin/specflow-review-design.ts               | 119 ++--
 src/bin/specflow-run.ts                         | 163 ++++-
 src/lib/local-fs-observation-event-publisher.ts | 222 +++++++
 src/lib/observation-event-emitter.ts            | 535 +++++++++++++++++
 src/lib/observation-event-publisher.ts          |  41 ++
 src/tests/observation-events.test.ts            | 760 ++++++++++++++++++++++++
 src/tests/specflow-run.test.ts                  | 380 ++++++++++++
 src/types/observation-events.ts                 | 228 +++++++
 13 files changed, 2534 insertions(+), 147 deletions(-)
```

Plus the untracked change artifact directory `openspec/changes/define-workflow-event-semantics-for-state-change-gate-resolution-and-progress-observation/` (proposal, design, tasks, specs, handoff-notes, current-phase, review ledgers).

## Files Touched

- `openspec/specs/surface-event-contract/spec.md` (minor cross-reference to observation-events)
- `openspec/specs/workflow-gate-semantics/spec.md` (3 ADDED requirements)
- `openspec/specs/workflow-run-state/spec.md` (3 ADDED requirements)
- `src/bin/specflow-challenge-proposal.ts`, `src/bin/specflow-review-apply.ts`, `src/bin/specflow-review-design.ts` (autofix-induced edits; function extraction)
- `src/bin/specflow-run.ts` (publisher hook into start/advance/suspend/resume)
- `src/lib/local-fs-observation-event-publisher.ts` **(new)** — file-backed JSONL publisher with idempotency
- `src/lib/observation-event-emitter.ts` **(new)** — interprets transitions/mutations into events in required order
- `src/lib/observation-event-publisher.ts` **(new)** — interface + helpers (`nextSequence`, `makeEventId`)
- `src/tests/observation-events.test.ts` **(new)** — 14 unit tests covering envelope, sequence, ordering, idempotency
- `src/tests/specflow-run.test.ts` **(new)** — CLI integration tests (autofix additions)
- `src/types/observation-events.ts` **(new)** — 15-kind catalog, envelope, per-event payload types

## Review Loop Summary

### Design Review

| Metric             | Count |
|--------------------|-------|
| Initial high       | 0     |
| Resolved high      | 0     |
| Unresolved high    | 0     |
| New high (later)   | 0     |
| Total rounds       | 1     |

Design review closed with 2 MEDIUM findings (P1 surface-event cross-ref scope, P2 envelope field count 11→12). Both accepted at design handoff; P2 was corrected during apply.

### Impl Review

| Metric             | Count |
|--------------------|-------|
| Initial high       | 2     |
| Resolved high      | 7     |
| Unresolved high    | 2     |
| New high (later)   | 7     |
| Total rounds       | 6     |

Implementation went through 4 auto-fix rounds. Loop stopped with `max_rounds_reached`; score trajectory 13 → 11 → 11 → 8. Autofix was not convergent — new HIGH findings surfaced as old ones were fixed, reflecting deeper architectural decisions (atomic commit boundary, review-decision gate path integration) that autofix cannot resolve in-loop.

## Proposal Coverage

Acceptance criteria (from issue #167 / proposal):

| # | Criterion | Covered? | Mapped Files |
|---|-----------|----------|--------------|
| 1 | Workflow observation に必要な event classes が定義されている | Yes | `src/types/observation-events.ts`, `openspec/changes/…/specs/workflow-observation-events/spec.md` |
| 2 | Snapshot state と event stream の関係が説明されている | Yes | `specs/workflow-observation-events/spec.md` (Replay requirement), `specs/workflow-run-state/spec.md` (consistency delta) |
| 3 | Phase / gate / artifact / bundle に対する event surface が明確 | Partial | `src/types/observation-events.ts` defines all 15 kinds. Artifact/bundle events are catalogued but NOT yet emitted by the publisher. |
| 4 | Server-side runtime が event を publish できる最小 contract が説明されている | Yes | Contract: `specs/workflow-observation-events/spec.md`. Reference publisher: `src/lib/local-fs-observation-event-publisher.ts`. |
| 5 | UI が realtime observation に依存してよい event semantics が明確 | Yes | Ordering / delivery / replay requirements in `specs/workflow-observation-events/spec.md`. |

**Coverage Rate**: 4/5 (80%) — one partial (#3) because progress/artifact/bundle event emission is explicitly deferred to a follow-up change per the proposal's non-goals.

## Remaining Risks

**Deterministic risks (from impl ledger):**
- R1-F01: Event emission is outside the authoritative commit boundary (severity: high)
- R6-F11: Review-decision gates still use approval-style advance semantics (severity: high)
- R6-F12: Post-commit event emission failures return the wrong exit code (severity: medium)

**Untested new files:** None — every new file is either exercised by the new test modules (`observation-events.test.ts`, `specflow-run.test.ts`) or is a spec artifact.

**Uncovered criteria:**
- ⚠️ Uncovered criterion: Progress / artifact / bundle event emission (criterion #3 is partial) — types and spec exist, but publisher does not yet emit `artifact_written`, `review_completed`, `bundle_started`, `bundle_completed`. Spec explicitly allows deferral; follow-up change to wire them into artifact store and review orchestration.

## Human Checkpoints

- [ ] **R1-F01 follow-up plan**: Before merging any consumer-facing transport change, wire event emission into the same atomic commit boundary as snapshot writes (either by making `commitTransitionAndExit` transactional or by introducing a crash-recovery journal for pending events). Current warning-on-failure path is acceptable for single-process CLI use but not for a server runtime.
- [ ] **R6-F11 follow-up plan**: Extend the `resolveGateForEvent` / gate-mutation bridge to cover `review_decision` gates so that `gate_opened` / `gate_resolved` / `gate_rejected` events fire through the same publisher path. Today they are silent.
- [ ] **R6-F12 follow-up plan**: Decide whether a publisher write failure should (a) fail the CLI exit code, (b) emit a structured warning on stdout for tooling, or (c) remain warn-only. Currently inconsistent between commands.
- [ ] **Progress event wiring**: Schedule the follow-up change that hooks `artifact_written` / `review_completed` / `bundle_started` / `bundle_completed` into the artifact store and review-orchestration code paths.
- [ ] **Surface-event-contract cross-reference**: Add a Purpose-section cross-reference in `openspec/specs/surface-event-contract/spec.md` pointing at `workflow-observation-events` (the existing `workflow-observation-events/spec.md` already references `surface-event-contract`; the reverse link is still missing and was deferred from design review P1).
