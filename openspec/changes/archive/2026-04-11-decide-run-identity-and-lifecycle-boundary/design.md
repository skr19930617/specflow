## Context

The current specflow runtime assumes `run_id ≡ change_id`. Run state is stored
at `.specflow/runs/<run_id>/run.json` where the directory name serves as both
the workflow instance identifier and the change artifact locator. This coupling
prevents:

- Retrying a workflow for the same change (only one run per change_id)
- Suspending/resuming a workflow (no status concept beyond terminal states)
- Building a DB-backed runtime where identity must be storage-agnostic

The codebase uses xstate-derived state machine v4.0 with 19 states, 24 events,
and 36 transitions. RunState is defined in `src/types/contracts.ts` and
persisted via atomic writes in `src/bin/specflow-run.ts`.

## Goals / Non-Goals

**Goals:**

- Separate run_id from change_id so one change can have multiple runs
- Add suspend/resume as run-level state machine events
- Add retry as a change-level operation (not a state machine event)
- Enforce the "one non-terminal run per change" invariant
- Maintain backward compatibility for existing run.json files
- Define lifecycle semantics that are portable to a future DB-backed runtime

**Non-Goals:**

- Building the DB-backed runtime itself (separate repo)
- Defining an external runtime adapter interface
- Building an automatic migration tool for existing runs
- Changing the state machine's mainline workflow (proposal → approved)

## Decisions

### D1: Change-run `run_id` format is `<change_id>-<sequence>`

**Decision:** For `run_kind = "change"`, `run_id = <change_id>-<N>` where N is
a monotonically increasing integer starting at 1. For
`run_kind = "synthetic"`, the caller supplies the full `run_id` explicitly and
no `change_id`-derived run_id is generated.

**Alternatives considered:**
- UUID: maximally unique but loses human readability and makes debugging harder
- Timestamp-based: collision risk, hard to sort correctly across timezones
- Keep run_id = change_id: blocks retry semantics entirely

**Rationale:** The sequential format preserves the human-readable slug for
change runs, makes retry ordering obvious, and is trivially convertible to a DB
primary key. Synthetic runs already exist outside the change artifact
namespace, so preserving their caller-supplied IDs avoids inventing a fake
change_id.

### D2: Sequence number is derived by scanning existing runs

**Decision:** When creating a new change run, scan `.specflow/runs/` for
directories matching `<change_id>-*`, extract the highest sequence number, and
increment. Synthetic runs skip sequence scanning because
`specflow-run start <run_id> --run-kind synthetic` accepts the full run_id as
input.

**Alternatives considered:**
- Counter file per change_id: extra file to manage and coordinate
- Global counter: unnecessary complexity for local filesystem use

**Rationale:** Directory scanning is simple, atomic with the run creation, and
has no race condition in the single-agent local mode. A DB-backed runtime would
use `SELECT MAX(sequence)` instead. Restricting this logic to change runs keeps
the synthetic path aligned with the existing CLI contract.

### D2a: `start` keeps separate contracts for change and synthetic runs

**Decision:** `specflow-run start` has two distinct entry paths:

- **Change runs:** `specflow-run start <change_id> [--retry]`
  - Require `openspec/changes/<change_id>/proposal.md` to exist before
    creating the run, including `--retry` starts, because every change run
    references the shared change artifact
  - Persist `run_kind = "change"` and `change_name = <change_id>`
  - Auto-generate `run_id = <change_id>-<sequence>`
  - If no prior runs exist, plain `start` creates the first run at
    `proposal_draft` with `previous_run_id = null`
  - Reject plain `start` if an active run exists, if a suspended run exists,
    or if prior runs exist and all are terminal; once a change already has
    terminal history, callers must opt into a new lineage with `--retry` so
    `previous_run_id` is recorded only on explicit retry lineage
  - Allow `--retry` only when all existing runs are terminal and the latest run
    is not `rejected`

- **Synthetic runs:** `specflow-run start <run_id> --run-kind synthetic`
  - Accept the caller-supplied `run_id` verbatim
  - Require that the supplied `run_id` does not already exist
  - Bypass change-directory lookup, proposal lookup, and change-run sequence
    scanning entirely
  - Persist `run_kind = "synthetic"` and `change_name = null`
  - Initialize `previous_run_id = null`; synthetic runs never participate in
    change-level retry lineage
  - Reject `--retry` because retry lineage is defined only for change runs

The contract is intentionally asymmetric:

| Run kind | CLI input | `run_id` source | Artifact lookup | Persisted `change_name` | `--retry` |
|----------|-----------|-----------------|-----------------|-------------------------|-----------|
| `change` | `<change_id>` | Generated as `<change_id>-<sequence>` | Required: `openspec/changes/<change_id>/proposal.md` | `<change_id>` | Allowed only when all prior runs are terminal and the latest run is not `rejected` |
| `synthetic` | `<run_id> --run-kind synthetic` | Caller-supplied verbatim | Skipped | `null` | Rejected |

**Rationale:** Change runs own retry lineage and artifact references, while
synthetic runs are intentionally artifact-free capture flows. Keeping both
contracts explicit preserves existing synthetic behavior and prevents the
change-run proposal precondition from being dropped during the refactor.

### D3: suspend/resume are status-based lifecycle events, not phase states

**Decision:** `suspended` is a value of the `status` field in run.json, not a
new state in the workflow machine. `current_phase` is preserved during suspend,
but `suspend` and `resume` are still part of the shared run lifecycle contract.
`workflow-machine.ts` v5 keeps the phase graph unchanged while publishing the
combined event model used by local and external runtimes:

- `status = "active"`: `allowed_events = <phase events for current_phase> + ["suspend"]`
- `status = "suspended"`: `allowed_events = ["resume"]`
- `status = "terminal"`: `allowed_events = []`

`RunHistoryEntry.event` and serialized machine metadata use this combined event
set, so `suspend` / `resume` are first-class run-level events even though they
do not change `current_phase`.
The lifecycle overlay lives next to the phase machine as shared machine
metadata: `workflow-machine.ts` exports the lifecycle event descriptors,
status-transition rules, and status-gated allowed-event derivation consumed by
the CLI and any future external runtime rather than letting `suspend` /
`resume` exist only as CLI-local behavior. The serialized machine metadata
therefore needs to carry the lifecycle overlay together with the phase-machine
metadata so `allowed_events` and history typing are derived from one shared
contract.

**Alternatives considered:**
- Add `suspended` as a state machine state with transitions from every active
  state: combinatorial explosion (16+ states × suspend/resume = 32+ new
  transitions)
- Orthogonal state machine region: xstate supports this, but adds complexity
  and the current machine is flat

**Rationale:** Status-based suspend keeps the phase machine simple without
losing a shared lifecycle contract. The phase graph still models business
progression, while the lifecycle overlay models whether phase events are
currently usable. That keeps `allowed_events`, history, and serialized machine
metadata portable to a future DB-backed runtime.

### D4: retry is a change-level CLI operation, not a state machine event

**Decision:** `specflow-run start <change_id> --retry` creates a new run. The
old terminal run is not modified. retry does not send events to terminal runs.

**Alternatives considered:**
- Add retry as a state machine event from terminal states: contradicts the
  definition of terminal states as accepting no events
- Automatic retry on failure: too opinionated for a workflow tool

**Rationale:** Retry creates a logically new workflow instance. The previous run
is immutable history. This preserves the terminal state invariant and maps
cleanly to a DB INSERT rather than UPDATE.

### D5: `previous_run_id` tracks retry lineage

**Decision:** A new nullable `previous_run_id` field in run.json links a retry
run to its predecessor.

**Alternatives considered:**
- Array of all prior run_ids: over-engineering for a linear retry chain
- No tracking: loses the ability to inspect retry history

**Rationale:** A single pointer is sufficient — full history can be reconstructed
by following the chain. Simple to persist in both filesystem and DB.

### D6: Backward compatibility via read-time fallback

**Decision:** When reading a run.json that lacks `run_id`, derive it from the
directory name. Do not rewrite the file.

**Alternatives considered:**
- Migration script: extra tool to build and maintain
- Fail on missing field: breaks existing users

**Rationale:** Read-time fallback is zero-cost, non-destructive, and
requires no user action. New runs always write the full schema.

## Implementation Approach

### Phase 1: Type and Schema Changes

1. Update `RunState` in `src/types/contracts.ts`:
   - Add `previous_run_id: string | null`
   - Expand `status` type to `"active" | "suspended" | "terminal"`
   - Validate `change_name` as required for `run_kind = "change"` and `null`
     for `run_kind = "synthetic"`
   - Define a shared run-event type for phase events plus lifecycle events
     (`suspend`, `resume`) so `allowed_events` and history entries use one
     contract
   - Ensure `run_id` is always populated (not derived)

2. Update `src/lib/schemas.ts` if Zod schemas exist for RunState validation.

### Phase 2: State Machine Changes

1. Update `src/lib/workflow-machine.ts` (v4.0 → v5.0):
   - No new phase states added (suspend is status-based)
   - Keep the phase-transition graph unchanged
   - Export a shared lifecycle contract for `suspend` / `resume` that defines
     lifecycle event types, status-transition rules, and status-gated
     allowed-event rules used by all runtimes
   - Expose the lifecycle-overlay metadata and derivation helpers from the
     machine module so CLI commands do not hand-roll separate suspend/resume
     logic
   - Version bump to signal the identity/lifecycle contract change

2. Update the serialized state-machine metadata if it exists so it mirrors the
   new lifecycle event contract (`suspend`, `resume`, and status-based
   allowed-event gating).

### Phase 3: CLI Changes in `src/bin/specflow-run.ts`

1. **Split `start` by run kind before validation:**
   - Branch to change-run vs synthetic-run handling before any proposal lookup
     or sequence generation
   - Keep change-run-only invariants out of the synthetic path

2. **Change-run `start` path:**
   - Accept `change_id` as argument
   - Require `openspec/changes/<change_id>/proposal.md` for both first runs and
     retry runs
   - Auto-generate run_id as `<change_id>-<N>`
   - Scan `.specflow/runs/` for existing runs to determine N
   - Persist `change_name = change_id`
   - Set `previous_run_id = null` for the first run of a change
   - Enforce "one non-terminal run per change" invariant
   - Reject plain `start` when terminal history already exists and `--retry`
     was not supplied so a post-terminal lineage cannot be created implicitly
   - Add `--retry`: validate preconditions, copy/reset fields, set
     `previous_run_id`
   - Create directory at `.specflow/runs/<run_id>/`

3. **Synthetic-run `start` path:**
   - Preserve `specflow-run start <run_id> --run-kind synthetic`
   - Accept the provided synthetic run_id verbatim
   - Reject duplicate synthetic run_id values
   - Skip change-directory lookup, proposal lookup, and sequence generation
   - Persist `change_name = null` and `previous_run_id = null`
   - Reject `--retry`

4. **`advance` command changes:**
   - Derive `allowed_events` from the shared lifecycle contract
   - Check `status !== "suspended"` before applying phase events
   - On terminal transitions, set `status = "terminal"`

5. **New `suspend` subcommand:**
   - Validate run is active (not terminal, not already suspended)
   - Apply lifecycle event `suspend`
   - Set `status = "suspended"`, set `allowed_events = ["resume"]`
   - Append history entry

6. **New `resume` subcommand:**
   - Validate run is suspended
   - Apply lifecycle event `resume`
   - Set `status = "active"`, recompute `allowed_events` from `current_phase`
   - Append history entry

7. **`status` / `get-field` / `update-field` unchanged** (read run_id from
   run.json, fallback to directory name for legacy files)

### Phase 4: Integration with specflow-prepare-change

1. Update `src/bin/specflow-prepare-change.ts` to call `start` with change_id
   and receive the generated run_id.
2. Update any callers that assume `run_id === change_id`.

### Phase 5: Test Updates

1. Unit tests for change-run sequence number generation and plain-start
   rejection once terminal history exists without `--retry`
2. Unit tests for change-run proposal existence and `change_name = change_id`
   persistence
3. Unit tests for synthetic starts using explicit run_id, persisting
   `change_name = null`, bypassing proposal lookup, and rejecting duplicate
   run IDs
4. Unit tests for suspend/resume lifecycle-event gating, shared lifecycle
   metadata serialization, allowed-events derivation, and status transitions
5. Unit tests for retry precondition validation and field copy/reset logic
6. Integration tests for backward-compatible legacy run.json reading
7. Update existing tests that hardcode `run_id = change_id` assumptions

## Risks / Trade-offs

**[Risk] Existing specflow commands assume run_id = change_id** →
Mitigation: Audit all callers of `specflow-run` in `src/bin/`. The CLI argument
remains change_id for `start`; only internal resolution changes. Commands like
`advance`, `status`, `get-field` continue to accept run_id directly.

**[Risk] Sequence number collision in concurrent environments** →
Mitigation: Local mode is single-agent, so no race condition. Document that
DB-backed runtime must use atomic increment (e.g., `SELECT ... FOR UPDATE`).

**[Risk] Directory proliferation for retried changes** →
Mitigation: Acceptable trade-off. Each run is a lightweight JSON file. Future
cleanup tooling can archive old runs.

**[Risk] suspend/resume interaction with review ledgers** →
Mitigation: Review ledgers are change-level artifacts, not run-level. Suspend
does not affect ledger state. Resume picks up where the run left off.

**[Trade-off] Read-time fallback vs migration** →
We accept slightly inconsistent on-disk formats in exchange for zero-disruption
upgrades. The fallback is stateless and deterministic.
