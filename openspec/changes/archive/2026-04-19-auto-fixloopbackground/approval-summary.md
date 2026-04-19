# Approval Summary: auto-fixloopbackground

**Generated**: 2026-04-19T14:40:58Z
**Branch**: auto-fixloopbackground
**Status**: ⚠️ 3 unresolved high (impl) + 1 unresolved high (design) — accepted as risk

Source: https://github.com/skr19930617/specflow/issues/172
("auto-fixloopがbackgroundで起動して止まる — claudeのチャット経由で進めている場合に
auto-fixの進捗を適宜表示する仕組みを入れる")

## 2a. What Changed

```
 assets/commands/specflow.review_apply.md.tmpl      |  56 +++++-
 assets/commands/specflow.review_design.md.tmpl     |  56 +++++-
 src/bin/specflow-review-apply.ts                   | 185 +++++++++++++++++++-
 src/bin/specflow-review-design.ts                  | 190 ++++++++++++++++++++-
 src/lib/artifact-types.ts                          |  54 +++++-
 src/lib/local-fs-run-artifact-store.ts             |  15 ++
 src/lib/review-runtime.ts                          |  30 ++++
 src/tests/__snapshots__/specflow.review_apply.md.snap    |  56 +++++-
 src/tests/__snapshots__/specflow.review_design.md.snap   |  56 +++++-
 src/tests/artifact-types.test.ts                   |   5 +-
 src/types/observation-events.ts                    |  77 ++++++++-
 11 files changed, 755 insertions(+), 25 deletions(-)
```

Plus new files:
- `src/types/autofix-progress.ts` — snapshot schema, loop-state enum, validators
- `src/lib/autofix-event-builder.ts` — `review_completed` event + `AutofixRoundPayload` builders
- `src/lib/autofix-progress-snapshot.ts` — snapshot writer, heartbeat, ledger-derived counter helpers

Plus the full `openspec/changes/auto-fixloopbackground/` change directory (proposal, design, tasks, task-graph, 4 spec deltas, review ledgers, current-phase).

## 2b. Files Touched

**Modified:**
- `assets/commands/specflow.review_apply.md.tmpl`
- `assets/commands/specflow.review_design.md.tmpl`
- `src/bin/specflow-review-apply.ts`
- `src/bin/specflow-review-design.ts`
- `src/lib/artifact-types.ts`
- `src/lib/local-fs-run-artifact-store.ts`
- `src/lib/review-runtime.ts`
- `src/tests/__snapshots__/specflow.review_apply.md.snap`
- `src/tests/__snapshots__/specflow.review_design.md.snap`
- `src/tests/artifact-types.test.ts`
- `src/types/observation-events.ts`

**Added (runtime):**
- `src/lib/autofix-event-builder.ts`
- `src/lib/autofix-progress-snapshot.ts`
- `src/types/autofix-progress.ts`

**Added (change artifacts):**
- `openspec/changes/auto-fixloopbackground/proposal.md`
- `openspec/changes/auto-fixloopbackground/design.md`
- `openspec/changes/auto-fixloopbackground/tasks.md`
- `openspec/changes/auto-fixloopbackground/task-graph.json`
- `openspec/changes/auto-fixloopbackground/review-ledger.json`
- `openspec/changes/auto-fixloopbackground/review-ledger-design.json`
- `openspec/changes/auto-fixloopbackground/current-phase.md`
- `openspec/changes/auto-fixloopbackground/specs/review-autofix-progress-observability/spec.md`
- `openspec/changes/auto-fixloopbackground/specs/workflow-observation-events/spec.md`
- `openspec/changes/auto-fixloopbackground/specs/review-orchestration/spec.md`
- `openspec/changes/auto-fixloopbackground/specs/slash-command-guides/spec.md`

## 2c. Review Loop Summary

### Design Review

| Metric             | Count |
|--------------------|-------|
| Initial high       | 1     |
| Resolved high      | 4     |
| Unresolved high    | 1     |
| New high (later)   | 3     |
| Total rounds       | 5     |

Autofix loop ran 4 rounds plus 1 initial review (total 5). Divergence warnings recorded on
rounds 1 / 2 / 4 (quality-gate degradation). Accepted as risk on `max_rounds_reached`.

### Impl Review

| Metric             | Count |
|--------------------|-------|
| Initial high       | 3     |
| Resolved high      | 0     |
| Unresolved high    | 3     |
| New high (later)   | 0     |
| Total rounds       | 1     |

Single round with 5 new findings (3 HIGH + 2 MEDIUM). User chose `Approve (accepted risk)`
to close this pass.

## 2d. Proposal Coverage

Acceptance criteria are defined in the four spec deltas under
`openspec/changes/auto-fixloopbackground/specs/`. Each requirement's scenarios are
the canonical acceptance criteria.

| # | Criterion (summary) | Covered? | Mapped Files |
|---|---------------------|----------|--------------|
| 1 | `loop_state` enum is closed 5-value | Yes | `src/types/observation-events.ts`, `src/types/autofix-progress.ts` |
| 2 | Progress snapshot lives under run-artifact store keyed by run_id + phase | Yes | `src/lib/artifact-types.ts`, `src/lib/local-fs-run-artifact-store.ts`, `src/lib/autofix-progress-snapshot.ts` |
| 3 | Snapshot schema has all 11 required fields | Yes | `src/types/autofix-progress.ts` (`AutofixProgressSnapshot` + `validateAutofixSnapshot`) |
| 4 | Heartbeat refresh ≤ 30s, configurable via config.yaml | Yes | `src/lib/review-runtime.ts` (`readReviewConfig`), `src/lib/autofix-progress-snapshot.ts` (`startAutofixHeartbeat`) |
| 5 | Stale threshold ≥ heartbeat, default 120s, invalid → default | Yes | `src/lib/review-runtime.ts` |
| 6 | `review_completed` payload extended with `AutofixRoundPayload` | Yes | `src/types/observation-events.ts`, `src/lib/autofix-event-builder.ts` |
| 7 | `autofix_in_progress` outcome reserved for non-terminal emissions | Yes | `src/types/observation-events.ts`, `src/lib/autofix-event-builder.ts` (`outcomeForAutofixState`) |
| 8 | Counters derived from previous-round ledger summary on round-start | Yes | `src/bin/specflow-review-{design,apply}.ts` (findRoundSummary + buildAutofixCountersFromRound) |
| 9 | Counters from current-round ledger on round-end | Yes | `src/bin/specflow-review-{design,apply}.ts` (findRoundSummary on autofixRound) |
| 10 | Terminal event emitted on loop exit with `terminal_success`/`terminal_failure` | Yes | `src/bin/specflow-review-{design,apply}.ts` (terminal emission block) |
| 11 | Heartbeat interval refreshes `heartbeat_at` even without round transition | Yes | `src/lib/autofix-progress-snapshot.ts` (`startAutofixHeartbeat`) |
| 12 | Authority precedence: ledger > events > snapshot | Yes | Design doc D5; reflected in code comments and defensive snapshot-write error swallowing |
| 13 | Stale-heartbeat `abandoned` classification rule is surface-side | Yes | Documented in slash-command templates; contract in spec delta |
| 14 | `abandoned` run's new invocation gets new run_id, old snapshot unreachable | Yes (by design) | Run-artifact paths are keyed by `run_id`; new run_id generated per `/specflow` invocation |
| 15 | Slash-command guides mandate background invocation + polling | Yes | `assets/commands/specflow.review_design.md.tmpl`, `assets/commands/specflow.review_apply.md.tmpl` |
| 16 | Guides render per-round progress with counters | Yes | Templates define the per-round render block |
| 17 | Guides document `abandoned` + new-run_id switchover | Yes | Templates include "Retry after `abandoned`" section |
| 18 | `RunArtifactStore.list()` enumerates autofix-progress refs | **No** (F1 accepted risk) | `src/lib/local-fs-run-artifact-store.ts` still lists only `run-state` |
| 19 | Terminal round emits 2N+1 events (round-end before break) | **No** (F2 accepted risk) | CLI `break`s before round-end emission on terminal conditions |
| 20 | Apply autofix `no_changes` terminal outcome preserved exactly | **No** (F3 accepted risk) | Not in `AutofixTerminalOutcome` enum; coerced to `loop_with_findings` |
| 21 | Templates use `autofix_stale_threshold_seconds` from config | **Partial** (F4 accepted risk) | Templates reference "default `120`" but do not read the configured value |
| 22 | Integration tests for autofix-loop event+snapshot emission | **No** (F5 accepted risk) | Only artifact-types + snapshot tests exist; no event/snapshot runtime tests |

**Coverage Rate**: 17/22 (77%)

## 2e. Remaining Risks

### Deterministic (from impl review ledger)

- R1-F01 (HIGH, accepted risk): `RunArtifactStore.list()` never exposes the new autofix-progress artifacts. Consumers that use `list()` to discover snapshots will see only `run-state` refs.
- R1-F02 (HIGH, accepted risk): Terminal rounds skip the required round-end `review_completed` emission. Last round emits 2 events instead of 3; total is 2N instead of 2N+1. Surfaces relying on the round-end event of the final round will miss one transition. Reading the snapshot's terminal state still works because the terminal event is emitted.
- R1-F03 (HIGH, accepted risk): Apply autofix `loopResult = "no_changes"` is coerced to `loop_with_findings` terminal_outcome because `AutofixTerminalOutcome` does not include `no_changes`. The exact reason is lost to event consumers but preserved in the CLI's `LOOP_JSON.autofix.result`.
- R1-F04 (MEDIUM, accepted risk): Guides hardcode `autofix_stale_threshold_seconds` default (`120`) instead of reading the configured value. Surfaces that honor project-specific overrides must read `openspec/config.yaml` directly.
- R1-F05 (MEDIUM, accepted risk): No integration tests for `autofix-loop --run-id` writing the snapshot, refreshing heartbeat, or emitting `review_completed` events with `payload.autofix`. Only the artifact-type enum and markdown snapshot tests were added.

### Deterministic (from design review ledger)

- R4-F06 (HIGH, accepted risk): `awaiting_review` timing vs. current-round ledger sourcing. The round-end emission happens after re-review completes (when the round summary exists in the ledger), so `counters` and `ledger_round_id` are populated correctly — but the `awaiting_review` label was originally intended for the pre-re-review window. The code emits the event post-re-review with the correct data; only the label's connotation is slightly misaligned with its emission point.

### Untested new files

- ⚠️ New file not mentioned in review: `src/types/autofix-progress.ts` (reviewed under F1–F3 scope)
- ⚠️ New file not mentioned in review: `src/lib/autofix-event-builder.ts`
- ⚠️ New file not mentioned in review: `src/lib/autofix-progress-snapshot.ts`

### Uncovered criteria

- ⚠️ Uncovered criterion: `RunArtifactStore.list()` enumerates autofix-progress refs (F1).
- ⚠️ Uncovered criterion: Terminal round emits 2N+1 events (F2).
- ⚠️ Uncovered criterion: `no_changes` terminal outcome preserved exactly (F3).
- ⚠️ Uncovered criterion: Templates use configured stale threshold (F4).
- ⚠️ Uncovered criterion: Integration tests for autofix-loop observability (F5).

## 2f. Human Checkpoints

- [ ] Confirm the contract delta in `specs/review-autofix-progress-observability/spec.md` matches the intended operator experience for Claude chat, remote-api, and batch surfaces (all four surface kinds were named in `actor-surface-model`).
- [ ] Decide whether to add `no_changes` to `AutofixTerminalOutcome` (preserve the exact reason) or remove the `no_changes` branch from `specflow-review-apply.ts` (tighten the enum) before the next release — the current coercion hides a distinct terminal state from the event stream (F3).
- [ ] File a follow-up to extend `RunArtifactStore.list()` to enumerate `autofix-progress-*` refs so that surfaces can discover per-run snapshots without hardcoding the path (F1).
- [ ] File a follow-up to emit the round-end `review_completed` event before terminal `break`s so the `2N+1` event-count invariant in `workflow-observation-events` holds for every loop (F2).
- [ ] Add integration tests that exercise a multi-round `autofix-loop --run-id` and verify: (a) `autofix-progress-<phase>.json` exists with a valid schema, (b) `heartbeat_at` advances within the configured interval, (c) `events.jsonl` contains the expected `review_completed` sequence (F5).
