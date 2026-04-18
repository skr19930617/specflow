## 1. Write canonical-workflow-state capability spec ✓

> Publish the canonical-workflow-state spec defining the nine semantic roles, the exclusion rule for adapter state, and the conformance-authority contract.

- [x] 1.1 Draft the runtime-agnostic requirement: canonical workflow state is defined independently of any persistence format or execution environment
- [x] 1.2 Draft the nine-roles requirement enumerating each semantic role (run identity, change identity, current phase, lifecycle status, allowed events, actor identity, source metadata, history, previous run linkage) with purpose and invariants
- [x] 1.3 Draft the exclusion-rule requirement: a field is adapter execution state iff it does not map to any canonical role
- [x] 1.4 Draft the external-consumer requirement: any conforming runtime must produce all nine canonical roles
- [x] 1.5 Draft the local-reference-implementation requirement: CoreRunState is one conforming representation, with informative examples of LocalRunState as adapter-private fields
- [x] 1.6 Draft the conformance-authority requirement: this spec is the upstream source of truth; type partitions are conforming representations
- [x] 1.7 Draft the non-goals requirement: no interchange format, no stability policy, no field-level prescription
- [x] 1.8 Run openspec validate on the new spec file and fix any structural issues

## 2. Add conformance reference to workflow-run-state ✓

> Append one ADDED Requirement to the workflow-run-state delta declaring that the CoreRunState/LocalRunState partition conforms to canonical-workflow-state semantics.

> Depends on: canonical-workflow-state-spec

- [x] 2.1 Draft the ADDED Requirement declaring CoreRunState/LocalRunState conformance to canonical-workflow-state
- [x] 2.2 Write scenario: coverage — every canonical role maps to at least one CoreRunState field
- [x] 2.3 Write scenario: exclusion — every LocalRunState field is absent from the canonical roles
- [x] 2.4 Write scenario: no-field-change — no fields are added, removed, or renamed by this requirement
- [x] 2.5 Write scenario: discrepancy-surfacing — if a mismatch is found it is recorded, not silently reconciled
- [x] 2.6 Run openspec validate on the updated delta spec and fix any structural issues
