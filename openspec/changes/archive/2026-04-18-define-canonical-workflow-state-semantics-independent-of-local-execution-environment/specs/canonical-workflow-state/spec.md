## ADDED Requirements

### Requirement: Canonical workflow state is runtime-agnostic

The system SHALL define "canonical workflow state" as the authoritative state of a
workflow instance that is independent of any specific execution environment. The
canonical state SHALL NOT depend on local filesystem paths, git worktree paths,
cached local artifacts, or any execution metadata specific to a particular adapter
or runtime. A workflow instance in canonical state SHALL be fully describable by
the canonical surface alone, such that two different runtimes (local filesystem,
server-backed DB, in-memory test harness) holding the same canonical values SHALL
be understood as representing the same workflow instance at the same logical
position.

#### Scenario: Canonical state excludes local filesystem information

- **WHEN** the canonical workflow state of a run is inspected
- **THEN** it SHALL NOT contain any field whose meaning depends on the presence
  of a local filesystem (e.g., local absolute paths, worktree locations,
  cached file references)

#### Scenario: Canonical state excludes git execution information

- **WHEN** the canonical workflow state of a run is inspected
- **THEN** it SHALL NOT contain any field whose meaning depends on a specific
  git worktree, working directory, or local git configuration

#### Scenario: Equivalent canonical state implies equivalent workflow instance

- **WHEN** two runtimes hold run-state values with identical canonical fields
- **AND** their canonical fields carry identical semantic values
- **THEN** both runtimes SHALL be understood as representing the same workflow
  instance at the same logical phase, regardless of adapter-private differences

### Requirement: Canonical surface comprises nine semantic roles

The canonical workflow state surface SHALL consist of exactly the following nine
semantic roles. Each role SHALL be defined by its purpose and the kind of
information it conveys about a workflow instance, independent of any particular
field encoding.

1. **Run identity** — a stable identifier that uniquely distinguishes this
   workflow run across retries and across adapter boundaries.
2. **Change identity** — a reference to the logical change that the run is
   progressing (nullable for synthetic runs that are not bound to a change).
3. **Current phase** — the workflow machine state the run is currently in.
4. **Lifecycle status** — whether the run is active, suspended, or terminal.
5. **Allowed events** — the set of events that can legally be applied at the
   current phase + status combination.
6. **Actor identity** — the provenance of the acting party (main agent, review
   agent, automation, or human) authorized to drive the run.
7. **Source metadata** — the description of where the run's specification
   originated (e.g., issue URL, inline text), such that the run can be retraced
   to its origin without consulting the local execution environment.
8. **History** — the immutable append-only record of phase transitions, events,
   and per-entry actor provenance applied to the run.
9. **Previous run linkage** — the reference to a prior terminal run for the
   same change, establishing retry lineage.

Any role outside this list SHALL NOT be considered canonical. Any runtime
persisting canonical workflow state SHALL be able to express all nine roles.

#### Scenario: All nine roles are present in any canonical view

- **WHEN** a runtime exposes the canonical state of a run
- **THEN** it SHALL provide an expression for every one of the nine roles:
  run identity, change identity, current phase, lifecycle status, allowed
  events, actor identity, source metadata, history, previous run linkage
- **AND** roles whose value is logically absent (e.g., no previous run)
  SHALL be represented as a well-defined "absent" value rather than omitted
  from the canonical surface

#### Scenario: Roles outside the nine are not canonical

- **WHEN** a state field cannot be mapped to any of the nine canonical roles
- **THEN** the field SHALL be classified as adapter execution state, not
  canonical workflow state

### Requirement: Adapter execution state is defined by exclusion

The system SHALL define "adapter execution state" as any state held by a
specific adapter or runtime that is NOT part of the canonical surface. Adapter
execution state SHALL be treated as adapter-private and SHALL NOT be relied upon
by any consumer that targets the canonical surface. The membership of adapter
execution state SHALL be derived by exclusion from the canonical surface —
there is no normative exhaustive enumeration of adapter-private fields.

#### Scenario: Exclusion rule classifies adapter-private state

- **WHEN** a field exists in a concrete run-state representation
- **AND** the field does not correspond to any of the nine canonical roles
- **THEN** the field SHALL be classified as adapter execution state
- **AND** it SHALL NOT be required of alternate runtimes

#### Scenario: Informative examples do not constrain adapters

- **WHEN** the specification lists informative examples of adapter execution
  state (e.g., local filesystem path, git worktree path, cached summary path)
- **THEN** the list SHALL be treated as informative only
- **AND** it SHALL NOT be interpreted as an exhaustive or required set

### Requirement: External runtimes depend only on the canonical surface

Consumers targeting semantic portability SHALL depend only on the canonical
surface and SHALL NOT require any field classified as adapter execution state.
This applies to server-side runtimes, alternate UIs, and non-local adapters. A
consumer that reads canonical fields SHALL be able to operate against any
conforming runtime without adapter-specific knowledge.

#### Scenario: Server or UI sees canonical fields only

- **WHEN** a server-side runtime or an alternate UI reads run state through a
  conforming transport
- **THEN** it SHALL observe expressions of the nine canonical roles
- **AND** it SHALL NOT require any adapter-private field to fulfill its
  responsibilities

#### Scenario: Absence of adapter-private state does not break canonical consumers

- **WHEN** a conforming runtime omits all adapter-private state
- **THEN** a canonical-surface consumer SHALL still operate correctly

### Requirement: Local reference implementation may carry adapter-private state

The local filesystem / git-backed reference implementation SHALL be permitted to
carry adapter-private execution state alongside the canonical surface, provided
that the adapter-private state does not alter the semantic value of any
canonical role. The local reference implementation SHALL expose the canonical
surface faithfully so that non-local consumers may read it without reference to
adapter-private fields.

#### Scenario: Local adapter persists both surfaces

- **WHEN** the local reference implementation persists a run
- **THEN** it MAY include adapter-private fields (e.g., project identity,
  repository path, branch name, worktree path, cached summary path)
- **AND** these fields SHALL NOT modify or contradict the canonical roles

#### Scenario: Canonical extraction from the local shape is well-defined

- **WHEN** a non-local consumer reads a run persisted by the local adapter
- **THEN** it SHALL be able to extract the canonical surface unambiguously by
  ignoring adapter-private fields
- **AND** the extracted canonical surface SHALL convey all nine roles

### Requirement: Canonical semantics is the contract authority for type-level partitions

Any type-level partition of run state SHALL conform to the canonical semantics
defined by this specification, including the existing `CoreRunState` /
`LocalRunState` partition in `src/types/contracts.ts`. Where a partition exists,
its canonical partition SHALL cover all nine canonical roles, and its adapter
partition SHALL hold only state classifiable as adapter execution state. The
type-level partition SHALL NOT be treated as the source of truth for canonical
meaning; this specification SHALL be the source of truth, and the type-level
partition SHALL be a representation conforming to it.

#### Scenario: Existing partition conforms to canonical semantics

- **WHEN** the `CoreRunState` / `LocalRunState` partition is evaluated against
  the canonical semantics
- **THEN** the canonical partition SHALL cover expressions of all nine
  canonical roles
- **AND** the adapter partition SHALL contain only adapter execution state

#### Scenario: Discovered discrepancy triggers a follow-up change

- **WHEN** a discrepancy is observed between the canonical semantics and an
  existing type-level partition (a canonical role missing from the canonical
  partition, or adapter-private state appearing in the canonical partition)
- **THEN** the discrepancy SHALL be recorded
- **AND** reconciliation SHALL be handled by a separate change, not by silently
  altering either surface

### Requirement: Non-goals of the canonical semantics specification

The canonical workflow state specification SHALL NOT prescribe the following
concerns, which are out of scope and left to subsequent capabilities:

- database schema design for canonical state
- interchange / serialization format (e.g., JSON schema, protobuf) for
  canonical state
- server, review transport, or event streaming implementations
- stability guarantees, versioning policy, or breaking-change policy for the
  canonical surface
- field-level type definitions of `CoreRunState` / `LocalRunState`

#### Scenario: Interchange format is out of scope

- **WHEN** the canonical semantics specification is evaluated for applicability
  to an interchange format question (e.g., "what JSON field name SHALL
  represent current_phase?")
- **THEN** the specification SHALL NOT answer the question
- **AND** the question SHALL be deferred to a separate interchange-format
  capability

#### Scenario: Stability policy is out of scope

- **WHEN** the canonical semantics specification is evaluated for applicability
  to a stability or versioning question (e.g., "how SHALL a breaking change to
  a canonical role be versioned?")
- **THEN** the specification SHALL NOT answer the question
- **AND** the question SHALL be deferred to a separate versioning-policy
  capability
