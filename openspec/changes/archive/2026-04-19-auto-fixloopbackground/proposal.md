## Why

When `/specflow.review_design` or `/specflow.review_apply` triggers the auto-fix
loop (`specflow-review-{design,apply} autofix-loop`) from a Claude chat session,
the entire multi-round loop runs as a single long-lived Bash invocation. The
command only returns its final `LOOP_JSON` on exit, and intermediate progress is
written to `process.stderr` as plain lines (`Auto-fix Round N/M: Starting ...`).

Inside a Claude chat surface this produces two failure modes:

1. If the slash command runs the loop synchronously, the chat appears "frozen"
   until the loop finishes — often many minutes — with no indication of which
   round is in progress, whether findings are decreasing, or whether the loop
   has stalled.
2. If the slash command runs the loop in background (`run_in_background: true`),
   the operator has no structured way to observe progress. The loop looks
   "started and stopped" even when it is still iterating, because no surface
   event, ledger update, or progress artifact is consulted between rounds.

The existing contracts (`workflow-observation-events`, `review-orchestration`,
`surface-event-contract`) already declare observation and review round data as
first-class workflow state. The auto-fix loop is currently invisible to those
contracts while it runs: each round internally re-reviews and updates the
ledger, but nothing emits a round-level progress event or a pollable snapshot,
and the slash-command guides do not define an invocation pattern that a chat
surface can rely on for long-running loops.

Reference: https://github.com/skr19930617/specflow/issues/172
(`auto-fixloopがbackgroundで起動して止まる — claudeのチャット経由で進めている場合に
auto-fixの進捗を適宜表示する仕組みを入れる`).

## What Changes

### Loop state model

- Define a closed five-state loop-state enum that the event payload and the
  progress snapshot SHALL expose:
  - `starting` — loop has been invoked but has not yet begun round 1
  - `in_progress` — a fix round is actively being performed (main agent
    rewriting design/tasks or apply diff)
  - `awaiting_review` — the round's fix step has completed and the review
    agent is re-reviewing
  - `terminal_success` — loop ended with the severity-aware gate satisfied
    (`loop_no_findings` handoff)
  - `terminal_failure` — loop ended in any non-success terminal outcome
    (`loop_with_findings`, `max_rounds_reached`, `no_progress`,
    `consecutive_failures`). The specific outcome SHALL also be carried as
    a distinct sub-field so surfaces can report the exact reason.

### Observation event emissions

- Reuse the existing `review_completed` event kind in the
  `workflow-observation-events` catalog (the 15-kind catalog SHALL remain
  closed). For each auto-fix round the loop SHALL emit **two** events —
  one when the round starts (`loop_state = in_progress`) and one when the
  round ends (`loop_state = awaiting_review` or terminal). The loop SHALL
  additionally emit **one** terminal `review_completed` event carrying
  `loop_state ∈ {terminal_success, terminal_failure}` and the final
  outcome.
- The event payload SHALL be extended with auto-fix round metadata: `run_id`,
  `change_id`, `round_index`, `max_rounds`, `loop_state`,
  `terminal_outcome` (nullable until terminal), and a severity counter
  object carrying `unresolvedCriticalHigh`, `totalOpen`,
  `resolvedThisRound`, `newThisRound`, and `severitySummary` — all derived
  from `unresolvedCriticalHighCount` and the review ledger round summary.
  The closed envelope fields are NOT modified.

### Progress snapshot artifact

- Persist a per-run progress snapshot at a deterministic path keyed by
  `run_id` under the run-artifact store (discoverable via the existing
  `run-artifact-store-conformance` contract). This guarantees the
  snapshot is uniquely associated with the active run and that stale files
  from prior runs of the same change are invisible.
- The snapshot SHALL carry the same loop-state enum, round metadata, and
  severity counters as the event payload, plus a monotonic
  `heartbeat_at` ISO-8601 UTC timestamp.
- The loop SHALL refresh the snapshot heartbeat **at least every 30 seconds**
  while running, independent of round emission cadence. Chat surfaces that
  observe a stale `heartbeat_at` older than **120 seconds** MAY treat the
  loop as stuck (`abandoned`). Both bounds SHALL be overridable via
  `openspec/config.yaml`.

### Abrupt termination handling

- If a surface polls the snapshot and finds `loop_state ∉
  {terminal_success, terminal_failure}` with a `heartbeat_at` stale
  beyond the configured stale threshold, it SHALL classify the run as
  `abandoned`. A subsequent `/specflow.review_{design,apply}` invocation
  SHALL be allowed to resume with a fresh round (no blocking on the
  abandoned artifact).

### Authority precedence

- When the ledger, event stream, and snapshot disagree, the contract
  SHALL be: **ledger > events > snapshot**. The ledger round summary is
  the source of truth for round-level data; observation events are the
  authoritative progress signal (idempotent via `event_id`); the
  snapshot is a fast-path reconstruction view that MAY be stale relative
  to the ledger.

### Slash-command invocation pattern

- Update the slash-command guides for `/specflow.review_design` and
  `/specflow.review_apply` to mandate the background-invocation +
  progress-polling pattern. The chat surface SHALL launch the CLI with
  `run_in_background: true`, poll the progress snapshot and/or the
  observation event stream between rounds, render a per-round update to
  the user, and only finalize when a terminal `loop_state` is observed
  or an `abandoned` classification is reached. Existing stderr logging
  MAY remain as a human aid but SHALL NOT be the contract source of
  progress.

### Surface-agnostic contract

- The progress signal SHALL be consumable by any surface adapter
  (Claude chat, remote-api, agent-native, batch) via the existing
  observation/event plumbing plus the progress snapshot file. No
  Claude-specific side channel SHALL be introduced.

## Capabilities

### New Capabilities
- `review-autofix-progress-observability`: Round-level progress contract
  for the review auto-fix loop. Owns the loop-state enum, the progress
  snapshot artifact (location, schema, heartbeat bounds), the abrupt-
  termination `abandoned` rule, the authority precedence rule, and the
  polling pattern that slash-command guides MUST follow. Surface-
  agnostic.

### Modified Capabilities
- `workflow-observation-events`: Extend the `review_completed` payload
  (not the 15-kind catalog) to carry auto-fix round metadata:
  `round_index`, `max_rounds`, `loop_state`, `terminal_outcome`, and
  the severity counter object defined above. The closed-catalog rule
  and existing envelope fields are preserved.
- `review-orchestration`: The auto-fix loop requirement SHALL state
  that each started round emits a round-start and round-end
  `review_completed` event, that the loop SHALL refresh the per-run
  progress snapshot heartbeat at least every 30 seconds, and that the
  loop's terminal outcome is recorded both in the final ledger round
  summary and in the final progress snapshot + event. The existing
  severity-aware gate semantics (`unresolvedCriticalHighCount`) and
  `loop_no_findings` / `loop_with_findings` handoff states are
  preserved; the new contract only adds observability.
- `slash-command-guides`: The `/specflow.review_design` and
  `/specflow.review_apply` guides SHALL define the background-
  invocation + progress-polling pattern for chat surfaces when driving
  the auto-fix loop, SHALL describe the `abandoned` classification
  rule, and SHALL NOT require the surface to block on a single
  synchronous Bash call for the full loop.

## Impact

- `specflow-review-design` and `specflow-review-apply` CLIs: the
  `autofix-loop` subcommand MUST (a) emit round-start and round-end
  `review_completed` events carrying auto-fix round metadata, (b) emit
  a terminal `review_completed` event with the final `loop_state` and
  `terminal_outcome`, (c) write the per-run progress snapshot under
  the run-artifact store at a deterministic `run_id`-keyed path, and
  (d) refresh the snapshot heartbeat at least every 30 seconds.
  Existing `stderr` logging MAY remain as a human aid but SHALL NOT
  be the contract source of progress.
- `workflow-observation-events` consumers (surface adapters, ledger
  readers): will see an extended `review_completed` payload shape.
  All existing required envelope fields (`event_id`, `event_kind`,
  `run_id`, `sequence`, `timestamp`, etc.) remain unchanged.
- `review-orchestration` ledger: round summaries and terminal loop
  result SHALL remain the source of truth; the new progress snapshot
  and round events cross-reference ledger round ids rather than
  duplicating round data.
- `run-artifact-store-conformance` consumers: will see a new per-run
  artifact kind for the auto-fix progress snapshot at a deterministic
  path. No change to the store interface itself.
- `openspec/config.yaml`: introduces overridable defaults for the
  heartbeat-refresh interval (`autofix_heartbeat_seconds`, default 30)
  and the stale threshold (`autofix_stale_threshold_seconds`, default
  120). Missing or invalid values fall back to the defaults using the
  same pattern documented in `review-orchestration` for
  `max_autofix_rounds`.
- `assets/commands/specflow.review_design.md.tmpl` and
  `assets/commands/specflow.review_apply.md.tmpl`: update the "Run
  Orchestrator" / "Auto-fix Loop" sections to mandate background
  invocation, progress polling, per-round chat rendering, the
  `abandoned` classification rule, and terminal-state finalization.
  Matching snapshot tests
  (`src/tests/__snapshots__/specflow.review_{design,apply}.md.snap`)
  will be updated.
- No change to severity-aware gate semantics, reviewer actor rules, or
  the `review_decision` gate contract — those remain owned by
  `review-orchestration` and `workflow-gate-semantics`.
