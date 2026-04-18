## Why

specflow has a workflow state machine with named phases and event transitions,
but the **meaning** of each phase currently lives inside slash command prose
and command-oriented guidance. Server-side runtimes and alternate UIs that
need to reason about `design_review`, `apply_review`, `proposal_clarify`,
etc. cannot answer basic questions — what this phase requires as input, what
it produces, when it is considered complete, what decides the next branch,
and which part is agent-delegated versus deterministic orchestration —
without reading the slash command bodies.

Source: [issue #165](https://github.com/skr19930617/specflow/issues/165).

The goal of this change is to make the meaning of each phase a
**contractual state meaning**, spec-level, independent of command prose. A
consumer holding only the phase-semantics specification SHALL be able to
describe, for every phase in the canonical workflow state machine, what that
phase is for — without consulting any `/specflow.*` command template.

## What Changes

### New capability: `phase-semantics`

- Introduce a new capability `phase-semantics` that enumerates, for every
  phase in the canonical workflow state machine, the **meaning of that
  phase** as a contractual state. Enumeration is **per-phase**: each concrete
  phase (non-terminal and terminal alike, e.g., `proposal_draft`,
  `proposal_scope`, `proposal_clarify`, `proposal_challenge`,
  `proposal_reclarify`, `spec_draft`, `spec_validate`, `spec_verify`,
  `spec_ready`, `design_draft`, `design_review`, `apply_ready`,
  `apply_review`, `archived`, `rejected`, `decomposed`, etc.) SHALL have its
  own per-phase semantic definition.

- Each per-phase definition SHALL carry all six mandatory roles with no
  role optional — including on terminal phases, for which the roles take
  well-defined terminal-specific values rather than being omitted:
  - **phase identity** — the stable phase name as it appears in the
    canonical workflow state machine.
  - **required inputs** — the artifacts and run-state the phase consumes
    before work begins. Terminal phases MAY have an empty set but SHALL
    still declare the role explicitly.
  - **expected outputs** — the artifacts and run-state the phase produces
    before it may complete. Terminal phases define the permanent artifacts
    that exist at archive/reject/decompose time (e.g., archived change
    artifacts, preserved branches).
  - **completion condition** — the observable condition that makes the
    phase considered done. For terminal phases, this is the condition
    under which the run reaches terminal status.
  - **branching / gate condition** — for every phase, the set of allowed
    next phases **and** allowed terminal reasons SHALL be enumerated in
    full. Non-gated phases SHALL list their single deterministic next
    phase. Gated phases SHALL list every possible outcome. Terminal phases
    SHALL use a defined terminal sentinel outcome (e.g., "no transition /
    terminal") as their branching value.
  - **delegation boundary** — a **phase-level** classification of the phase
    as `agent-delegated`, `deterministic`, or `mixed`. When `mixed`, the
    definition SHALL enumerate which outputs or decisions are
    agent-delegated. Note: within the local reference implementation, any
    CLI invocations declared as a phase's deterministic work (via
    `cliCommands`) are treated as a **normative encoding** of that phase's
    deterministic portion — consumers targeting semantic portability
    SHALL honor the same deterministic command semantics, not merely the
    label.

- The **source of truth for the phase set** is the "current phase" role in
  `canonical-workflow-state`. Every phase covered by that role SHALL have
  a per-phase semantic definition in `phase-semantics`; no phase outside
  that role SHALL appear in `phase-semantics`.

- **Vocabulary constraint**: Every artifact, run-state reference, event
  name, or completion condition cited inside a `phase-semantics` definition
  SHALL use the vocabulary of an existing specflow capability
  (`canonical-workflow-state`, `artifact-ownership-model`,
  `surface-event-contract`, `workflow-run-state`, etc.). `phase-semantics`
  SHALL NOT introduce new semantic labels of its own; when a needed label
  is missing, the owning capability SHALL be updated first (in a separate
  change) before `phase-semantics` references it.

- `phase-semantics` is the **meaning authority** for phases. It is
  runtime-agnostic: server-side runtimes, alternate UIs, and the local
  reference implementation SHALL all be able to read and reason about
  phase meaning through `phase-semantics` without reference to slash
  command prose.

- `phase-semantics` SHALL define the contract surface only; it SHALL NOT
  prescribe TypeScript interface shapes, Markdown rendering formats,
  storage schemas, or gate-evaluation logic. Those concerns remain owned
  by `phase-contract-types`, `phase-contract-structure`, and future
  runtime capabilities.

### Modified capability: `phase-contract-types`

- The existing `PhaseContract` interface SHALL be explicitly declared as a
  **conforming encoding** of `phase-semantics`: each `PhaseContract` field
  SHALL be identified with the `phase-semantics` role it represents.
- The `PhaseContract` encoding SHALL be **lossless** with respect to
  `phase-semantics` roles: for every phase, the contract value SHALL
  express all six roles without loss of information. No new interface
  fields are added in this change — losslessness is achieved by populating
  existing fields (e.g., `requiredInputs`, `producedOutputs`,
  `gated_event_kind`, `terminal_reason`, `agentTask`, `cliCommands`,
  `next_phase`) with concrete values that cover every role for every
  phase, including terminal phases.
- `cliCommands` SHALL be declared as part of the normative encoding of
  each phase's deterministic-side work (per C2), not as a local adapter
  detail.

### Modified capability: `phase-contract-structure`

- The `PhaseIODescriptor` input/output descriptors and the `GateCondition`
  kinds SHALL be explicitly framed as expressions of the `phase-semantics`
  roles "required inputs", "expected outputs", and "branching / gate
  condition".
- No new structural types are introduced by this change.

### Reconciliation of existing artifacts

- Existing slash command prose (`assets/commands/*.md.tmpl`) and the
  structured phase-contract data in `src/contracts/phase-contract.ts` that
  disagree with `phase-semantics` SHALL be updated **within this change**
  so that they are consistent with the spec.
- Reconciliation is data-level only: prose and data are corrected to
  match `phase-semantics`; no new TypeScript types, no new phases, and no
  new command templates are introduced.
- If any discrepancy cannot be fully reconciled in this change, it SHALL
  be explicitly recorded under `## Accepted Spec Conflicts` in `design.md`
  with a justification and a follow-up change reference — silent
  inconsistency is not permitted.

### Non-Goals (preserved from the issue, tightened here)

- No command templating *implementation* beyond prose corrections.
- No Markdown build system.
- No full redesign of task-graph semantics.
- No review transport implementation.
- No phase router implementation beyond what already exists.
- No changes to the set of phases in the canonical workflow state machine.
- No changes to runtime behavior of `phase-contract-types` or
  `phase-contract-structure`; deltas only add conformance requirements
  and populate existing fields — they do not add new types.

## Capabilities

### New Capabilities
- `phase-semantics`: Defines the contractual meaning of every workflow
  phase on a **per-phase** basis — identity, required inputs, expected
  outputs, completion condition, branching / gate condition (fully
  enumerated for every phase, with a terminal sentinel for terminal
  phases), and a phase-level delegation-boundary classification
  (`agent-delegated` / `deterministic` / `mixed`, with enumerated
  delegated outputs for `mixed`). The source of truth for the phase set
  is the "current phase" role in `canonical-workflow-state`. Vocabulary
  is constrained to existing specflow capabilities; new labels must be
  defined in their owning capability first. Runtime-agnostic and
  independent of slash command prose.

### Modified Capabilities
- `phase-contract-types`: Declare that the `PhaseContract` interface is a
  **lossless** conforming encoding of `phase-semantics` and that
  `cliCommands` is part of the normative encoding, not a local adapter
  detail. No new interface fields are added; existing fields are
  required to cover every `phase-semantics` role for every phase,
  including terminal phases.
- `phase-contract-structure`: Declare that the `PhaseIODescriptor` and
  `GateCondition` types are expressions of the `phase-semantics` roles
  "required inputs", "expected outputs", and "branching / gate
  condition". No new structural types.

## Impact

- **Spec surface**: Adds one new baseline capability under
  `openspec/specs/phase-semantics/` (populated via delta from this change)
  containing per-phase semantic definitions for every phase in the
  canonical workflow state machine. Adds conformance requirements to
  `phase-contract-types` and `phase-contract-structure`.
- **Runtime/UI consumers**: Server-side runtimes and UIs gain a
  runtime-agnostic, per-phase contract surface for phase meaning that
  does not require parsing slash command prose. `cliCommands` is
  declared normative, so portable consumers SHALL honor its semantics.
  No server/UI code is written in this change.
- **Slash commands**: `assets/commands/*.md.tmpl` files are audited and
  corrected where they disagree with `phase-semantics`. The set of
  commands is unchanged; only prose content changes.
- **Types and code**: `src/contracts/phase-contract.ts` field **values**
  MAY be updated so that the `PhaseContract` for every phase is a
  lossless encoding of `phase-semantics`. **No new interface fields** are
  added, so no TypeScript type surface changes. The structured phase
  contract data SHALL remain behaviorally compatible with existing
  consumers (e.g., `phase-router`, `renderPhaseMarkdown`).
- **Tests**: Existing `src/tests/phase-contract*.test.ts` may require
  value updates to keep structural equivalence assertions passing.
