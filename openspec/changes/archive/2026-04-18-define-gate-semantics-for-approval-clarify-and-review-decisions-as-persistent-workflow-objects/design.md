## Context

specflow runs today persist gated decisions through two concrete record types (`ApprovalRecord`, `ClarifyRecord`) plus a review ledger for Codex-driven proposal challenge / design review / apply review rounds. Each of these lives on a slightly different axis:

- `ApprovalRecord` represents the runtime's "is the author OK to advance past this phase" question. It is created in transitions into `spec_ready`, `design_ready`, `apply_ready`.
- `ClarifyRecord` represents a single author-facing question that needs an answer before the current phase can be declared clean.
- The review ledger represents the Codex review round's findings and the human's decision on whether to accept, reject, or request changes.

From the runtime's perspective these are three different shapes, but from a surface's perspective (a CLI, a future server UI, a server runtime) they are all "the run is stopped until someone with the right role makes a decision." Today there is no first-class object representing that common concept; surfaces must reconstruct it by joining records and ledger rounds. Issue [#166](https://github.com/skr19930617/specflow/issues/166) asks us to fix this by defining **Gate** as the shared workflow object across all three.

The specs produced by this change introduce a `workflow-gate-semantics` capability, rewrite `approval-clarify-persistence` around a unified `GateRecord`, and extend `review-orchestration` to emit one `review_decision` gate per review round. This document describes HOW to implement those specs without breaking existing run data.

**Constraints**

- `.specflow/runs/<run_id>/records/*.json` files produced by the current `ApprovalRecord` / `ClarifyRecord` code path must continue to be migratable; raw legacy reads are NOT supported post-migration (per spec).
- The review ledger JSON (`review-ledger-design.json`, `review-ledger.json`, etc.) continues to be the source of truth for findings; only the round-level outcome is newly gate-persisted.
- `actor-surface-model` already defines role identifiers (`human-author`, `ai-agent`, `reviewer`, `automation`); `workflow-gate-semantics` must consume those roles, not invent new ones.
- `surface-event-contract` presently references `ApprovalRecord` / `ClarifyRecord` / `record_id`; it is explicitly **out of scope** for this change and must remain compilable against the new schema via a ripple-compatible alias layer until a follow-up change updates it.

**Stakeholders**

- Core runtime owners: consume new `GateRecord` + concurrency/supersede rules
- Review CLI owners (`specflow-challenge-proposal`, `specflow-review-design`, `specflow-review-apply`): emit `review_decision` gates
- Future surface authors (UI / server): read `GateRecord` as the single source of truth for "what is pending?"

## Goals / Non-Goals

**Goals:**

- Introduce `GateRecord` as the canonical persistence shape for approval / clarify / review_decision gates.
- Replace `InteractionRecordStore` + `LocalFsInteractionRecordStore` with `GateRecordStore` + `LocalFsGateRecordStore` and remove the individual-record `delete` operation.
- Add runtime enforcement of the concurrency rules defined by `workflow-gate-semantics` (clarify concurrent OK, approval/review at most one pending per phase; second issuance supersedes the first).
- Add `superseded` as a terminal state alongside `resolved`, and implement the same-`gate_kind`+`originating_phase` supersede rule as an atomically-recoverable paired write via write-ahead intent journal.
- Emit exactly one `review_decision` gate per completed review round in `specflow-challenge-proposal`, `specflow-review-design`, and `specflow-review-apply`, carrying the round's findings in `payload.findings` and referencing the ledger round id via `payload.review_round_id`.
- Provide a one-shot migration from legacy `ApprovalRecord` / `ClarifyRecord` files to `GateRecord` JSON on the same on-disk path, idempotently.
- Keep `surface-event-contract` compilable via a temporary alias (`record_id` → `gate_id`) while scheduling a follow-up change for that capability.

**Non-Goals:**

- UI button design, Web API shape, transport wire format. Gates are persistence-layer objects; surfaces remain free to render them any way they like.
- Any new delegated-approval policy beyond what `review-orchestration` already defines (undelegated AI approval is advisory; delegated is binding).
- Rewriting the review ledger schema. Findings stay in the ledger; the gate payload references them by `review_round_id`.
- Updating `workflow-run-state` / `surface-event-contract` baseline specs in this change (they will need a follow-up delta once this one is archived).
- Renaming the on-disk directory `.specflow/runs/<run_id>/records/`; only the JSON shape changes.

## Decisions

### D1. Unified `GateRecord` instead of subtyped records

Chosen: a single `GateRecord` shape discriminated by `gate_kind`, with kind-specific context held in a `payload` object.

- **Alternative A** — Keep `ApprovalRecord` / `ClarifyRecord` and add a thin read-model view called `Gate`. Rejected: surfaces would still need join logic to enumerate "pending decisions," and persistence-level refactors (e.g., adding `superseded` status) would have to be duplicated across two schemas. The proposal-phase clarify Q1 explicitly chose the unified shape.
- **Alternative B** — One record type per kind, sharing a common base. Rejected: TypeScript can express this, but the filesystem layout would still be a single `records/*.json` directory, and the discriminator + optional payload model is simpler to evolve when new gate kinds appear.

Rationale: surfaces gain "list all pending gates" as a flat query; persistence gains atomic `superseded` writes; future gate kinds (say, `run_decision` or `policy_gate`) plug in as a new `gate_kind` value without a new schema.

### D2. Fixed `allowed_responses` per kind, invalid rejected at runtime

Chosen: the runtime owns the `{ approval: [accept, reject], clarify: [clarify_response], review_decision: [accept, reject, request_changes] }` table and refuses unknown response tokens with an error, leaving the gate `pending`.

- **Alternative** — Per-gate `allowed_responses` stored on the record. Rejected: the table is intentionally small, inspectable in one place, and surfaces benefit from the predictability.

Rationale: this matches proposal clarify Q3. It also makes the response→event mapping deterministic and auditable. Invalid responses are a programming error, not a business case; they must not advance or mutate the gate.

### D3. `superseded` is a terminal state (not a cancellation)

Chosen: a gate that gets replaced by a newer gate with the same `gate_kind` + `originating_phase` transitions `pending` → `superseded`. `decision_actor` stays null. `resolved_at` is populated to anchor the timeline. Queries that ask "is there a pending decision?" exclude superseded rows; audit queries include them.

- **Alternative** — Delete the old record. Rejected: it breaks audit, and the no-`delete` API decision (proposal clarify Q7) already forbids individual deletion.
- **Alternative** — Reuse the same `gate_id` and move the old state into a `history` sub-object. Rejected: harder to query, harder to migrate.

Rationale: keeps history intact, matches proposal clarify Q2, and pairs cleanly with the atomicity rule below.

### D4. Concurrency check + supersede happen in one journaled write (approval and review_decision only)

Chosen: when the runtime issues a new gate of kind `K` for `originating_phase: P`, it applies concurrency rules that differ by kind:

- **`approval` / `review_decision`**: `issueGate` first `list`s the run's gates, finds any pending `K`+`P`, marks the old record `superseded` via `write`, and `write`s the new record. Both writes are part of the same transition; if either fails, the transition fails. At most one pending gate of these kinds exists per phase.
- **`clarify`**: `issueGate` does **not** supersede prior pending clarify gates in the same phase. Multiple pending `clarify` gates may coexist, each independently resolvable. A new clarify gate is simply appended.

`LocalFsGateRecordStore.write` is already atomic per-record (write-to-temp + rename). For the two-record atomicity required by the supersede path, the implementation uses a **run-scoped lock + write-ahead intent journal**:

**Mutual exclusion**: Before entering the supersede sequence, `issueGate` acquires a run-scoped lock file at `.specflow/runs/<run_id>/records/.gate-lock` using atomic `O_CREAT | O_EXCL` semantics (Node.js `fs.open` with `wx` flag). This ensures that concurrent `issueGate` calls targeting the same run are serialized — a second caller that finds the lock file present must spin-wait with backoff and retry, or fail after a timeout. The lock file contains `{ pid, gate_kind, originating_phase, timestamp }` for diagnostics. The lock is released (file removed) after the intent journal is cleaned up (step 4 below), or on any error exit from the sequence. A stale lock (older than a configurable threshold, default 30 seconds) is broken by the next caller, which removes and re-acquires it, since a lock that old indicates a crashed process.

**Intent journal** (executes while holding the run-scoped lock):

1. **Write intent**: Before either record write, `issueGate` writes a `.supersede-intent.json` file to the run's `records/` directory. The intent file records `{ old_gate_id, old_gate_snapshot, new_gate_id, new_gate_record, timestamp }` — enough data to complete or roll back either write.
2. **Execute writes**: Write the superseded old record, then write the new pending record. Each individual write is atomic (write-to-temp + rename).
3. **Remove intent**: After both writes succeed, remove the `.supersede-intent.json` file.
4. **Release lock**: Remove the `.gate-lock` file.
5. **Recovery on read**: `GateRecordStore.list` and `GateRecordStore.read` check for a leftover `.supersede-intent.json` before returning results. If one exists (indicating a crash after lock acquisition but before cleanup), the recovery routine acquires the lock, inspects on-disk state to determine which writes completed and either completes the remaining write or rolls back the partial write using the snapshot, removes the intent file, then releases the lock. This ensures that no `list` or `read` call can observe a torn state — recovery runs to completion before results are returned.

This guarantees both serialization of concurrent gate issuers and the all-or-nothing contract required by the spec: after recovery, either both the supersede and the new gate are on disk, or neither is. No startup routine is needed — recovery is triggered lazily on first access to the run's records.

- **Alternative A** — In-process lock with best-effort rollback and startup self-healing. Rejected: leaves a window after crash where on-disk state is torn (two pending gates or missing replacement gate) until the next startup. This violates the spec's requirement that "if either write fails, both SHALL be rolled back together" because the repair happens asynchronously, not atomically with the failed operation.
- **Alternative B** — Separate "cancel old" and "create new" events. Rejected: leaves a window where zero pending gates exist for a phase that demands one, which surfaces would race against.
- **Alternative C** — Apply supersede uniformly to all gate kinds. Rejected: the spec's concurrency rule explicitly allows multiple pending `clarify` gates in the same phase; superseding would incorrectly retire the first clarify when a second is issued.

Rationale: the run-scoped lock serializes concurrent `issueGate` callers so that two processes cannot simultaneously read the same pending gate set and each commit a different supersede, which would violate the one-pending-per-phase invariant. The intent journal provides true atomic recovery for the paired write without requiring a database or WAL framework. The journal file is small (two gate snapshots), recovery is lazy (triggered on first read, not requiring a startup routine), and the lock ensures that only one writer is active per run at a time. Surfaces can assume "for a given (run, phase, approval|review_decision) there is at most one pending row" and never see a torn state, while clarify gates remain independently addressable.

### D5. Explicit `eligible_responder_roles` per gate kind

Chosen: the runtime owns a per-kind role policy that determines the `eligible_responder_roles` stamped onto every newly issued gate:

| gate_kind | eligible_responder_roles | rationale |
|-----------|--------------------------|-----------|
| approval | `["human-author"]` | The author is the person who decides whether to advance past a phase. Matches the existing approval UX where only the run's human author may accept or reject. |
| clarify | `["human-author"]` | Clarify questions are directed at the run's human author for answers; AI agents may draft responses but the gate resolution is the author's responsibility. |
| review_decision | `["human-author"]` | The human author makes the go/no-go call on review round outcomes, including delegated-AI rounds where the AI outcome is binding metadata but does not auto-resolve the gate. |

All three kinds use `["human-author"]` in this change. The policy is centralized in the runtime alongside the `allowed_responses` table (Decision D2) so that future gate kinds or delegated-approval extensions can add new role sets in one place.

- **Alternative** — Delegated AI rounds auto-resolve review gates. Rejected: it collapses "review outcome" and "human decision to accept that outcome" into a single event, which loses the audit trail of "who actually made the go/no-go call."
- **Alternative** — Store `eligible_responder_roles` dynamically per gate instance. Rejected for the same reasons as per-gate `allowed_responses` (Decision D2): the set is small, predictable, and surfaces benefit from a single lookup table.

Rationale: matches proposal clarify Q4. Keeps `workflow-gate-semantics` simple — no per-gate dynamic eligibility computation. Having an explicit per-kind policy means `issueGate` can populate the required field without caller guesswork, and `resolveGate` authorization tests can assert against the documented table.

### D6. One-shot migration, fail-fast on legacy shape

Chosen: ship a `specflow-migrate-records` helper that reads every `.specflow/runs/<run_id>/records/*.json`, detects legacy `record_kind`, rewrites to the `GateRecord` shape in place, and writes a `.migrated` sentinel per run. Both `GateRecordStore.read` and `GateRecordStore.list` detect unmigrated shape (presence of `record_kind` + absence of `gate_kind`) and return an `UnmigratedRecordError` instead of coercing. This is necessary because `list(runId)` is used by concurrency checks, pending-gate queries, and the supersede path — silently returning legacy-shaped records from `list` would cause incorrect runtime behavior or opaque failures downstream.

- **Alternative** — Keep a legacy reader for back-compat. Rejected by proposal clarify Q5.
- **Alternative** — Only check in `read()`. Rejected: `list()` is the primary entry point for concurrency and pending-gate queries; an unmigrated run consumed through `list()` would bypass the fail-fast guarantee.

Rationale: a single explicit migration avoids the forever-legacy-reader trap and gives us a clear point at which the old code path can be deleted. Checking both `read` and `list` ensures no code path can silently consume legacy data.

### D7. Keep `records/` directory path, change only JSON shape

Chosen: legacy files at `.specflow/runs/<run_id>/records/<record_id>.json` are migrated into `.specflow/runs/<run_id>/records/<gate_id>.json` where `gate_id` equals the old `record_id` byte-for-byte. This avoids moving files during migration and keeps the cascade-delete guarantee trivial.

- **Alternative** — Move to `.specflow/runs/<run_id>/gates/`. Rejected: more migration surface, more coordination with `RunArtifactStore`, and no user-visible win.

### D8. Alias layer for `record_id` in `surface-event-contract` consumers

Chosen: introduce a temporary `recordIdForGate(gate: GateRecord): string` helper that returns `gate.gate_id`. Event-emitting code paths continue to set `payload.record_id` from this helper until the follow-up change formally renames it to `payload.gate_id`.

- **Alternative** — Update `surface-event-contract` in this change. Rejected: expands scope. The proposal explicitly listed only two Modified Capabilities.

Rationale: keeps this change self-contained while not breaking downstream consumers.

### D9. `review_round_id` is the ledger round identifier verbatim

Chosen: the gate's `payload.review_round_id` stores the existing ledger round's `round_id` (or the equivalent field present in today's ledgers). The ledger's round summary gains a `gate_id` back-reference.

Rationale: no new id space, traversal works in both directions, tests can assert equality.

### D10. Transactional review-round-to-gate linkage via correlation-and-repair protocol

Chosen: the review CLI writes the ledger round, issues the `review_decision` gate, and patches the ledger round with the `gate_id` back-reference as a three-step sequence using `review_round_id` as a correlation key. The protocol is designed so that any subset of the three writes can be recovered to a consistent state:

1. **Write ledger round** — append the round summary to the ledger file. The round summary includes `review_round_id` but no `gate_id` yet (set to `null`).
2. **Issue gate** — call `issueGate` with `payload.review_round_id` set to the same `review_round_id`. On success, a `GateRecord` with `gate_id` is persisted.
3. **Patch ledger back-reference** — update the ledger round summary's `gate_id` field to the newly created `gate_id`.

**Recovery**: If the process crashes between any of these steps, the state is recoverable:
- **Crash after step 1 only** (ledger round exists, no gate): The next review CLI invocation for this run detects an incomplete round (round with `gate_id: null` and no matching gate on disk) and retries from step 2. `issueGate`'s supersede logic handles any duplicate attempt safely.
- **Crash after step 2** (ledger round exists, gate exists, but `gate_id` not patched into ledger): The review CLI's startup or the `list` recovery path detects a gate whose `payload.review_round_id` matches a ledger round that has `gate_id: null`. It patches the ledger `gate_id` field to complete the linkage.
- **All three succeed**: Consistent state. No recovery needed.

The recovery check runs at the start of each review CLI command before issuing new gates: scan the run's ledger for rounds with `gate_id: null`, cross-reference against `GateRecordStore.list` for gates with matching `review_round_id`, and repair any incomplete linkage. This is idempotent and cheap (bounded by the number of rounds in the ledger).

- **Alternative A** — Write gate first, then ledger. Rejected: a gate without its corresponding ledger round is harder to diagnose than a ledger round without its gate, and the review CLI's primary output is the ledger.
- **Alternative B** — Use a single intent journal encompassing all three writes. Rejected: the ledger file format is owned by review-orchestration and may not support the same atomic-rename pattern used by gate records. The correlation-key approach is simpler and does not require changes to ledger persistence mechanics.
- **Alternative C** — Accept eventual consistency and let the `gate_id` back-reference be optional. Rejected: the spec requires "exactly one gate per completed round" with bidirectional traversal; leaving the back-reference as permanently optional would make the round→gate direction unreliable.

Rationale: by using `review_round_id` as a deterministic correlation key across ledger and gate store, any partial failure is detectable and repairable without a coordinated transaction or new journaling infrastructure. The recovery logic is confined to the review CLI startup path and is idempotent.

## Persistence / Ownership

- **`GateRecord` files** — owned by `GateRecordStore`. On-disk path `.specflow/runs/<run_id>/records/<gate_id>.json`. Atomic writes via write-to-temp + rename. No individual delete API; only cascade removal when the run directory is removed.
- **Review ledger files** (`review-ledger.json`, `review-ledger-design.json`) — owned by the existing `review-orchestration` runtime. Gain one new field per round summary (`gate_id`). Legacy rounds without this field remain readable; reporting paths treat the missing value as "gate not tracked."
- **Legacy records** — owned by the migration helper. After `.migrated` sentinel is written, the runtime refuses to read or list any file missing `gate_kind`.
- **Concurrency state** — not separately persisted; derived from `GateRecordStore.list(runId)` filtered by `(gate_kind, originating_phase, status='pending')`. The supersede decision is made in memory inside the transition.

## State / Lifecycle

Gate is a state machine with three states:

```
        +------------+
        |  pending   |
        +------------+
           |       |
   resolve |       | new-same-kind-phase issued
           v       v
      +---------+ +------------+
      |resolved | | superseded |
      +---------+ +------------+
```

- `pending → resolved`: triggered by a valid response in `allowed_responses`; writes `resolved_at`, `decision_actor`, appends response event id.
- `pending → superseded`: triggered during same-kind+phase re-issuance; writes `resolved_at`, keeps `decision_actor` null, appends the superseding event id.
- Terminal states are immutable. Any subsequent response attempt to a non-pending gate returns an error and changes nothing.

Derived state (not stored on the record):

- `pendingGatesForRun(runId)`: filter `list(runId)` on `status === 'pending'`. Used by surfaces.
- `canAdvancePhase(runId, phase)`: true iff no pending `approval` or `review_decision` gate exists for `phase`. Clarify gates do NOT block advancement by themselves; a phase's acceptance criteria may still require their resolution, but that is an orthogonal workflow rule.

Lifecycle boundaries:

- Run deletion → cascade deletes all `GateRecord` files under `records/`.
- Migration sentinel (`records/.migrated`) → one-shot; idempotent if already present.
- Gate creation must happen before the transition that caused it returns, so readers after the transition always see the pending gate.

## Contracts / Interfaces

### Core runtime ↔ `GateRecordStore`

```ts
type GateKind = "approval" | "clarify" | "review_decision";
type GateStatus = "pending" | "resolved" | "superseded";

interface GateRecord {
  gate_id: string;
  gate_kind: GateKind;
  run_id: string;
  originating_phase: string;
  status: GateStatus;
  reason: string;
  payload: GatePayload; // kind-specific; see below
  eligible_responder_roles: string[]; // non-empty
  allowed_responses: string[]; // fixed per kind
  created_at: string; // ISO 8601
  resolved_at: string | null; // ISO 8601; set once non-pending
  decision_actor: ActorIdentity | null; // set only for resolved
  event_ids: string[];
}

type GatePayload =
  | { kind: "approval"; phase_from: string; phase_to: string }
  | { kind: "clarify"; question: string; question_context?: string; answer?: string }
  | { kind: "review_decision"; review_round_id: string; findings: Finding[]; reviewer_actor: string; reviewer_actor_id: string; approval_binding: boolean };

interface GateRecordStore {
  read(runId: string, gateId: string): Promise<GateRecord | null>;
  write(runId: string, record: GateRecord): Promise<void>;
  list(runId: string): Promise<GateRecord[]>;
  // no delete
}
```

### Runtime gate helpers (new)

```ts
issueGate(tx: TransitionContext, input: IssueGateInput): Promise<GateRecord>
//   - populates eligible_responder_roles from the per-kind role policy (Decision D5)
//     unless the caller explicitly provides an override (currently no override path exists)
//   - for approval/review_decision: enforces at-most-one-pending-per-phase, supersedes prior pending
//   - for clarify: allows concurrent pending gates in the same phase (no supersede)
//   - writes both old (if any) and new records via write-ahead intent journal (supersede path only)
//   - appends creation event id to the new record's event_ids

resolveGate(tx: TransitionContext, gateId: string, response: string, actor: ActorIdentity): Promise<GateRecord>
//   - validates response against gate.allowed_responses
//   - validates actor.role ∈ gate.eligible_responder_roles
//   - writes resolved record with resolved_at and decision_actor
//   - returns updated record; throws on invalid response or role mismatch
```

### Review CLI ↔ runtime

Each of `specflow-challenge-proposal`, `specflow-review-design`, `specflow-review-apply` gains a terminal call after the ledger round is written:

```ts
await issueGate(tx, {
  gate_kind: "review_decision",
  run_id,
  originating_phase, // "proposal_challenge" | "design_review" | "apply_review"
  reason, // short human-readable
  payload: {
    kind: "review_decision",
    review_round_id,
    findings,
    reviewer_actor,       // e.g. "ai-agent" or "human-reviewer"
    reviewer_actor_id,    // identity of the reviewer who produced the round
    approval_binding,     // true if the review outcome is binding (delegated), false if advisory
  },
  eligible_responder_roles: ["human-author"],
});
```

### Response → handoff signal mapping table (runtime-owned)

Every gate response must synchronously produce a **handoff signal** that the runtime's existing transition handlers consume to drive the next step. The table below is exhaustive for all `(gate_kind, originating_phase, response)` combinations.

**Scope boundary and signal provenance**: The handoff signals listed here are the contract between gate resolution and the existing transition handler layer. Every signal in this table is drawn from an already-defined contract — no new workflow-run-state transitions or handoff outcome names are introduced by this change.

- **Approval gate signals** (`accept_spec`, `accept_design`, `accept_apply`, `reject`) are **existing transition handler entry points** already implemented in the runtime's transition handler layer. Their semantics are defined by the current `workflow-run-state` spec and transition handler implementations.
- **Review-decision gate signals** (`review_approved`, `review_rejected`, `request_changes`) are **existing review-orchestration handoff outcome names** as defined in the `review-orchestration` spec's handoff outcome contract. They are review-phase decisions, not workflow-run-state transitions, consistent with review-orchestration's requirement that "review outcomes SHALL remain review-phase decisions that are distinct from workflow approve and reject operations." The `request_changes` handoff additionally specifies the phase-appropriate revise transition (`revise_proposal` / `revise_design` / `revise_apply`) — these are existing transition handler names already supported by the runtime.

**Verification requirement**: Before wiring the mapping table in implementation, task 6.0 (below) must verify that every handoff signal name in this table exists as a defined entry point in either the transition handler layer (for approval signals) or the review-orchestration handoff outcome contract (for review_decision signals). If any signal name is missing from the authoritative source, the implementation must not proceed until the discrepancy is resolved — either by correcting the table to match the existing names or by bringing the required spec change into scope.

The actual `workflow-run-state` spec is explicitly out of scope for this change (see Non-Goals); a follow-up change will formalize any additional workflow-run-state transitions if the existing transition handlers do not already cover all approval gate signals.

| gate_kind | originating_phase | response | handoff signal | semantics |
|-----------|-------------------|----------|----------------|-----------|
| approval | spec_ready | accept | `accept_spec` | Existing transition handler: advances past spec_ready |
| approval | spec_ready | reject | `reject` | Existing transition handler: terminates the run |
| approval | design_ready | accept | `accept_design` | Existing transition handler: advances past design_ready |
| approval | design_ready | reject | `reject` | Existing transition handler: terminates the run |
| approval | apply_ready | accept | `accept_apply` | Existing transition handler: advances past apply_ready |
| approval | apply_ready | reject | `reject` | Existing transition handler: terminates the run |
| clarify | _(any)_ | clarify_response | `clarify_response` | Phase unchanged; answer is persisted on the gate payload |
| review_decision | proposal_challenge | accept | `handoff.state = review_approved` | Review-orchestration handoff outcome: review round closes; the run proceeds to the downstream approval gate for the current phase. Does not itself advance the phase. |
| review_decision | proposal_challenge | reject | `handoff.state = review_rejected` | Review-orchestration handoff outcome: review round closes with rejection; the run does not proceed to the approval gate. The downstream approval flow is not reached. |
| review_decision | proposal_challenge | request_changes | `handoff.state = request_changes` → `revise_proposal` | Review-orchestration handoff outcome: maps to the phase-appropriate revise transition. Returns the run to pre-challenge state for author revision. |
| review_decision | design_review | accept | `handoff.state = review_approved` | Review-orchestration handoff outcome: review round closes; the run proceeds to the downstream approval gate for design_ready |
| review_decision | design_review | reject | `handoff.state = review_rejected` | Review-orchestration handoff outcome: review round closes with rejection |
| review_decision | design_review | request_changes | `handoff.state = request_changes` → `revise_design` | Review-orchestration handoff outcome: maps to the existing `revise_design` transition |
| review_decision | apply_review | accept | `handoff.state = review_approved` | Review-orchestration handoff outcome: review round closes; the run proceeds to the downstream approval gate for apply_ready |
| review_decision | apply_review | reject | `handoff.state = review_rejected` | Review-orchestration handoff outcome: review round closes with rejection |
| review_decision | apply_review | request_changes | `handoff.state = request_changes` → `revise_apply` | Review-orchestration handoff outcome: maps to the existing `revise_apply` transition |

**Key distinctions**:
- `approval` gate signals are **existing transition handler names** already implemented in the runtime. No new workflow-run-state definitions are introduced.
- `review_decision` gate signals are **review-orchestration handoff outcomes** (`handoff.state` values) as defined by the review-orchestration spec. The `request_changes` handoff additionally specifies the phase-appropriate revise transition (`revise_proposal` / `revise_design` / `revise_apply`) that the existing transition handler layer already supports.
- `review_decision.reject` produces a review-level `review_rejected` handoff, which is distinct from the approval-level `reject` transition. This preserves the separation between review-phase decisions and workflow approve/reject operations required by review-orchestration.

## Integration Points

- **`actor-surface-model`** — source of role identifiers used in `eligible_responder_roles`. No new roles are introduced.
- **`surface-event-contract`** — consumers continue to emit `record_id` via the `recordIdForGate` alias. A follow-up change must rename the event payload field to `gate_id` and remove the alias.
- **`workflow-run-state`** — history entries that currently say "`record_ref` matches `ApprovalRecord.record_id` or `ClarifyRecord.record_id`" continue to work because `gate_id` reuses the former `record_id` value. A follow-up change should update the spec wording.
- **`run-artifact-store-conformance` / `workspace-context`** — existing cascade deletion covers the new records directory layout unchanged.
- **Migration helper (`specflow-migrate-records`)** — new CLI entry. Idempotent. Must be run before any code path that expects `GateRecord`.
- **Review ledger consumers** — the new `gate_id` field in round summaries is additive; pre-migration ledgers remain readable.

Retry / restore boundaries:

- A failed `issueGate` during transition is recovered via the write-ahead intent journal (Decision D4): the next `read` or `list` call detects the leftover journal, acquires the run-scoped lock, completes or rolls back the partial write, and removes the journal. There is no observable partial supersede.
- A failed `resolveGate` does not mutate the record; the gate stays pending and the response is returned as a runtime error.
- A failed review-round-to-gate linkage (crash between ledger write, gate issuance, or back-reference patch) is recovered via the correlation-and-repair protocol (Decision D10): the next review CLI invocation detects rounds with `gate_id: null`, cross-references against existing gates by `review_round_id`, and completes or retries the missing steps.
- Migration is idempotent: re-running on an already-migrated directory detects `.migrated` and exits cleanly.

## Ordering / Dependency Notes

Implementation order (each layer depends on the prior):

1. **Data layer** — define `GateRecord` + `GateRecordStore` interface in TypeScript; implement `LocalFsGateRecordStore`. Write unit tests against an in-memory `FakeGateRecordStore`.
2. **Migration helper** — `specflow-migrate-records` CLI. Tests: legacy fixtures → expected GateRecord JSON; idempotency; error for partially-corrupted records.
3. **Runtime helpers** — `issueGate` and `resolveGate`. Tests: concurrency supersede (approval/review_decision only), clarify concurrent coexistence, invalid response rejection, role mismatch rejection, intent journal write-then-crash recovery, journal cleanup on success.
4. **Transition integration** — replace today's `InteractionRecordStore.write(ApprovalRecord|ClarifyRecord)` call sites with `issueGate`. Tests: transitions that used to create ApprovalRecord now create GateRecord with correct `gate_kind`.
5. **Review CLI integration** — each review entry point issues a `review_decision` gate at round end. Tests: gate payload carries `review_round_id`, `findings`, `reviewer_actor`, `reviewer_actor_id`, and `approval_binding`; ledger round summary carries `gate_id`.
6. **Gate response integration** — wire `resolveGate` into the CLI commands and transition handlers that accept/reject approvals, respond to clarify gates, and accept/reject/request_changes review decisions. Tests: each response type drives the correct handoff signal (existing transition handler names for approval, review-orchestration handoff outcomes for review_decision), updates `event_ids`, and rejects non-pending or ineligible responses.
7. **Alias layer** — introduce `recordIdForGate` and route event payload construction through it. Tests: event payloads still include `record_id` equal to `gate_id` during the alias period.
8. **CLI injection** — switch CLI entry points from `LocalFsInteractionRecordStore` to `LocalFsGateRecordStore`.

Parallelizable once layer 1 lands: layers 2 (migration) and 3 (runtime helpers) can proceed in parallel with independent test fixtures.

Steps 4 and 5 depend on step 3 landing.

## Completion Conditions

- `GateRecord` + `GateRecordStore` interface and `LocalFsGateRecordStore` implementation exist, with >80% unit-test coverage and atomic-write semantics proven in tests.
- `specflow-migrate-records` converts legacy fixtures to `GateRecord` JSON idempotently; `.migrated` sentinel honored; unmigrated-shape reads via `read()` and `list()` both return `UnmigratedRecordError`.
- `issueGate` and `resolveGate` enforce concurrency, supersede (approval/review_decision only; clarify exempt), fixed `allowed_responses`, role-based eligibility; the run-scoped `.gate-lock` serializes concurrent `issueGate` calls; unit tests cover the success and failure cases enumerated in the specs, including multiple concurrent clarify gates and concurrent issueGate serialization.
- Existing transitions that produced `ApprovalRecord` / `ClarifyRecord` now produce the equivalent `GateRecord` with no change in on-disk path or semantic behavior beyond the schema rename.
- `specflow-challenge-proposal`, `specflow-review-design`, `specflow-review-apply` each emit exactly one `review_decision` gate per completed round, with `eligible_responder_roles = ["human-author"]`, findings in `payload.findings`, and round provenance fields (`reviewer_actor`, `reviewer_actor_id`, `approval_binding`) in the payload. The review-round-to-gate linkage uses the correlation-and-repair protocol (Decision D10); recovery at CLI startup repairs any incomplete `gate_id` back-references.
- Gate response handlers (`resolveGate`) are integrated into CLI commands and transition handlers that consume approval accept/reject, clarify responses, and review accept/reject/request_changes, driving the corresponding handoff signal (existing transition handler names for approval gates, review-orchestration handoff outcomes for review_decision gates) and `event_ids` updates.
- `surface-event-contract` consumers continue to emit `record_id` via `recordIdForGate` and pass existing tests unchanged.
- Change archiving reruns `openspec validate` and `specflow-spec-verify` successfully.

Each bundle is independently reviewable:

- Bundle A — data layer + migration (D1, D6, D7) — reviewable without runtime.
- Bundle B — runtime helpers + transitions (D2, D3, D4) — reviewable against Bundle A.
- Bundle C — review CLI integration (D5, D9) — reviewable against Bundles A+B.
- Bundle D — alias layer (D8) — trivial, reviewable standalone.

## Concerns

- **C1 — Gate as a first-class object**: surfaces need a single object to enumerate pending decisions; today they reconstruct it. Resolved by introducing `GateRecord` + `GateRecordStore` (Decisions D1, D7).
- **C2 — Deterministic response contract**: surfaces must know, without reading runtime code, what responses a gate accepts. Resolved by Decisions D2 and the response→handoff signal table.
- **C3 — No stale gates after rework**: if a phase is re-entered, pending approval/review_decision gates from the prior pass must not linger as "pending." Resolved by Decision D3 (`superseded`) + D4 (journaled atomic supersede, scoped to approval/review_decision only; clarify gates coexist independently).
- **C4 — Review outcome vs. human decision**: AI-generated review findings must not bypass the human decision point. Resolved by Decision D5 (`eligible_responder_roles = ["human-author"]` on all review gates).
- **C5 — Legacy data coexistence**: existing local runs must keep working. Resolved by Decision D6 (one-shot migration) + D7 (same on-disk path).
- **C6 — Cross-spec ripple**: `surface-event-contract` and `workflow-run-state` reference old names. Resolved by Decision D8 (temporary alias) + explicit follow-up change scoping.
- **C7 — Delegated AI approval binding vs. gate resolution**: must keep the existing binding-delegation contract without surfacing AI identity as the gate resolver. Resolved by Decision D5: binding/advisory stays in ledger metadata; gate resolution remains human-only.

## Risks / Trade-offs

- [Risk] Two-record atomic write (`superseded` old + new pending) can fail halfway on crash, leaving a `.supersede-intent.json` on disk → Mitigation: `GateRecordStore.list` and `GateRecordStore.read` check for and recover from leftover intent journals before returning results (Decision D4). Recovery either completes the remaining write or rolls back the partial write using the snapshot in the intent file, then removes the journal. No startup routine is needed; recovery is lazy and atomic with the first read access.
- [Risk] Concurrent `issueGate` calls targeting the same run can race past the pending-gate check and each commit a different supersede, violating the one-pending-per-phase invariant → Mitigation: run-scoped `.gate-lock` file with `O_CREAT | O_EXCL` semantics serializes concurrent writers; stale locks (>30s) are broken automatically (Decision D4).
- [Risk] Review round persistence (ledger write → gate issue → gate_id back-reference) can be torn by a crash between steps, leaving a completed round without its mandatory gate or a gate without the ledger back-reference → Mitigation: correlation-and-repair protocol keyed by `review_round_id` (Decision D10). Recovery runs at review CLI startup, is idempotent, and repairs any incomplete linkage.
- [Risk] Migration helper encounters unknown `record_kind` value → Mitigation: fail fast with a clear error message listing the offending file; do not best-effort coerce. The only two legitimate legacy values are `"approval"` and `"clarify"`.
- [Risk] Alias layer (`recordIdForGate`) becomes permanent if the follow-up change is forgotten → Mitigation: file a tracking issue immediately upon archiving this change; add a TODO comment pointing to that issue in the alias helper.
- [Trade-off] Choosing one gate per review round instead of per finding means accept/reject is coarse-grained. A reviewer who wants to accept 9 findings and request changes on 1 must pick `request_changes` for the round. Rationale: aligns with how Codex review already operates (round-level decision), avoids combinatorial gate explosion, and matches proposal clarify Q2.
- [Trade-off] `delete` API removal makes individual-gate cleanup impossible at runtime. In practice runs are the unit of cleanup already, so this is acceptable. Gate correction (e.g., wrong `reason`) is done by superseding with a new gate instead of editing.
- [Trade-off] `superseded` is a terminal state, not a cancellation. UIs must label superseded gates clearly so reviewers do not wonder why their pending item disappeared. Not a correctness risk, but a UX note for future surfaces.

## Migration Plan

1. **Pre-flight** — ship `specflow-migrate-records` CLI with tests against fixtures containing both kinds of legacy records and a mixed directory.
2. **Roll the runtime** — the new `GateRecordStore` code path is dormant as long as it only reads migrated shape; the old `InteractionRecordStore` code path is deleted only after migration completes.
3. **Migration order for users** —
   - Run `specflow-migrate-records --all` once; it rewrites every run under `.specflow/runs/*/records/`.
   - On success each run gets `.specflow/runs/<run_id>/records/.migrated`.
   - Re-running is idempotent.
4. **Post-migration** — the runtime's `GateRecordStore.read` and `GateRecordStore.list` paths both check for legacy shape; encountering a legacy-shaped file returns `UnmigratedRecordError` with a human-readable message pointing at the migration command.
5. **Rollback strategy** — `specflow-migrate-records --undo` restores original files from a `.specflow/runs/<run_id>/records/.backup/` snapshot the forward migration writes. Undo removes the `.migrated` sentinel. Only usable before any new `GateRecord` is written by the runtime post-migration.

## Open Questions

- Does `eligible_responder_roles` need to support an "any of" operator beyond the intersect semantics used here? Proposal clarify Q3 chose role-set intersect; that is sufficient for the three known kinds but may need revisiting for delegated `review_decision` variants.
- Should `superseded` gates be surfaced by default in `pendingGatesForRun` when called with an audit flag, or should that be a separate `historyGatesForRun`? Leaning toward the latter to keep the default lean, but deferred to the apply phase.
- The follow-up change for `surface-event-contract` and `workflow-run-state` spec updates — should that be filed as one combined change or two? Combined is cleaner since both rename the same concept; separate keeps review size small. Decide at archive time.
