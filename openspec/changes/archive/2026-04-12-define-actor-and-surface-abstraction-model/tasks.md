## 1. New Spec: actor-surface-model

- [x] 1.1 Create `openspec/specs/actor-surface-model/spec.md` with the full actor-surface-model spec (actor taxonomy, surface taxonomy, permission matrix, slash-command-as-surface principle, exhaustive `(from_state, event)` mapping from concrete workflow events to abstract operations, delegation rules with run-start-only grant timing and immutability constraints, review outcome vs workflow approval distinction, and reject semantics)
- [x] 1.2 Add an explicit by-reference compatibility statement to `openspec/specs/actor-surface-model/spec.md` citing `openspec/specs/agent-context-template/spec.md`, stating that its existing surface separation is encompassed by this model and that no spec change is required there in this proposal
- [x] 1.3 Validate the new spec with `openspec validate actor-surface-model --type spec`

## 2. Modified Spec: workflow-run-state

- [x] 2.1 Apply the spec delta to `openspec/specs/workflow-run-state/spec.md` — add the normative actor provenance contract (`actor` kind and `actor_id` identity required on history entries, delegated approvals record `delegated_by` and `delegated_by_id`, optional `surface` field, legacy `unknown` backward-compatibility sentinel for entries predating provenance, system-generated `automation` actor with source-identifying `actor_id`)
- [x] 2.2 Validate the updated spec with `openspec validate workflow-run-state --type spec`

## 3. Modified Spec: review-orchestration

- [x] 3.1 Apply the spec delta to `openspec/specs/review-orchestration/spec.md` — add actor-aware review handoff requirements (human vs ai-agent reviewer distinction, undelegated AI review_approved is advisory-only, delegated AI review_approved is binding, `request_changes` maps to the phase-appropriate `revise_*` transition, human block is non-overridable, AI block is overridable, current-phase rendering from the latest ledger snapshot, and round-summary persistence of `reviewer_actor`, `reviewer_actor_id`, `approval_binding`, `delegation_active`, optional `delegated_by`/`delegated_by_id`, and `overridden_by` actor identity fields)
- [x] 3.2 Validate the updated spec with `openspec validate review-orchestration --type spec`

## 4. Documentation Update

- [x] 4.1 Add "Actor / Surface Model" section to `docs/architecture.md` between "Repository Scope" and "Core Dependency Boundary" — summarize the model, reference the canonical spec, clarify relationship with core/adapter boundary
- [x] 4.2 Record by reference in `docs/architecture.md` that `agent-context-template`'s existing surface separation is encompassed by the new actor/surface model, cite `openspec/specs/agent-context-template/spec.md`, and state that no spec change is required in this proposal
- [x] 4.3 Review the new section for consistency with existing architecture doc terminology and structure

## 5. Verification

- [x] 5.1 Run `openspec validate --all --json` to confirm all specs pass validation
- [x] 5.2 Verify that acceptance criteria from the source issue are met: actor/surface model in docs, human/model interchangeability principle documented, slash commands identified as surface not core, `agent-context-template` compatibility statement recorded by reference in the canonical spec and architecture doc
