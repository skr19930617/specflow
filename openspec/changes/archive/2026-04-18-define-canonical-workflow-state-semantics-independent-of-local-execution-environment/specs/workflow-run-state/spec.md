## ADDED Requirements

### Requirement: Run-state type partition conforms to canonical workflow state semantics

The `CoreRunState` and `LocalRunState` type partitions SHALL conform to the
canonical workflow state semantics defined in
`openspec/specs/canonical-workflow-state/spec.md`. This is a normative
reference: the canonical semantics SHALL be the source of truth for which
fields belong to the canonical surface, and the type-level partition SHALL be
a representation conforming to it. This requirement SHALL NOT add, remove, or
rename any field in `CoreRunState` or `LocalRunState`; the observable type
shape remains governed by the existing requirements in this specification.

#### Scenario: CoreRunState covers the canonical surface

- **WHEN** the `CoreRunState` type is evaluated against the canonical
  workflow state semantics
- **THEN** every field in `CoreRunState` SHALL be classifiable as an
  expression of one of the nine canonical roles defined in the
  `canonical-workflow-state` capability
- **AND** the nine canonical roles SHALL each be expressible via `CoreRunState`
  fields (directly or in combination)

#### Scenario: LocalRunState contains only adapter execution state

- **WHEN** the `LocalRunState` type is evaluated against the canonical
  workflow state semantics
- **THEN** every field in `LocalRunState` SHALL be classifiable as adapter
  execution state per the exclusion rule defined in the
  `canonical-workflow-state` capability
- **AND** no `LocalRunState` field SHALL be required of a non-local runtime

#### Scenario: Field membership is not altered by this reference

- **WHEN** this normative reference is added
- **THEN** no field SHALL be added, removed, or renamed in `CoreRunState` or
  `LocalRunState` as a consequence
- **AND** all existing consumers importing `RunState`, `CoreRunState`, or
  `LocalRunState` SHALL continue to compile without code change

#### Scenario: Discrepancy is surfaced, not silently reconciled

- **WHEN** a field in `CoreRunState` or `LocalRunState` cannot be cleanly
  classified under the canonical semantics (e.g., a canonical role has no
  corresponding field, or a field resists classification)
- **THEN** the discrepancy SHALL be recorded
- **AND** reconciliation SHALL be handled by a separate change, not by
  silently editing the partition in this specification
