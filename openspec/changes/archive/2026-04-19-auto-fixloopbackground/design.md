## Context

Today, the review auto-fix loop
(`specflow-review-design autofix-loop` and `specflow-review-apply autofix-loop`)
runs many rounds of (a) prompting the main agent to fix design/apply
artifacts and (b) calling the review agent to re-review. Each round can
take several minutes. The loop is implemented as a single Node CLI call
(`src/bin/specflow-review-design.ts`, `src/bin/specflow-review-apply.ts`)
whose only structured output is the final `LOOP_JSON` printed to stdout
on exit. Intermediate progress is written to `process.stderr` as plain
lines such as `Auto-fix Round 2/4: Starting design fix...` and
`Warning: fix step failed ...`.

When a Claude chat surface drives this loop (via the slash-command
guides in `assets/commands/specflow.review_design.md.tmpl` and
`assets/commands/specflow.review_apply.md.tmpl`), operators have
reported the chat "freezing" for minutes with no visible progress, or
the loop silently terminating when launched with
`run_in_background: true` because nothing pollable exists between
rounds. Issue #172 ("auto-fixloopがbackgroundで起動して止まる") captures
both failure modes.

Meanwhile, the project already has three load-bearing contracts that
relate to observability:

- `workflow-observation-events` — a closed 15-kind observation event
  catalog with `review_completed` already part of the catalog.
- `review-orchestration` — defines autofix loop behavior, `max_autofix_rounds`,
  and stable config fallback semantics from `openspec/config.yaml`.
- `run-artifact-store-conformance` — defines per-run artifact storage.

This design shows how to hang a new progress contract on those existing
beams without opening the closed event catalog or forking a new
transport.

## Goals / Non-Goals

**Goals:**
- Make auto-fix loop progress observable between rounds for chat
  surfaces without requiring surface-specific tooling.
- Distinguish "loop still running" from "loop stuck" using a bounded
  heartbeat.
- Reuse the existing `review_completed` observation event kind rather
  than expand the closed 15-kind catalog.
- Persist a per-run progress snapshot under the existing run-artifact
  store so late-subscribing surfaces can reconstruct current state
  without replaying events.
- Keep the severity-aware gate (`unresolvedCriticalHighCount`) and
  `loop_no_findings` / `loop_with_findings` handoff semantics
  untouched — this change is observability-only.

**Non-Goals:**
- Changing when `apply_review_approved` / `design_review_approved`
  events are emitted (owned by `surface-event-contract` and
  `review-orchestration`).
- Adding a new observation event kind. The 15-kind catalog stays
  closed.
- Introducing a streaming transport (WebSocket / SSE). The contract is
  read via the existing event publisher and the run-artifact store.
- Changing the review ledger schema. Progress metadata references the
  ledger round id but does not duplicate round data.
- Surfacing progress for single-round `review` invocations. Only the
  multi-round `autofix-loop` flow requires the new signal.

## Decisions

### D1. Extend `review_completed` payload rather than add a new event kind

`workflow-observation-events` pins the catalog at 15 kinds and declares
the catalog closed. Adding a new kind would ripple across every
consumer (including `surface-event-contract` and
`phase-router`). Instead we extend `review_completed.payload` with an
optional `autofix` sub-object that is `null` for single-round reviews
and non-null for auto-fix round emissions. This is additive — existing
consumers that read `outcome`, `reviewer`, `score` keep working; new
consumers opt in by reading `payload.autofix`.

Alternatives considered:
- **New `autofix_progress` event kind.** Rejected: breaks the closed
  catalog rule and requires a catalog rev bump with consumer
  fan-out.
- **Reuse `phase_blocked` / `phase_reopened`.** Rejected: those events
  describe workflow-phase transitions, not review-round transitions;
  emitting them per fix round would conflate the run-level phase
  machine with loop-level round state.
- **Emit only on terminal outcomes.** Rejected: reintroduces the
  "blind mid-loop" problem that issue #172 reports.

### D2. Explicit loop initialization, then twice-per-round emission + one terminal emission

Before round 1 begins, the loop SHALL perform an explicit
initialization step that writes the progress snapshot with
`loop_state = starting`, `round_index = 0`, and
`ledger_round_id = null`. This snapshot is the only artifact produced
in the `starting` state; no `review_completed` event is emitted for
it. The `starting` state exists solely as the pre-round snapshot so
that a surface polling immediately after launch can distinguish
"loop invoked but not yet running" from "no loop running".

Once initialization completes, each started round emits a
`review_completed` event at round start (`loop_state = in_progress`)
and another at round end (`loop_state = round_reviewed` if the fix
and re-review both succeeded but the loop has not yet decided to
continue or terminate, or a terminal state if the loop ended in this
round). The round-end event is emitted **after** the re-review
completes, so the current round's ledger summary is available for
populating counters and `ledger_round_id`. Round-start events always use
`loop_state = in_progress` — the `starting` state is never carried in
an event payload. The loop also emits one final terminal event when it
exits. The heartbeat refresh is snapshot-only and does NOT emit extra
events.

This yields exactly 2N + 1 events for a loop of N rounds (N start
events + N end events + 1 terminal event). It gives surfaces a clean
round-transition signal without flooding the event stream.

Alternatives considered:
- **One event per round (end only).** Rejected: surfaces cannot tell
  "round 3 in progress" from "round 2 finished, round 3 not started"
  without polling the snapshot.
- **Heartbeat events (every N seconds).** Rejected: couples the event
  stream to wall-clock cadence; event count becomes unbounded for slow
  rounds; harder to de-duplicate by `event_id`.

### D3. Progress snapshot under run-artifact store, keyed by run_id + phase

The snapshot path is a deterministic function of `run_id` and `phase`
(`design_review` | `apply_review`) under the run-artifact store
(per `run-artifact-store-conformance`). The local filesystem backend
places it at approximately
`.specflow/runs/<run_id>/autofix-progress-<phase>.json`. Remote
surfaces see the snapshot via the same store interface.

Rationale:
- `run_id` guarantees isolation between concurrent runs of the same
  change and invisibility of stale snapshots from prior runs.
- The run-artifact store already has a conformance contract, storage
  abstraction, and polling-friendly semantics. No new store is needed.
- Splitting by `phase` prevents concurrent design and apply autofix
  loops on the same run from clobbering each other.

Alternatives considered:
- **Change-store path like `openspec/changes/<id>/review-ledger-<phase>.progress.json`.**
  Rejected: not keyed by `run_id`, so subsequent runs overwrite prior
  state; would require explicit "clear on start" logic and still leave
  a race with concurrent runs.
- **In-ledger field on `review-ledger-<phase>.json`.** Rejected:
  conflates round-summary data (authoritative) with ephemeral
  heartbeat metadata (fast-changing), increasing contention on the
  ledger write path.

### D4. Heartbeat 30s / stale 120s, configurable

The loop refreshes the snapshot's `heartbeat_at` at least every 30
seconds while non-terminal. Chat surfaces MAY classify the loop as
`abandoned` when `heartbeat_at` is older than 120 seconds.
Both bounds are configurable via `openspec/config.yaml` keys
`autofix_heartbeat_seconds` and `autofix_stale_threshold_seconds`,
following the same "invalid → default" fallback pattern documented
for `max_autofix_rounds`.

30s is short enough that a chat surface polling every ~10s produces a
responsive UX without flooding the file system, and 4× the heartbeat
gives the surface enough slack to tolerate one missed refresh before
declaring stall.

Alternatives considered:
- **Per-round heartbeat only (no wall-clock bound).** Rejected: a slow
  fix round can legitimately take > 60s, so per-round-only emission
  cannot distinguish "fixing is slow" from "process died".
- **No absolute bound (surface-configured).** Rejected: different
  surfaces would converge on different thresholds, producing
  inconsistent operator UX.

### D5. Authority precedence: ledger > events > snapshot

The review ledger's round summary is the source of truth for
round-level data (already owned by `review-orchestration`).
Observation events are the authoritative progress signal, de-duplicated
by `event_id`. The snapshot is a fast-path view; if it disagrees with
the ledger, it is stale and the ledger wins.

This matches existing practice: `current-phase.md` rendering is
already derived from the ledger snapshot, not from event history.

### D6. Abrupt termination via stale-heartbeat `abandoned` rule

If the loop process crashes or is killed mid-round, the terminal
snapshot and terminal event never fire. Rather than introduce a
finalizer or shutdown hook, we let the stale-heartbeat rule do the
work: a non-terminal `loop_state` with `heartbeat_at` older than
`autofix_stale_threshold_seconds` SHALL be classified `abandoned`. A
subsequent `/specflow.review_{design,apply}` call is allowed to
start fresh with a new `run_id` (see D8 for retry semantics).

This keeps the crash-recovery path contract-level rather than
implementation-level, which is important because the review agent and
the main agent can both fail in different ways.

### D8. Run-id discovery, retry semantics, and poller switchover

The CLI already receives `run_id` as a required argument (or resolves it
from the active run context before invoking `runAutofixLoop`). The loop
initialization snapshot (D2, `loop_state = starting`) is the first
artifact written; it contains `run_id` at a deterministic path. The
slash-command guide (D7) SHALL instruct the surface to resolve the
active `run_id` **before** launching the background CLI — the same
`run_id` the surface already holds from the review-orchestration flow
that preceded the autofix invocation. The surface passes this `run_id`
to the CLI and uses it to compute the snapshot path for polling.

**Retry after `abandoned`:** A fresh invocation after an `abandoned`
classification SHALL generate a **new `run_id`**. The old snapshot
becomes unreachable because the run-artifact store is keyed by
`run_id`; no explicit cleanup is required. The surface switches to the
new `run_id` naturally because it is the one that launched the new
CLI invocation and holds the new `run_id` from the orchestration
context.

**Poller switchover rule:** A surface that detects `abandoned` on
`run_id_old` and triggers a retry receives `run_id_new` from the
orchestration layer. It SHALL stop polling `run_id_old` and begin
polling `run_id_new`'s snapshot path. There is no need to "migrate"
state — the new run starts from `loop_state = starting` with its own
independent event stream and snapshot.

Rationale:
- Reusing `run_id` across retries would create ambiguity: events from
  the old run and the new run would share the same `run_id` in the
  event stream, breaking de-duplication and ordering guarantees.
- A new `run_id` per invocation aligns with the existing
  `run-artifact-store-conformance` lifecycle: each run is an isolated
  artifact namespace.

### D9. Base payload field values for non-terminal autofix emissions

When a `review_completed` event is emitted as an autofix progress
signal (non-terminal), the base payload fields SHALL carry the
following values:

- **`outcome`**: `"autofix_in_progress"` — a reserved outcome value
  explicitly admitted to the `review_completed` outcome enum in the
  `workflow-observation-events` spec (alongside `"approved"`,
  `"changes_requested"`, `"rejected"`). It is valid **only** for
  non-terminal autofix emissions (`loop_state ∈ {in_progress,
  round_reviewed}`); terminal autofix emissions and all non-autofix
  review completions continue to use the original three values. This
  ensures consumers that switch on `outcome` for finalization logic
  never accidentally treat a progress emission as a completed review.
- **`reviewer`**: the reviewer actor identity (e.g., `"codex"`) —
  populated from the loop's configured reviewer, same as terminal
  events. This is always known at loop start.
- **`score`**: `null` — no review score exists until the re-review
  completes. Consumers that read `score` for display SHALL treat
  `null` as "not yet scored".

For the **initialization snapshot** (`loop_state = starting`,
`round_index = 0`): no `review_completed` event is emitted (per D2),
so there is no base payload to populate. The snapshot itself carries
`ledger_round_id = null` and `counters` with all values set to `0`
(no prior round data exists).

For **round-start events** (`loop_state = in_progress`):
`autofix.counters` SHALL be populated from the **previous round's**
ledger summary if `round_index > 1`, or all zeros if `round_index = 1`
(first round, no prior review data). `autofix.ledger_round_id` SHALL
reference the previous round's ledger round id if available, or `null`
for round 1.

For **round-end events** (`loop_state = round_reviewed` or terminal):
`autofix.counters` and `autofix.ledger_round_id` SHALL be populated
from the **current round's** ledger summary, which exists because the
re-review has just completed.

**Consumer discrimination rule:** Consumers SHALL distinguish autofix
progress events from actual review-result events by checking
`payload.autofix !== null`. When `payload.autofix` is non-null,
`outcome = "autofix_in_progress"` signals that the base payload does
not represent a finalized review. Consumers that only care about
finalized reviews SHOULD filter on
`payload.autofix === null || loop_state ∈ {terminal_success, terminal_failure}`.

### D7. Slash-command guide mandates background + polling, not streaming

`/specflow.review_design` and `/specflow.review_apply` SHALL invoke the
auto-fix loop with `run_in_background: true` (or the surface-native
equivalent) and SHALL poll the snapshot / event stream between rounds.
`stderr` output MAY remain as a human aid but is NOT the contract
source. The guide SHALL document the `abandoned` rule and finalize
only on terminal `loop_state` observation.

Alternatives considered:
- **Mandate synchronous + streamed stdout.** Rejected: conflicts with
  chat surfaces that cannot render incremental stdout and reintroduces
  the "frozen chat" failure mode.
- **Leave invocation pattern up to surface.** Rejected: issue #172
  reports that one of two patterns (synchronous block or
  fire-and-forget) is actively used in production and both are
  broken. We need a canonical pattern.

## Risks / Trade-offs

- **[Risk]** Extending `review_completed` payload silently breaks
  strict consumers that reject unknown fields. → **Mitigation**: the
  `workflow-observation-events` spec already states "Unknown payload
  fields are tolerated for forward compatibility". The `autofix` field
  is `null` for single-round reviews, so existing consumers reading
  `outcome`/`reviewer`/`score` see no change.
- **[Risk]** Snapshot writes every 30s may saturate I/O on slow disks
  or network-backed artifact stores. → **Mitigation**: the heartbeat
  interval is configurable; the snapshot itself is small
  (<2 KB). The run-artifact store interface already handles batching
  where applicable.
- **[Risk]** Terminal event may not arrive if the process is killed
  between writing the final snapshot and emitting the final event. →
  **Mitigation**: the authority precedence rule says the ledger wins;
  a snapshot with `loop_state = terminal_success` plus a ledger round
  summary in `done` state is sufficient for a surface to finalize.
- **[Trade-off]** The 2N+1 event count is higher than an end-only
  scheme (N+1). → For the practical range of loops
  (`max_autofix_rounds = 4` default), this is 9 vs 5 events per loop —
  a tolerable increase for the UX win of distinguishing "round N
  running" from "round N-1 done".
- **[Risk]** Concurrent design and apply autofix loops on the same
  run would race on snapshot writes if we keyed the file by run_id
  alone. → **Mitigation**: the path is keyed by both `run_id` and
  `phase`, so the two loops write to distinct files.
- **[Trade-off]** The snapshot duplicates round counters that already
  live in the ledger. → **Mitigation**: the snapshot cross-references
  the ledger round id; consumers that need authoritative data read the
  ledger. The snapshot exists as a fast-path for surfaces that do not
  want to open and parse the ledger between each poll tick.

## Migration Plan

1. **Land contract first.** Merge the spec delta for
   `review-autofix-progress-observability`,
   `workflow-observation-events`, `review-orchestration`, and
   `slash-command-guides` without any runtime change. This locks the
   schema before any consumer starts reading it.
2. **Wire event emission.** Extend `runAutofixLoop` in
   `src/bin/specflow-review-design.ts` and `src/bin/specflow-review-apply.ts`
   to build and publish `review_completed` events with the `autofix`
   payload at round-start, round-end, and loop-terminal via the
   existing `ObservationEventPublisher` plumbing.
3. **Wire snapshot write.** Add a progress-snapshot writer in
   `src/lib/review-runtime.ts` (or a new
   `src/lib/autofix-progress-snapshot.ts` helper) that uses the
   run-artifact store interface. Trigger the writer at the same round
   boundaries plus a setInterval-based heartbeat timer bounded by
   `autofix_heartbeat_seconds`.
4. **Read config keys.** Extend `readReviewConfig` in
   `src/lib/review-runtime.ts` to surface
   `autofix_heartbeat_seconds` and `autofix_stale_threshold_seconds`
   with fallback defaults 30 and 120.
5. **Update slash-command templates.** Rewrite the "Auto-fix Loop"
   sections of `assets/commands/specflow.review_design.md.tmpl` and
   `assets/commands/specflow.review_apply.md.tmpl` to document the
   background + polling pattern, per-round rendering, and `abandoned`
   rule. Regenerate snapshot tests.
6. **No rollback strategy is needed beyond reverting the merge.**
   The contract is additive (`autofix` defaults to `null`); runtime
   emission can be gated behind a `loadConfigEnv` boolean if a
   staged rollout is desired, but the default is to enable it.

## Open Questions

_None remaining after proposal challenge + reclarify + R2 + R3 review._
All seven challenge items (C1 loop-state enum, C2 event-emission
timing, C3 heartbeat / stale bounds, C4 snapshot discovery, C5
authority precedence, C6 abrupt termination, C7 severity counters)
have explicit decisions captured in D1–D6 above. R2 review findings
(run-id discovery / retry semantics, non-terminal payload contract)
are resolved by D8 and D9 respectively. R3-F05 (outcome enum
contradiction) is resolved by explicitly admitting
`"autofix_in_progress"` to the `review_completed` outcome enum in
the `workflow-observation-events` spec, scoped to non-terminal
autofix emissions only (D9 updated).

## Concerns

- **C-progress-signal** — Auto-fix rounds are invisible to chat
  surfaces between rounds. Resolved by the combination of (a)
  round-boundary `review_completed` events carrying an `autofix`
  payload and (b) a per-run progress snapshot with a bounded
  heartbeat.
- **C-stuck-vs-running** — Surfaces cannot distinguish a slow-but-
  progressing loop from a crashed loop. Resolved by the
  `autofix_heartbeat_seconds` / `autofix_stale_threshold_seconds`
  bound and the `abandoned` classification rule.
- **C-surface-agnostic** — Today the fix hinges on Claude-chat tooling
  (`run_in_background`, Monitor). Resolved by defining the contract
  over the run-artifact store plus the observation event stream, so
  remote-api / agent-native / batch surfaces consume the same signal.
- **C-closed-event-catalog** — Adding a new event kind would violate
  the `workflow-observation-events` closed-catalog rule. Resolved by
  extending the existing `review_completed` payload with an additive
  `autofix` sub-object.

## State / Lifecycle

- **`loop_state`** (canonical per-run-per-phase state, 5 values):
  `starting` → `in_progress` ↔ `round_reviewed` →
  `terminal_success` | `terminal_failure`. `starting` is observable
  only before round 1 begins; every subsequent transition is
  observable via a `review_completed` event and by the progress
  snapshot.
- **`terminal_outcome`** (derived on terminal states): one of
  `loop_no_findings`, `loop_with_findings`, `max_rounds_reached`,
  `no_progress`, `consecutive_failures`. Null for non-terminal
  states.
- **`abandoned`** (surface-derived, not persisted): a non-terminal
  `loop_state` with a stale `heartbeat_at`. Not part of the
  persisted state — surfaces derive it on each poll.
- **Persistence boundaries**: the ledger persists round summaries
  (durable, `review-orchestration` owned); the snapshot persists
  in-flight loop state (run-artifact store, auto-cleaned on run
  termination via the existing artifact lifecycle); observation
  events persist in the event stream (already owned by
  `workflow-observation-events`).

## Contracts / Interfaces

- **Observation event contract** (owned by
  `workflow-observation-events`): extended `review_completed.payload`
  with optional `autofix: AutofixRoundPayload | null` and the outcome
  enum expanded to `"approved" | "changes_requested" | "rejected" |
  "autofix_in_progress"`. Non-terminal autofix emissions use
  `outcome = "autofix_in_progress"` and `score = null` (D9); terminal
  autofix and non-autofix emissions use the original three values.
  Envelope is unchanged.
- **Progress snapshot contract** (new, owned by
  `review-autofix-progress-observability`): JSON schema with
  `schema_version`, `run_id`, `change_id`, `phase`, `round_index`,
  `max_rounds`, `loop_state`, `terminal_outcome`, `counters`,
  `heartbeat_at`, `ledger_round_id`.
- **Run-artifact store interface** (owned by
  `run-artifact-store-conformance`): reused to store / fetch the
  snapshot at a `run_id` + `phase` keyed path.
- **Review runtime config** (owned by `review-orchestration`): two
  new keys (`autofix_heartbeat_seconds`, `autofix_stale_threshold_seconds`)
  with stable defaults 30 and 120.
- **Slash-command guide contract** (owned by
  `slash-command-guides`): `/specflow.review_design` and
  `/specflow.review_apply` SHALL document the background-invocation +
  polling pattern, including run_id resolution before launch and
  poller switchover on retry after `abandoned` (D8).
- **Consumer interface (inputs):** chat surfaces and headless
  consumers read the snapshot (via the run-artifact store) and/or
  subscribe to the observation event stream; both are additive to
  existing interfaces.
- **Consumer interface (outputs):** none — the contract is
  read-only from the surface perspective.

## Persistence / Ownership

- **Ledger (`review-ledger-<phase>.json`)** — owned by
  `review-orchestration`; source of truth for round summaries,
  findings, and final loop outcome.
- **Progress snapshot (`autofix-progress-<phase>.json` under the
  run-artifact store)** — owned by
  `review-autofix-progress-observability`; mutable, heartbeat-driven,
  auto-cleaned on run termination.
- **Observation event stream** — owned by
  `workflow-observation-events`; append-only, de-duplicated by
  `event_id`.
- **`openspec/config.yaml` config keys** — owned by
  `review-orchestration`; read-only from the loop's perspective.
- **Slash-command assets (`.md.tmpl`)** — owned by
  `slash-command-guides`; generated into `global/commands/*.md` via
  the existing contract-driven distribution.

## Integration Points

- **Observation event publisher** (existing plumbing via
  `emitGateOpened` and sibling helpers in `src/lib/`) — extend to
  publish `review_completed` with `autofix` payload.
- **Run-artifact store** (existing `LocalFsRunArtifactStore` and
  conformance contract) — reused to persist the snapshot; no
  interface change.
- **Review runtime** (`src/lib/review-runtime.ts`,
  `src/lib/review-ledger.ts`) — extended to derive `counters` from
  the ledger and to expose the new config keys via
  `readReviewConfig`.
- **CLI entry points** (`src/bin/specflow-review-design.ts`,
  `src/bin/specflow-review-apply.ts`) — `runAutofixLoop` functions
  gain event-emission and snapshot-write sites plus a heartbeat
  timer.
- **Slash-command template render pipeline** (existing
  `renderPhaseMarkdown` + `.md.tmpl` → `global/commands/<id>.md`) —
  receives the updated template; snapshot tests regenerate.
- **Chat surface (Claude code)** — `/specflow.review_design` and
  `/specflow.review_apply` read the snapshot file and/or the event
  stream; no new tool dependency beyond what they already use.

## Ordering / Dependency Notes

1. **Foundational (must land first):** spec deltas for all four
   capabilities. These are already drafted and validated.
2. **Contract wiring:** `src/contracts/` and `src/lib/schemas.ts`
   extensions for `AutofixRoundPayload` and the snapshot schema. This
   is prerequisite to the CLI runtime changes.
3. **Runtime wiring (parallel-safe):**
   - Explicit loop-initialization snapshot (`loop_state = starting`,
     `round_index = 0`, `ledger_round_id = null`) written before
     round 1 begins.
   - CLI event-emission sites in `runAutofixLoop` (round-start events
     always use `loop_state = in_progress`, never `starting`).
   - Snapshot writer + heartbeat timer in a new helper under
     `src/lib/`.
   - Config-key reads in `readReviewConfig`.
4. **Slash-command template rewrites** — can land in parallel with
   the runtime once the schemas exist, since the templates only
   reference schema names / paths.
5. **Snapshot tests** — updated last, after both runtime and
   template changes are in; regenerating them pins the new contract
   visually.

## Completion Conditions

- **Per-capability completion**: each MODIFIED / ADDED requirement
  has corresponding runtime wiring AND passes the existing
  `openspec validate` + `specflow-spec-verify` gates on baseline
  after archive.
- **Integration completion (end-to-end)**: an operator running
  `/specflow.review_design` or `/specflow.review_apply` against a
  seeded change in a Claude chat observes (a) round-start and
  round-end updates rendered to the chat within
  `autofix_stale_threshold_seconds` of each round transition, (b) a
  terminal update rendered when the loop exits, and (c) an
  `abandoned` classification if the loop process is killed
  mid-round.
- **Regression check**: single-round `review` invocations (not
  `autofix-loop`) continue to emit `review_completed` events with
  `payload.autofix = null`; no consumer that currently reads
  `outcome`/`reviewer`/`score` breaks.
- **Observable completion**: the progress snapshot is visible in the
  run-artifact store at the deterministic path; the observation
  event stream contains 2N+1 `review_completed` events per loop of
  N rounds; `review-ledger-<phase>.json` round summaries match the
  snapshot's `ledger_round_id` references.
