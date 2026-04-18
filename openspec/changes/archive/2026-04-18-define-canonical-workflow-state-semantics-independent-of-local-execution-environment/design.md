# Design — Define canonical workflow state semantics independent of local execution environment

## Context

Today the specflow repository persists workflow run-state under
`.specflow/runs/<run_id>/run.json`. Its shape is defined by three
TypeScript aliases in `src/types/contracts.ts`:

- `CoreRunState` — runtime-agnostic fields (12 fields: `run_id`,
  `change_name`, `current_phase`, `status`, `allowed_events`, `agents`,
  `history`, `source`, `created_at`, `updated_at`, `previous_run_id`,
  `run_kind`).
- `LocalRunState` — local filesystem / git-backed adapter fields
  (6 fields: `project_id`, `repo_name`, `repo_path`, `branch_name`,
  `worktree_path`, `last_summary_path`).
- `RunState = CoreRunState & LocalRunState` — the compatibility alias.

The partition was introduced in the `runstate-adapter-extension`
capability for type-level reasons (enabling `RunState<TAdapter>` for
alternate adapters). However, the repository currently has no spec that
defines the **semantic meaning** of "canonical workflow state" —
i.e. what the canonical surface represents as a contract, independent
of any concrete type or persistence format. Issue #164 asks us to fix
that by producing a dedicated semantic contract spec, without touching
implementation fields.

Stakeholders:
- **specflow core maintainers** — need a stable semantic anchor before
  designing server-backed runtimes or alternate UIs.
- **future adapter authors** — need to know which state they are free
  to own privately vs. which state must conform to canonical meaning.
- **future consumers** (server, UI, review transport) — need a
  runtime-agnostic surface they can depend on.

Constraint: this change is **spec-only**. The type-level partition
already conforms to the canonical semantics we will formalize, so no
TypeScript source edits, no CLI behavior edits, and no artifact-store
changes are in scope.

## Goals / Non-Goals

**Goals:**

- Publish `openspec/specs/canonical-workflow-state/spec.md` as the
  normative source of truth for the semantic meaning of workflow state.
- Enumerate the nine canonical semantic roles once, in one place, with
  each role's purpose and the invariants it carries.
- Define adapter execution state by an exclusion rule so the canonical
  surface is future-proof against new adapters.
- Add a normative reference inside `openspec/specs/workflow-run-state/spec.md`
  declaring that the existing `CoreRunState` / `LocalRunState` partition
  conforms to the canonical semantics, without modifying field lists or
  scenarios.
- Preserve backward compatibility: every existing consumer of `RunState`,
  `CoreRunState`, or `LocalRunState` continues to compile untouched.

**Non-Goals:**

- Moving, renaming, adding, or removing any field in `CoreRunState` /
  `LocalRunState` / `RunState`.
- Defining an interchange / serialization format (JSON Schema,
  protobuf, OpenAPI) for the canonical surface.
- Specifying a stability / breaking-change / semver policy for canonical
  state.
- Designing a server, review transport, event streaming, or DB schema.
- Implementing any runtime that consumes canonical state non-locally.

## Decisions

### D1. Represent canonical meaning as a dedicated capability spec

**Choice:** Create a new `canonical-workflow-state` capability spec that
owns the semantic contract.

**Alternatives considered:**
- (a) Extend `workflow-run-state` with the semantic definitions inline.
- (b) Extend `runstate-adapter-extension` with the semantic definitions.

**Rationale:** Both existing specs describe implementation contracts —
the CLI / state-machine behavior for (a), and the type-level adapter
mechanism for (b). The canonical semantics is conceptually upstream of
both: it defines the meaning that those implementations must conform
to. Placing it in a standalone capability makes the source-of-truth
direction explicit and avoids expanding the scope of either existing
capability.

### D2. Nine canonical roles, enumerated by purpose — not by field

**Choice:** The canonical surface SHALL be described as nine semantic
**roles** (run identity, change identity, current phase, lifecycle
status, allowed events, actor identity, source metadata, history,
previous run linkage), not as a field-level list.

**Alternatives considered:**
- (a) Enumerate concrete field names (`run_id`, `change_name`, …) in
  the canonical spec.
- (b) Leave the roles undefined and rely on `CoreRunState`'s existing
  field names.

**Rationale:** The issue explicitly says *"field 移動ではなく canonical
meaning の確定にある"* — the spec should anchor meaning that survives
future renames. Role-level definitions let alternate runtimes choose
different field encodings while still conforming. `CoreRunState`
becomes one representation of the canonical surface, not its
definition.

### D3. Adapter execution state is defined by exclusion

**Choice:** A field is adapter execution state iff it does not map to
any of the nine canonical roles. No exhaustive normative list of
adapter-private fields.

**Alternatives considered:**
- (a) Exhaustively list current `LocalRunState` fields as normative
  adapter-private fields.
- (b) Require every adapter to register its private fields in the spec.

**Rationale:** (a) and (b) both grow the spec each time a new adapter
appears; the exclusion rule is stable. Informative examples of current
local-adapter fields remain (for readability) but carry no normative
force.

### D4. Reference from `workflow-run-state` is normative and additive

**Choice:** Add one `ADDED Requirement` to the `workflow-run-state`
delta declaring that `CoreRunState` / `LocalRunState` conforms to the
canonical semantics, without touching existing requirements or
scenarios.

**Alternatives considered:**
- (a) `MODIFIED Requirement` that rewrites the existing "Run-state
  types are partitioned into core and local-adapter partitions"
  requirement to cite the canonical spec.
- (b) Do not modify `workflow-run-state` at all; keep the new spec
  standalone.

**Rationale:** (a) rewrites a requirement whose concrete scenarios are
already validated and archived, risking spurious diffs in scenario
text. (b) leaves the two specs mutually silent, making it possible for
a future drift between the type partition and the canonical semantics
to go unnoticed. An additive normative reference is the minimal
coupling that makes the conformance relationship discoverable from
either direction.

### D5. Discovered discrepancies are recorded, not silently reconciled

**Choice:** If writing the canonical spec surfaces a mismatch between
the nine canonical roles and current `CoreRunState` / `LocalRunState`
fields, the spec records the discrepancy and defers reconciliation to
a separate change.

**Alternatives considered:**
- (a) Block this change until the type partition is fixed in the same
  commit.
- (b) Silently reclassify fields to match.

**Rationale:** (a) inflates scope (the issue explicitly excludes field
moves); (b) hides state from reviewers. A "surface, don't fix"
discipline matches the issue's Non-Goals.

### D6. No interchange format, no stability policy in this change

**Choice:** Both are listed as Non-Goals in the spec and deferred to
separate future capabilities.

**Rationale:** An interchange format presumes a canonical meaning to
serialize; a stability policy presumes a surface to version. Writing
meaning first is the correct dependency order. Attempting both now
dilutes the scope and forces premature commitments.

## Risks / Trade-offs

- **Risk: The nine roles are over- or under-specified.** → Mitigation:
  each role's definition cites the information it must carry and the
  invariants it enforces, without prescribing fields or encoding. If a
  tenth role is later needed, adding it is an additive spec change; if
  a role turns out to be redundant, merging is also additive.
- **Risk: Future readers conflate the canonical spec with the type
  partition.** → Mitigation: D4's normative-reference requirement
  explicitly states the direction — canonical spec is source of truth;
  types are a conforming representation.
- **Risk: The exclusion rule is ambiguous for borderline fields
  (e.g. a field that is "mostly" canonical).** → Mitigation: borderline
  cases become Open Questions and are resolved per-field rather than
  by blanket rule. D5 makes the discrepancy-handling path explicit.
- **Risk: Drift between types and canonical spec goes undetected.** →
  Mitigation: the workflow-run-state delta's conformance scenario is
  testable by inspection; a future compile-time or lint-time check
  could mechanize it, but is out of scope here.
- **Trade-off: Spec-only change delivers no runtime behavior.** The
  value is foundational — it unblocks subsequent capabilities (server
  runtime, interchange format, versioning policy) by fixing a shared
  vocabulary. This is accepted explicitly by the issue.

## Migration Plan

No runtime migration. The change is spec-only; no code ships with it.

Rollback: revert the change's commits. No data migration, no config
change, no release artifact. Downstream consumers of the existing
`CoreRunState` / `LocalRunState` types are not affected.

## Open Questions

None requiring resolution before spec acceptance. Follow-up work that
this change enables — but that this change does not decide:

- Should the canonical semantics be expressed machine-readably
  (JSON Schema, TypeSpec) alongside the prose spec?
- Should a compile-time assertion be added that
  `keyof CoreRunState` exactly covers the nine canonical roles?
- Should the canonical spec gain a stability-policy addendum as the
  first alternate runtime (server / DB-backed) is designed?

Each is a candidate for its own change; none blocks this one.

---

## Concerns

Concern → problem resolved:

- **C-1: Canonical semantics is undefined.** Today the repository has a
  type partition (`CoreRunState` / `LocalRunState`) without a spec that
  says *why* the partition is drawn where it is. This change resolves
  that by producing the definitional spec.
- **C-2: External runtime authors have no contract to target.** Without
  a canonical surface spec, a hypothetical server-backed runtime cannot
  know which fields are required semantics vs. which are local-only
  metadata. This change resolves that by listing the nine canonical
  roles.
- **C-3: Local-adapter fields are implicitly privileged.** Current
  `LocalRunState` reads as "the rest of run.json" rather than "the
  adapter-private extension of the canonical surface". This change
  resolves that by defining adapter execution state via exclusion from
  the canonical surface.
- **C-4: Type partition and canonical meaning can drift undetected.**
  This change resolves that by adding a normative conformance reference
  from `workflow-run-state` back to the new canonical spec.

## State / Lifecycle

- **Canonical state** (per the new spec): the nine roles
  (run identity, change identity, current phase, lifecycle status,
  allowed events, actor identity, source metadata, history,
  previous run linkage). Runtime-agnostic; persisted by any conforming
  runtime.
- **Adapter execution state** (per the new spec, exclusion-defined):
  everything else that a given adapter chooses to persist alongside
  canonical state. Informative current examples (local adapter):
  `project_id`, `repo_name`, `repo_path`, `branch_name`,
  `worktree_path`, `last_summary_path`.
- **Derived state**: `allowed_events` is computed from
  `current_phase` × `status` × workflow machine. This change does not
  redefine the derivation rule; it only classifies `allowed_events` as
  part of the canonical surface.
- **Lifecycle boundaries**: canonical state crosses runtime boundaries
  unchanged; adapter execution state is reconstructed per-adapter on
  ingest and is not transported between runtimes.
- **Persistence-sensitive state**: `history` is append-only; this
  invariant is already enforced by `workflow-run-state` and is
  reaffirmed — not re-specified — by citing `history` as a canonical
  role.

## Contracts / Interfaces

- **Spec → spec contract:** `workflow-run-state` declares conformance
  to `canonical-workflow-state`. Interface: the nine semantic roles.
- **Spec → type contract (existing, unchanged):** `CoreRunState` /
  `LocalRunState` / `RunState` in `src/types/contracts.ts`. No surface
  change.
- **Spec → CLI contract (existing, unchanged):** `specflow-run`,
  `specflow-prepare-change` observable behavior is untouched.
- **No new layer interfaces** are introduced (no UI, API, persistence,
  renderer, or external-service interfaces added).

## Persistence / Ownership

- **Canonical state ownership:** logically owned by the workflow core;
  every conforming runtime must be able to produce it. No physical
  owner changes in this change.
- **Adapter execution state ownership:** owned by the concrete
  adapter. The local filesystem adapter retains ownership of its
  current private fields; no migration.
- **Artifact ownership:**
  - `openspec/specs/canonical-workflow-state/spec.md` — new, owned by
    this change (and then by the capability post-archive).
  - `openspec/specs/workflow-run-state/spec.md` — an additive
    requirement is appended via delta; existing requirements remain
    under their original ownership.

## Integration Points

- **External systems:** none added.
- **Cross-layer dependency points:** the new spec becomes the upstream
  semantic reference for any future non-local runtime (server, DB,
  review transport). This change creates the reference point but does
  not integrate any new consumer.
- **Regeneration / retry / save / restore boundaries:** unchanged. The
  existing `workflow-run-state` requirements (retry lineage,
  suspend/resume, atomic writes) already cover these boundaries and
  are not edited here.

## Ordering / Dependency Notes

- **Foundational:** the new `canonical-workflow-state` spec — writing
  it unblocks the normative reference in `workflow-run-state`.
- **Dependent:** the `workflow-run-state` delta requirement depends on
  the new spec existing (it cites paths under
  `openspec/specs/canonical-workflow-state/`).
- **Parallelizable:** there is no parallelizable work inside this
  change — the two spec files are written in a fixed order. However,
  this change itself is independent of every other open change and can
  land in any order relative to them.
- **Post-archive:** once archived, the new spec moves from
  `openspec/changes/<id>/specs/canonical-workflow-state/spec.md` to
  `openspec/specs/canonical-workflow-state/spec.md`. The
  `workflow-run-state` additive requirement is merged into the
  baseline spec by OpenSpec's archive flow.

## Completion Conditions

- **`openspec/changes/<id>/specs/canonical-workflow-state/spec.md`**
  exists, `openspec validate` passes, and contains:
  - the runtime-agnostic requirement
  - the nine-roles requirement
  - the exclusion-rule requirement
  - the external-consumer requirement
  - the local-reference-implementation requirement
  - the conformance-authority requirement
  - the non-goals requirement
- **`openspec/changes/<id>/specs/workflow-run-state/spec.md`** exists
  and contains exactly one `ADDED Requirement` declaring conformance,
  with four scenarios (coverage, exclusion, no-field-change,
  discrepancy-surfacing).
- **`design.md`** (this file) exists with the seven planning sections.
- **`tasks.md` / `task-graph.json`** generated by
  `specflow-generate-task-graph` exist and enumerate the spec-writing
  tasks.
- **Review:** design review gate (`/specflow.review_design`) passes
  without outstanding findings.
- Each spec file is independently reviewable: the
  `canonical-workflow-state` spec is reviewable against issue #164's
  acceptance criteria in isolation; the `workflow-run-state` delta is
  reviewable against the existing baseline spec in isolation.
