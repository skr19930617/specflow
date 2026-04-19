## ADDED Requirements

### Requirement: Run-state transitions emit observation events

Every transition of the workflow run-state machine SHALL emit one or more observation events under the `workflow-observation-events` contract. The mapping SHALL be one run-state transition to one or more observation events (1:N); a single transition MAY emit several related events when it simultaneously opens a gate, blocks a phase, and suspends the run.

The following mapping SHALL hold at minimum:

- Creation of a new run SHALL emit `run_started`.
- Every successful event-driven phase transition SHALL emit `phase_entered` for the target phase and `phase_completed` for the source phase (unless the source is `start`).
- Transitions that suspend the run SHALL emit `run_suspended`; transitions that resume it SHALL emit `run_resumed`.
- Entering any terminal state (`approved`, `decomposed`, `rejected`) SHALL emit `run_terminal` whose `payload.status` reflects the terminal state.
- Transitions that open, resolve, or reject a gate SHALL emit the corresponding `gate_opened` / `gate_resolved` / `gate_rejected` event ahead of any `phase_blocked` / `phase_reopened` they cause.

`artifact_written`, `review_completed`, `bundle_started`, and `bundle_completed` are progress events that SHALL NOT require a matching run-state transition.

#### Scenario: Successful advance emits phase events

- **WHEN** the run advances from `proposal_clarify` to `proposal_challenge`
- **THEN** the core SHALL emit `phase_completed` for `proposal_clarify` followed by `phase_entered` for `proposal_challenge`
- **AND** both events SHALL share the same `run_id` with monotonically increasing `sequence`

#### Scenario: Terminal transition emits run_terminal

- **WHEN** the run enters `approved`
- **THEN** the core SHALL emit `run_terminal` with `payload.status = "approved"`
- **AND** the emitting order SHALL place `phase_completed` (or the equivalent preceding event) before `run_terminal`

#### Scenario: Progress events are not tied to run-state transitions

- **WHEN** an artifact is written without changing run-state
- **THEN** the core MAY emit `artifact_written` without emitting any lifecycle or phase event

### Requirement: Observation event stream is consistent with the run-state snapshot

The observation event stream emitted for a `run_id` SHALL remain consistent with the snapshot readable via the run-state CLI at every point in time. Specifically:

- After emitting `phase_entered` for `P`, the run-state snapshot SHALL report `current_phase = P` for any read that logically follows the event.
- After emitting `run_terminal`, the run-state snapshot SHALL report `status = <terminal>` and `current_phase = <terminal phase>`.
- The set of open gates reconstructed from `gate_opened` minus `gate_resolved`/`gate_rejected` SHALL match the gates reported by the run-state snapshot.
- The latest artifact pointers reconstructed from `artifact_written` events SHALL match the artifact pointers reported by the run-state snapshot.

Consumers SHALL be able to rely on this consistency to validate their locally reconstructed view against a fresh snapshot read.

#### Scenario: Snapshot agrees with replayed phase

- **WHEN** a consumer reconstructs `current_phase` by replaying events through the latest observed `sequence`
- **AND** a fresh run-state snapshot is read at or after that emission
- **THEN** the two values SHALL be equal

#### Scenario: Open-gate set matches snapshot

- **WHEN** the consumer reconstructs the open-gate set from the event stream
- **THEN** it SHALL match the set of open gates in the run-state snapshot observed at or after the latest gate event

### Requirement: Run-state CLI does not define the observation transport

The run-state CLI SHALL continue to expose snapshot semantics only. It SHALL NOT define, require, or depend on any specific transport (HTTP, WebSocket, SSE, polling, broker) for observation events; transport selection is explicitly the responsibility of a separate layer. Defining the event contract (via `workflow-observation-events`) SHALL NOT add a transport obligation to the run-state CLI.

#### Scenario: Run-state CLI remains snapshot-only

- **WHEN** the run-state CLI is inspected after this change
- **THEN** its commands SHALL continue to return snapshots, not streams
- **AND** it SHALL NOT require any transport-specific plumbing
