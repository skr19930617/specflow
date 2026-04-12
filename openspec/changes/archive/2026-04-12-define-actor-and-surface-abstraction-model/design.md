## Context

specflow currently has an implicit assumption that a human operates the workflow through the local CLI. The workflow state machine, review orchestration, and run-state persistence do not model who initiates transitions or through which interface. The `agent-context-template` spec already separates "surface-neutral core" from "surface-specific adapters" for context rendering, but this separation does not extend to workflow operations.

`docs/architecture.md` defines a core/adapter boundary focused on deployment topology (runtime-agnostic vs. backend-specific). This change introduces a complementary actor/surface boundary focused on identity and interaction semantics.

This is a spec + docs only change — no code modifications are in scope.

## Goals / Non-Goals

**Goals:**
- Define actor taxonomy (human, ai-agent, automation) as a formal model in specs and docs
- Define surface taxonomy (local-cli, remote-api, agent-native, batch) as a formal model
- Establish governing rules: actor determines permissions, surface determines presentation
- Define gated decision semantics (approve, reject) and delegation rules
- Distinguish review outcomes from workflow approvals
- Define the minimal actor provenance contract for run-state history (`actor` required, `surface` optional, legacy `unknown` fallback)
- Add actor/surface model section to `docs/architecture.md`
- Record explicit compatibility with `agent-context-template` surface separation by reference in the canonical spec and `docs/architecture.md`

**Non-Goals:**
- No code changes (no new TypeScript types, no CLI modifications, no run-state persistence implementation or migration changes)
- No changes to the `agent-context-template` spec (compatibility is by reference only; term unification is a future proposal)
- No delegation format specification (the proposal defines invariants; format is a future design concern when code changes land)
- No enforcement mechanism (lint rules, runtime checks) — those require code changes in a follow-up
- No changes to the XState state machine definition or `state-machine.json`

## Decisions

### D1: Actor taxonomy is a closed enum with three values

The actor kind is one of `human`, `ai-agent`, or `automation`. This is a closed set — no extensibility mechanism is provided at this time. The value `unknown` is a backward-compatibility sentinel for legacy history entries that predate provenance; it is NOT a member of the actor taxonomy, carries no workflow permissions, and SHALL NOT be used for new transitions.

Each actor instance is identified by both `actor` (kind) and `actor_id` (stable identity). The `actor_id` is required for auditability of delegation, review decisions, and overrides.

**Rationale:** An open enum (plugin-style actors) adds complexity without a concrete use case. The three kinds cover all current and foreseeable interaction patterns. If a fourth kind is needed, it can be added via a new proposal that updates the spec. The `unknown` sentinel resolves the apparent conflict between a closed enum and legacy backward-compatibility defaults without widening the taxonomy.

**Alternative considered:** Extensible enum with an `other` fallback. Rejected because it creates ambiguity in permission checks — the permission matrix must be exhaustive for gated decisions.

### D2: Surface taxonomy is illustrative, not exhaustive

The spec lists `local-cli`, `remote-api`, `agent-native`, and `batch` as representative surfaces. The governing rule is that surface does not affect permissions — so new surfaces can be added without updating the actor-surface-model spec, as long as they conform to the surface-neutral core principle.

**Rationale:** Surfaces are adapter-layer concerns. Unlike actors (which participate in gated decisions), surfaces only affect presentation. Enumerating them exhaustively would create unnecessary coupling between the model spec and adapter implementations.

**Alternative considered:** Closed surface enum (paralleling actors). Rejected because surfaces are deployment-specific and change more frequently than actors.

### D3: Provenance adopts a minimal spec contract with normative field names, not a full persistence schema

The `workflow-run-state` spec will define a minimal provenance contract for
history entries: `actor` and `actor_id` are required provenance fields,
`surface` is optional, legacy entries without provenance are interpreted as
`actor: "unknown"`, and system-generated transitions (for example timeout or
auto-advance) are recorded as `actor: "automation"`. When a delegated
`approve` is recorded, the same history entry SHALL also record
`delegated_by: "human"` and `delegated_by_id` so the delegating human and the
executing ai-agent are both auditable. These field names are normative for the
spec delta in this proposal.

This proposal therefore does not defer provenance to principle-only guidance. It standardizes the spec-level field names required for interoperability while still deferring implementation-specific JSON types, storage layout, and migration mechanics.

This change does not define code-level JSON types, storage migration mechanics, or CLI persistence behavior. Those implementation details remain deferred to a follow-up proposal.

**Rationale:** The review findings and target `workflow-run-state` delta require interoperable field names now. Adopting the minimal contract removes ambiguity for spec authors while still keeping implementation-specific schema work out of scope for this spec + docs change.

**Alternative considered:** Keeping provenance fully principle-only. Rejected because it conflicts with the required `workflow-run-state` spec delta and leaves implementers without a stable contract for actor provenance fields.

### D4: Review outcomes and workflow approvals are separate vocabularies with explicit invariants

Review outcomes (`review_approved`, `request_changes`, `block`) are
review-phase judgments. Workflow approvals (`approve`, `reject`) are gated
state transitions. The review-orchestration spec defines the mapping between
them, subject to three hard invariants:

1. **Undelegated AI `review_approved` is advisory-only**: When an ai-agent reviewer issues `review_approved` and no delegation exists for the current run, the outcome SHALL NOT trigger a gated workflow approval. It SHALL be recorded as an advisory recommendation. Only when delegation is active may the review outcome map to a gated workflow transition.
2. **`request_changes` always maps to a phase-local revision**: When either a human reviewer or an ai-agent reviewer issues `request_changes`, the outcome SHALL keep the workflow in the current review cycle and require the phase-appropriate `revise_*` transition before re-review. Delegation does not change this mapping because `request_changes` is not a gated approval.
3. **Human `block` is non-overridable**: When a human reviewer issues `block`, no actor (including other human actors) SHALL override it. Any attempt to change the status of a human-issued block must be rejected. This ensures that human review authority is not undermined.

These invariants must be expressed as normative requirements in the
`review-orchestration` spec delta.

**Rationale:** The proposal review uncovered a conflict between AI review `approve` and delegated workflow `approve`. Separating the vocabularies eliminates ambiguity, but without the three hard invariants above, the review-to-workflow mapping could still violate the actor permission model.

### D5: Delegation is run-scoped with explicit grant timing and safe default

Delegation for ai-agent approval is scoped per-run, granted only by human actors, and defaults to "no delegation." The allowed grant sources and timing are:

1. **Grant timing**: Delegation SHALL be established at run-start time only. Mid-run delegation (granting after the run has started) is not permitted. This prevents approval semantics from changing during a workflow execution.
2. **Grant sources**: Delegation SHALL be declared via one of two mechanisms:
   - Run metadata at creation time (a field in the `specflow-run start` invocation)
   - Explicit declaration in the proposal artifact (a section in `proposal.md`)
3. **Immutability**: Once a run starts, the delegation status (present or absent) SHALL NOT change for that run.

The specific field format for expressing delegation in run metadata or proposal.md is deferred to a follow-up implementation proposal. This change defines the allowed grant timing and sources as normative constraints in the `actor-surface-model` spec.

**Rationale:** Run-scoped delegation prevents cross-run permission leakage. Grant-at-start-only prevents mid-run escalation. Safe default (no delegation) means existing workflows are unaffected. The format is deferred because it touches RunState schema which has a known mixed-field issue, but the timing and source constraints are specified now to prevent ad-hoc delegation patterns.

### D6: docs/architecture.md gets a new Actor/Surface Model section

A new section is added to `docs/architecture.md` between "Repository Scope" and "Core Dependency Boundary" that summarizes the actor/surface model, references the canonical spec, and clarifies how it complements the existing core/adapter boundary.

**Rationale:** Architecture docs are where developers look for cross-cutting concerns. The actor/surface model is a horizontal concern that informs both core and adapter design. Placing it in architecture.md ensures discoverability alongside the existing boundary rules.

**Alternative considered:** Separate `docs/actor-surface-model.md` file. Rejected because the model is an architectural principle, not an implementation guide — it belongs in the architecture overview.

### D7: `agent-context-template` compatibility is recorded explicitly by reference

The new spec/docs set must explicitly state, by reference to `openspec/specs/agent-context-template/spec.md`, that `agent-context-template`'s existing surface separation for context rendering is encompassed by the actor/surface model and does not require any change to the `agent-context-template` spec in this proposal. This statement must appear in the canonical `actor-surface-model` spec and in `docs/architecture.md`.

**Rationale:** The proposal includes this compatibility statement as an acceptance criterion. Recording it explicitly by reference prevents the relationship from being treated as background context only and gives reviewers a concrete deliverable to verify.

## Risks / Trade-offs

**[Risk] Spec without enforcement may be ignored** → Mitigation: The spec establishes vocabulary and rules that future implementation proposals will reference. Even without runtime enforcement, it provides a shared language for design discussions and review feedback. Follow-up proposals for code changes will reference these specs.

**[Risk] Minimal provenance contract without implementation may still cause drift** → Mitigation: The spec now fixes the interoperable fields (`actor`, `actor_id`, delegated-approval `delegated_by`/`delegated_by_id`, optional `surface`) and legacy defaults. A follow-up implementation proposal will define the concrete RunState type and migration path.

**[Risk] Delegation format deferred may block autonomous workflow proposals** → Mitigation: The invariants (run-scoped, human-granted, auditable, safe default) constrain future format design without blocking it. Any autonomous workflow proposal can define the format as part of its own design phase.

**[Trade-off] Closed actor enum vs. extensibility**: We accept reduced flexibility for clarity in permission semantics. Adding a new actor kind requires a spec change, which is acceptable given the governance overhead of gated decision rules.
