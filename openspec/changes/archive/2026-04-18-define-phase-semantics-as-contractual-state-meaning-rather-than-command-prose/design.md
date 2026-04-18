## Context

specflow already has a workflow state machine, an event vocabulary, and a
TypeScript `PhaseContract` registry. What it does not have is a
spec-level, runtime-agnostic definition of what each phase *means* —
what it consumes, what it produces, when it is done, what decides its
next transition, and which parts are delegated to an agent versus
handled by deterministic orchestration. That meaning is currently
scattered across slash command prose (`assets/commands/*.md.tmpl`), the
structured `phaseContractData` array in
`src/contracts/phase-contract.ts`, and the behaviour of helper CLIs
(`specflow-run`, `specflow-design-artifacts`, `specflow-spec-verify`,
etc.).

Issue [#165](https://github.com/skr19930617/specflow/issues/165) asks
for phase semantics to be treated as a **contractual state meaning**
and separated from command prose, so that server-side runtimes and
alternate UIs can reason about phases without reading the slash
command bodies.

Stakeholders:
- The authors of `/specflow.*` commands, who need phase meaning to be
  referenceable rather than re-expressed in prose.
- Future server-side runtime and UI consumers, which should be able to
  render phase status, required inputs, expected outputs, gate
  decisions, etc. from a neutral source.
- Maintainers of `phase-contract-types` and `phase-contract-structure`,
  who need a clear relationship between the TypeScript types and the
  semantic authority.

Existing capabilities this change touches or relies on:
- `canonical-workflow-state` — owns the "current phase" canonical role
  and therefore the phase set.
- `workflow-run-state` — owns the run-state shape that consumes phase
  meaning (allowed events, lifecycle status).
- `phase-contract-types` — owns the TypeScript `PhaseContract`
  interface and registry (modified here).
- `phase-contract-structure` — owns the `PhaseIODescriptor` and
  `GateCondition` descriptor types (modified here).
- `artifact-ownership-model`, `surface-event-contract`,
  `review-orchestration`, `actor-surface-model` — supply the vocabulary
  `phase-semantics` references.

## Goals / Non-Goals

**Goals:**
- Introduce `phase-semantics` as the spec-level meaning authority for
  every workflow phase, with per-phase enumeration of all six
  mandatory roles (identity, required inputs, expected outputs,
  completion condition, branching / gate condition, delegation
  boundary) including terminal phases.
- Align `phase-contract-types` and `phase-contract-structure` so each
  becomes an explicit conforming encoding of `phase-semantics`.
- Declare `cliCommands` as a normative encoding of deterministic-side
  work, not as a local-adapter implementation detail.
- Reconcile the existing slash command prose and structured
  phase-contract data **in this change** so they agree with
  `phase-semantics`, recording any residual divergences under
  `## Accepted Spec Conflicts`.

**Non-Goals:**
- No command templating implementation beyond prose corrections.
- No Markdown build system.
- No redesign of task-graph semantics.
- No review transport implementation.
- No phase router implementation beyond the current registry-backed
  one.
- No changes to the set of phases in the canonical workflow state
  machine.
- No new TypeScript interface fields on `PhaseContract`,
  `PhaseIODescriptor`, or `GateCondition`.
- No server-side runtime implementation work.

## Decisions

### D1. `phase-semantics` is the meaning authority

**Decision:** `phase-semantics` is the spec-level authority for phase
meaning. `phase-contract-types` becomes a conforming encoding at the
TypeScript layer.

**Alternatives considered:**
- Treating `phase-contract-types` as the authority and having
  `phase-semantics` be a sub-spec of it. Rejected because the
  TypeScript type is one of several possible encodings; server-side
  runtimes should not depend on TypeScript field names.
- Leaving the two parallel with cross-references. Rejected because it
  leaves no arbiter when the two disagree.

### D2. Per-phase enumeration over generic contract surface

**Decision:** The spec enumerates all 21 canonical phases with their
six-role values, rather than stating only the generic contract surface
and leaving per-phase values to another capability or runtime.

**Alternatives considered:**
- Generic surface only. Rejected because it leaves the actual meaning
  of concrete phases (`design_review`, `apply_review`, etc.) in prose,
  which is precisely what the issue wants to stop.
- Generic surface + per-phase table in a separate capability. Rejected
  as unnecessary layering; there is no consumer that benefits from the
  two being separable right now.

### D3. Phase set is sourced from `canonical-workflow-state`

**Decision:** The set of phase names covered by `phase-semantics` is
defined as equal to the "current phase" canonical role set defined by
`canonical-workflow-state`. `phase-semantics` owns meaning but not
identity.

**Alternatives considered:**
- Treating the `PhaseContractRegistry` as the phase-list source.
  Rejected because the registry is a TypeScript artifact; phase
  identity should live above any specific encoding.
- Treating the set of phases accepted by `specflow-run advance` as the
  source. Rejected because it is a CLI surface, not a canonical
  definition.

### D4. Delegation boundary is phase-level classification

**Decision:** Classify each phase as `agent-delegated`,
`deterministic`, or `mixed`. For `mixed`, enumerate delegated outputs
but not every deterministic step.

**Rationale:** Server-side runtimes need to know whether a phase
requires AI/human involvement at all; they do not need a per-step map
to render status. Finer granularity is still available through
`cliCommands` and `agentTask` on the TypeScript encoding, but the
semantic surface stays small.

**Alternatives considered:**
- Step-level enumeration 1:1 with `cliCommands` / `agentTask` /
  `gatedDecision`. Rejected as overly coupled to the TypeScript
  encoding and prone to drift.
- Boolean-only "contains delegation" flag. Rejected as too coarse —
  consumers cannot distinguish purely deterministic phases from mixed
  ones.

### D5. `cliCommands` is normative, not adapter-private

**Decision:** `cliCommands` is part of the normative encoding of each
phase's deterministic work. Non-local consumers must honour the same
command semantics (though the transport may differ).

**Rationale:** Several deterministic steps only exist as CLI commands
today (e.g., `openspec validate`, `specflow-spec-verify`,
`specflow-review-design`). If these were adapter-private, a
server-side runtime could drift from the local reference and still
claim conformance.

**Trade-off:** This ties `phase-semantics` consumers to a specific set
of CLI commands. If we later want to swap a CLI for a library call,
the normative link means the spec must be updated. Accepted to
preserve a single reference implementation of each step.

### D6. Lossless encoding via data values, not new fields

**Decision:** `PhaseContract` shall losslessly encode all six roles
for every phase. Losslessness is achieved by populating existing
fields (possibly updating values), not by adding new TypeScript
fields.

**Rationale:** Preserves structural backward compatibility. Existing
consumers of `PhaseContract` (phase-router, `renderPhaseMarkdown`,
tests) keep compiling.

**Trade-off:** Roles like "completion condition" are implicit
(combination of `producedOutputs` + `gatedDecision`/`advance_event`).
Consumers that want an explicit completion field must compose it.
Accepted because adding a new field would violate the non-goal and
its need is speculative.

### D7. All roles mandatory for terminal phases, with defined sentinels

**Decision:** Terminal phases (`approved`, `decomposed`, `rejected`)
declare all six roles. Empty sets use the explicit empty encoding;
branching uses the sentinel `no transition / terminal` paired with
`terminal_reason`.

**Rationale:** Consumers should not need conditional logic for
terminal phases; every definition has the same shape. Spec-verify
simpler; server-side UIs render uniformly.

### D8. Vocabulary constrained to existing capabilities

**Decision:** `phase-semantics` may not coin new artifact names, event
names, or gate-condition labels. When a needed label is missing, the
owning capability must be extended in a separate change first.

**Rationale:** Prevents `phase-semantics` from becoming a dumping
ground for ad-hoc vocabulary and keeps ownership boundaries clean.

### D9. Reconcile prose and data in this change

**Decision:** Within this change, audit slash command prose in
`assets/commands/*.md.tmpl` and the structured phase-contract data in
`src/contracts/phase-contract.ts` and update both to match
`phase-semantics`. Residual divergences go into
`## Accepted Spec Conflicts` below with a follow-up plan.

**Alternatives considered:**
- Spec-only change, reconciliation in follow-up. Rejected because the
  spec is an authority with no teeth unless current artifacts respect
  it.
- Replace all prose with spec references immediately. Rejected as
  scope creep — the non-goal explicitly forbids a Markdown build
  system, and command templates still need human-readable text.

## Risks / Trade-offs

- **Risk:** Scope of reconciliation (D9) may grow beyond what is
  practical in one change, especially for long-form command prose.
  **Mitigation:** Limit prose corrections to places where prose
  *disagrees* with `phase-semantics` (wrong inputs, wrong branching,
  wrong delegation boundary). Stylistic improvements are out of
  scope. If a prose change is larger than a paragraph, record it as
  an Accepted Spec Conflict with a follow-up issue reference.

- **Risk:** `cliCommands`-as-normative (D5) may later restrict us if
  we want to offer a non-CLI transport for a deterministic step.
  **Mitigation:** The spec requires non-local consumers to honour
  "the same deterministic command *semantics*", not the same literal
  string. A future transport change can update the spec once.

- **Risk:** Lossless encoding (D6) may reveal that some existing
  `PhaseContract` values are incomplete (e.g., `requiredInputs` that
  the current data omits).
  **Mitigation:** The implementation bundle includes a sweep of all
  21 phases against the spec. Missing values are filled in; genuine
  ambiguities become Accepted Spec Conflicts.

- **Trade-off:** Terminal phases carry mandatory roles with empty or
  sentinel values (D7). This is slightly verbose but strictly
  simpler for consumers than optional roles.

- **Trade-off:** The vocabulary constraint (D8) may slow unrelated
  changes if a new concept legitimately belongs in
  `phase-semantics`. Accepted: two-change workflow keeps ownership
  clean.

## Migration Plan

- No runtime migration; there is no stored state whose shape
  changes.
- Downstream consumers of `PhaseContract` continue to see the same
  interface shape. Values in the registry may change for specific
  phases where reconciliation identified incomplete data.
- Archive ordering:
  1. `openspec archive` the change, which writes the new
     `phase-semantics` baseline and updates the two modified
     baselines.
  2. Tests covering `PhaseContract` values (e.g.,
     `src/tests/phase-contract*.test.ts`) may need value-level
     updates in the same PR; no interface-level mocking changes.

## Open Questions

- **Q1:** Do we want `phase-semantics` definitions in the spec to be
  authoritative for `explore` and `spec_bootstrap` utility phases,
  given that they currently short-circuit the main workflow?
  *Working answer in this design:* yes, with branching expressed as
  the terminal sentinel from their perspective. Revisit if a future
  capability formalises utility branches.
- **Q2:** Should `cliCommands` be promoted from an informative list of
  commands to an enumerated artifact in `phase-semantics` itself
  (e.g., a named "deterministic step" concept)?
  *Working answer:* no, not in this change. `cliCommands` remains a
  TypeScript-layer structure; the normative link is expressed at the
  semantic layer without reifying a new vocabulary term.

## Concerns

Vertical slices that together deliver the change:

- **C1. `phase-semantics` baseline creation.** Ship the new baseline
  spec under `openspec/specs/phase-semantics/spec.md` via the archive
  of this change. Problem solved: there is no spec-level authority
  for phase meaning today.
- **C2. `phase-contract-types` grounding.** Update the baseline
  `phase-contract-types` spec so `PhaseContract` is explicitly a
  lossless conforming encoding of `phase-semantics`, and
  `cliCommands` is declared normative. Problem solved: encoding and
  authority are currently ungrounded.
- **C3. `phase-contract-structure` grounding.** Update the baseline
  `phase-contract-structure` spec so `PhaseIODescriptor` and
  `GateCondition` are expressions of the `phase-semantics` roles.
  Problem solved: structural types currently stand alone without a
  semantic anchor.
- **C4. Structured phase-contract data reconciliation.** Audit
  `phaseContractData` in `src/contracts/phase-contract.ts` against
  the per-phase values in `phase-semantics`. Fill in missing or
  incorrect values across all encoding fields that carry semantic
  content: `requiredInputs`, `producedOutputs`, `advance_event`,
  `gatedDecision`, `terminal_reason`, `next_action`, `gated`,
  `terminal`, `next_phase`, `gated_event_kind`, `gated_event_type`,
  `agent`, `agentTask`, and `cliCommands` — including explicit
  empty-set encodings for terminal and purely agent-delegated
  phases. Flag data-level disagreements as Accepted Spec Conflicts
  with rationale and a follow-up change reference. Problem solved:
  the TypeScript registry today is not guaranteed to be lossless.
- **C5. Slash command prose reconciliation.** Audit
  `assets/commands/*.md.tmpl` for disagreements with `phase-semantics`
  (wrong inputs/outputs, wrong branching, wrong delegation boundary).
  Correct factual errors; record stylistic/organisational gaps as
  Accepted Spec Conflicts with follow-up issues. Problem solved:
  prose today can drift from the state machine without anyone
  noticing.
- **C6. Test suite alignment.** Adjust value-level assertions in
  `src/tests/phase-contract*.test.ts` so they continue to pass after
  C4, without changing test structure or adding new tests beyond
  losslessness coverage. Problem solved: existing tests lock in
  current values and must be updated when C4 fills gaps.

## State / Lifecycle

- **Canonical state:** `canonical-workflow-state` continues to own
  the "current phase" role, lifecycle status, allowed events,
  history, and source metadata. `phase-semantics` adds meaning to
  each phase value; it does not add state.
- **Derived state:** `allowed_events` at a given phase remains
  derived from the workflow state machine, which `phase-contract-types`
  encodes. `phase-semantics` describes the same set from the branching
  / gate condition role and must agree.
- **Lifecycle boundaries:** Terminal phases (`approved`, `decomposed`,
  `rejected`) now have a uniform sentinel branching value. Lifecycle
  status (active / suspended / terminal) continues to be owned by
  `canonical-workflow-state`.
- **Persistence-sensitive state:** None added. The change is
  spec-and-data-only; no new persisted fields.

## Contracts / Interfaces

- **spec → TypeScript:** `phase-semantics` (new baseline) → encoded by
  `phase-contract-types` (existing interface, no new fields).
- **spec → structural types:** `phase-semantics` roles "required
  inputs", "expected outputs", "branching / gate condition" →
  expressed by `phase-contract-structure` (`PhaseIODescriptor`,
  `GateCondition`).
- **spec → slash command prose:** `phase-semantics` is the authority.
  Command templates reference meaning without being the source of
  meaning.
- **TypeScript registry → consumers:** `phaseContractRegistry`
  exposed by `src/contracts/phase-contract.ts` continues to be the
  in-process lookup. `renderPhaseMarkdown` remains the Markdown
  rendering surface.
- **CLI surface:** `cliCommands` entries are declared normative for
  deterministic work. `specflow-run advance` events, `openspec
  validate`, `openspec archive`, and `specflow-spec-verify` are the
  cited deterministic commands; their semantics are the contract,
  regardless of transport.

## Persistence / Ownership

- **Spec ownership:**
  - `openspec/specs/phase-semantics/spec.md` — new, owned by the
    `phase-semantics` capability (created via archive of this change).
  - `openspec/specs/phase-contract-types/spec.md` — existing, modified
    to reference `phase-semantics`.
  - `openspec/specs/phase-contract-structure/spec.md` — existing,
    modified to reference `phase-semantics`.
- **Code ownership:** `src/contracts/phase-contract.ts` continues to
  own the in-memory registry and Markdown rendering. `PhaseContract`
  data values are reconciled against `phase-semantics` in C4.
- **Prose ownership:** `assets/commands/*.md.tmpl` continues to be
  authored text; authors must not re-express phase meaning, only
  reference it.
- **No new data stores.** No migrations required.

## Integration Points

- **`canonical-workflow-state`:** `phase-semantics` pins its phase-set
  dependency on the "current phase" canonical role. Any future change
  that adds or removes a phase there must update `phase-semantics`.
- **`artifact-ownership-model`:** `phase-semantics` cites artifact
  paths from this capability (e.g., `proposal.md`, `design.md`,
  `tasks.md`, `review-ledger.json`).
- **`surface-event-contract`:** `phase-semantics` cites event names
  (`check_scope`, `continue_proposal`, `accept_proposal`,
  `spec_validated`, `spec_verified`, `accept_spec`, `review_design`,
  `design_review_approved`, `revise_design`, `accept_design`,
  `review_apply`, `apply_review_approved`, `revise_apply`,
  `accept_apply`, `reject`, `decompose`) for branching definitions.
- **`review-orchestration`:** design/apply review phases cite the
  ledger artifacts owned by this capability.
- **`actor-surface-model`:** delegation boundary classification uses
  actor provenance vocabulary from this capability.
- **CLI integrations:** `openspec list`, `openspec validate`,
  `openspec archive`, `specflow-run`, `specflow-design-artifacts`,
  `specflow-spec-verify`, `specflow-review-design`,
  `specflow-review-apply`, `specflow-challenge-proposal`, and
  `specflow-advance-bundle` are the commands referenced as normative
  deterministic work.

## Ordering / Dependency Notes

Implementation ordering (topological):

1. **Foundational:** C1 (phase-semantics baseline) — lands at archive
   time. No code dependency.
2. **Foundational:** C2 (phase-contract-types grounding) and C3
   (phase-contract-structure grounding) — both can land in parallel
   with C1. No code changes required by these; they are spec-only.
3. **Depends on C1 values:** C4 (structured phase-contract data
   reconciliation). The data audit needs the per-phase definitions to
   compare against.
4. **Depends on C1 values:** C5 (slash command prose reconciliation).
   Independent of C4 and can run in parallel with it.
5. **Depends on C4:** C6 (test alignment). Tests must be updated only
   after the data has been reconciled.

Parallelisable: {C2, C3} can run concurrently with {C4, C5} once the
spec content exists. C6 is sequenced after C4.

## Completion Conditions

- **C1 complete:** `openspec/specs/phase-semantics/spec.md` exists
  after archive and `openspec validate` passes; all 21 per-phase
  scenarios are present.
- **C2 complete:** baseline `phase-contract-types/spec.md` after
  archive contains the lossless-encoding requirement and the
  cliCommands-normative requirement; `openspec validate` passes.
- **C3 complete:** baseline `phase-contract-structure/spec.md` after
  archive contains the phase-semantics grounding for
  `PhaseIODescriptor`, `GateCondition`, and the discriminated-union
  extension policy; `openspec validate` passes.
- **C4 complete:** for every phase in `phaseContractData`, every
  `phase-semantics` role is recoverable from existing fields without
  ambiguity; discrepancies are either fixed in data or recorded as
  Accepted Spec Conflicts below.
- **C5 complete:** `assets/commands/*.md.tmpl` contains no factual
  disagreement with `phase-semantics`; stylistic gaps are either
  fixed or recorded with follow-up references.
- **C6 complete:** `src/tests/phase-contract*.test.ts` and any
  dependent tests pass after C4's data updates.
- **Overall:** `openspec validate` passes, the apply review gate's
  design review approves, and `phaseContractRegistry` assertions in
  the test suite remain green.

## Accepted Spec Conflicts

<!-- Row schema:
| id | capability | delta_clause | baseline_clause | rationale | follow_up | accepted_at |
Each accepted conflict SHALL include both a rationale and a follow_up
change reference (e.g., an issue URL or change branch name) per the
proposal's reconciliation requirements. -->

| id | capability | delta_clause | baseline_clause | rationale | follow_up | accepted_at |
|----|------------|--------------|-----------------|-----------|-----------|-------------|
| AC1 | phase-semantics | `explore` phase transitions to `start` via `explore_complete`; `start` transitions to `explore` via `explore_start` | `/specflow.explore` command is a free-form "stance, not workflow" that does not invoke `specflow-run advance` at all | The explore utility currently bypasses the run-state machinery entirely. `phase-semantics` documents the intended state-machine integration; wiring the command to run-state requires a separate change. Accepted here so that `phase-semantics` enumerates the full state-machine surface without blocking this change on slash-command reimplementation. | Follow-up: open a new issue to integrate `/specflow.explore` with run-state transitions (`explore_start`/`explore_complete`) once the surface is ready. | 2026-04-18T04:50:00Z |
| AC2 | phase-semantics | `spec_bootstrap` phase transitions to `start` via `spec_bootstrap_complete`; `start` transitions to `spec_bootstrap` via `spec_bootstrap_start` | `/specflow.spec` command generates baseline specs without invoking `specflow-run advance` | Same reasoning as AC1 — the bootstrap utility does not currently participate in run-state. Documented in `phase-semantics` to keep the state-machine surface complete. | Follow-up: open a new issue to integrate `/specflow.spec` with run-state transitions (`spec_bootstrap_start`/`spec_bootstrap_complete`) once the surface is ready. | 2026-04-18T04:50:00Z |
| AC3 | phase-contract-types | `start` phase has three outgoing branches (`propose`, `explore_start`, `spec_bootstrap_start`) per phase-semantics and the workflow state machine | `PhaseContract` routing field `advance_event` encodes only the single mainline branch `propose`; the router (`deriveAction`) can only auto-fire that event | The `PhaseNextAction` routing model's `advance` mode supports only single-successor transitions. `start`'s two utility branches (`explore_start`, `spec_bootstrap_start`) are encoded in `cliCommands` and recoverable by consumers reading the full contract, but not surfaceable by the router alone. All three events appear in `cliCommands` for discoverability. A future routing model enhancement (e.g., a multi-outcome advance mode) would resolve this fully. | Follow-up: open a new issue to extend `PhaseNextAction` routing to support multi-outcome deterministic phases, removing the need for the `advance_event`-only encoding of `start`. | 2026-04-18T14:00:00Z |
| AC4 | phase-contract-types | `spec_validate` is classified as `deterministic` by `phase-semantics` — its output-producing work is the deterministic `openspec validate` CLI command | `PhaseContract` for `spec_validate` has `next_action: "invoke_agent"` and `agent: "claude"` because multi-branch routing requires an agent encoding | The `PhaseNextAction` routing model's `advance` mode only supports single-successor transitions. `spec_validate` has three outcomes (`spec_validated`, `revise_spec`, `reject`), so `advance` cannot express the branching. The agent encoding is used as a routing workaround; the actual deterministic work is in `cliCommands`. The delegation test documents this as an encoding-level agent, not a semantic one. | Follow-up: resolve alongside AC3 — a multi-outcome routing mode would allow `spec_validate` to be encoded without an agent, matching its `deterministic` phase-semantics classification. | 2026-04-18T14:00:00Z |
