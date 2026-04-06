# Research: OpenSpec Migration

## R1: OpenSpec Directory Convention

**Decision**: Follow the OpenSpec standard structure: `openspec/specs/<capability>/spec.md` for current truth, `openspec/changes/<change-id>/` for proposals.

**Rationale**: The OpenSpec model provides a clear separation between current truth (what the system IS) and proposed changes (what it SHOULD become). This matches the issue's stated goals.

**Alternatives considered**:
- Keep existing `specs/` structure → rejected, doesn't separate truth from changes
- Custom directory naming (e.g., `planning/`) → rejected, OpenSpec is an emerging convention worth adopting

## R2: File Mapping for Historical Migration

**Decision**: Map `spec.md` → `proposal.md`, `plan.md` → `design.md`, keep `tasks.md` as-is, copy all other artifacts unchanged.

**Rationale**: OpenSpec changes use `proposal.md` as the primary description (analogous to our `spec.md`). `design.md` maps to our `plan.md` (implementation design). `tasks.md` has the same semantic meaning in both structures. Other artifacts (research.md, data-model.md, review-ledger*.json, checklists/) are specflow-specific and can be preserved as-is.

**Alternatives considered**:
- Deep content transformation (rewrite to OpenSpec format) → rejected per FR-004: minimal transformation, no content rewriting
- Flatten all files into proposal.md → rejected, loses structure and history

## R3: Atomic Migration Pattern

**Decision**: Use `.migrating/` temporary directory pattern with 3-state detection.

**Rationale**: Standard pattern for file system operations where atomicity matters. The temporary directory serves as a transaction log — its presence indicates an incomplete operation. `mv` (rename) is atomic on the same filesystem, so the transition from `.migrating/` to final name is safe.

**Alternatives considered**:
- Completion marker file (e.g., `.migration-complete`) → rejected, adds an extra artifact to clean up
- Database/JSON tracking → rejected, over-engineered for file operations
- Git-based detection (check if target is committed) → rejected, couples migration to git state

## R4: Command Audit Strategy

**Decision**: Audit based on whether each command's core function is OpenSpec-native or specflow-specific.

**Rationale**: Commands that orchestrate Codex reviews, manage review ledgers, or handle approval workflows are specflow-specific value and should be kept/modified. Commands that primarily manage the `specs/` directory structure may overlap with OpenSpec conventions.

**Preliminary audit assessment** (to be finalized in implementation):
- **Keep/Modify** (most commands): specflow.md, specflow.approve.md, specflow.fix.md, specflow.impl.md, specflow.impl_review.md, specflow.plan.md, specflow.plan_fix.md, specflow.plan_review.md, specflow.reject.md, specflow.spec_fix.md, specflow.spec_review.md — these provide Codex review orchestration and workflow that OpenSpec doesn't replace
- **Modify**: specflow.setup.md — needs to reference openspec/ instead of specs/
- **Evaluate**: specflow.decompose.md — may need path updates or evaluation against OpenSpec change conventions

## R5: Bootstrap Payload for Downstream Projects

**Decision**: Additive bootstrap — add `openspec/` scaffolding to existing payload without removing any current artifacts.

**Rationale**: FR-008 explicitly requires preserving existing bootstrap artifacts (.specflow/config.env, .mcp.json, CLAUDE.md, .specify/). Adding `openspec/` directories and README is minimal and non-breaking.

**Alternatives considered**:
- Replace `specs/` bootstrapping with `openspec/` → rejected, downstream migration policy is out of scope
- Include sample spec/change in bootstrap → rejected, empty dirs are sufficient for scaffolding

## R6: Inventory of Existing Specs

20 directories under `specs/`:
- 001-current-truth through 019-autofix-loop-reliability: completed feature development records
- 020-openspec-migration: this migration (active — will also be migrated to openspec/changes/ as part of the cutover)

Each directory typically contains: spec.md, plan.md, tasks.md, research.md, data-model.md, quickstart.md, checklists/, review-ledger*.json, current-phase.md, approval-summary.md

All are classified as historical change records per Clarifications.
