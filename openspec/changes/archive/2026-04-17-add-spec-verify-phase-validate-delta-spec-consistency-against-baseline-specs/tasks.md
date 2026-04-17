## 1. Workflow Machine State + Phase Contract Registration ✓

> Add spec_verify state/events/transitions to the workflow machine (v6.0→6.1) and register the spec_verify phase contract entry so downstream template rendering can resolve the new step.

- [x] 1.1 Add spec_verify state with spec_verified→spec_ready and revise_spec→spec_draft transitions in workflow-machine.ts
- [x] 1.2 Retarget spec_validate's spec_validated edge from spec_ready to spec_verify
- [x] 1.3 Bump workflowVersion from 6.0 to 6.1
- [x] 1.4 Add spec_verified to workflowEventOrder between spec_validated and accept_spec
- [x] 1.5 Add spec_verify entry to phase-contract.ts with requiredInputs, cliCommands, and producedOutputs per D9
- [x] 1.6 Verify deriveTransitions and deriveAllowedEvents still validate with the new state
- [x] 1.7 Write transition unit tests: spec_validated→spec_verify, spec_verified→spec_ready, revise_spec→spec_draft
- [x] 1.8 Write phase-contract registry test confirming spec_verify entry and type check

## 2. Deterministic CLI: specflow-spec-verify ✓

> Build the specflow-spec-verify CLI that resolves impacted baselines, parses delta clauses, greps for REMOVED ripple candidates, and emits structured JSON (schema v1).

- [x] 2.1 Create src/lib/spec-verify.ts with proposal parser to extract Modified Capabilities list
- [x] 2.2 Implement baseline path resolution: capability name → openspec/specs/<name>/spec.md
- [x] 2.3 Implement missing-baseline and unparseable-baseline detection with structured error codes
- [x] 2.4 Implement delta clause parser (SHALL/MUST lines + Scenario WHEN/THEN anchors)
- [x] 2.5 Implement baseline clause parser with requirement-name normalisation
- [x] 2.6 Implement pairing enumeration: delta clause × baseline clause alignment
- [x] 2.7 Implement REMOVED-clause grep across all baseline specs bounded to ±3 context lines
- [x] 2.8 Implement JSON report assembly with schema_version:1 and all documented fields
- [x] 2.9 Create src/bin/specflow-spec-verify.ts thin runner with <CHANGE_ID> --json interface and exit codes
- [x] 2.10 Write unit tests: empty-capabilities case returns reason:no_modified_capabilities
- [x] 2.11 Write unit tests: single-capability happy path produces correct pairings
- [x] 2.12 Write unit tests: REMOVED-ripple case produces ripple_candidates
- [x] 2.13 Write unit tests: missing-baseline error exits non-zero
- [x] 2.14 Write unit tests: unparseable-baseline error exits non-zero with parse_reason

## 3. design.md Accepted-Conflict Writer Helper ✓

> Create a helper that appends or creates the Accepted Spec Conflicts table in design.md with the six-column schema (id, capability, delta_clause, baseline_clause, rationale, accepted_at).

- [x] 3.1 Add appendAcceptedConflict function to src/lib/spec-verify.ts that creates design.md if missing and appends a table row
- [x] 3.2 Implement monotonic AC-id generation (AC1, AC2, …) within a change
- [x] 3.3 Ensure the writer only touches the ## Accepted Spec Conflicts section and never other sections
- [x] 3.4 Write unit tests: create design.md from scratch with one accepted conflict row
- [x] 3.5 Write unit tests: append to existing design.md preserving other sections

## 4. Command Body Template Update for spec_verify Step ✓

> Extend specflow.md.tmpl with a new Step that drives the hybrid CLI+agent verify flow, surfaces conflicts via AskUserQuestion, writes accepted conflicts to design.md, and advances the run.

> Depends on: workflow-machine-and-phase-contract, spec-verify-cli, accepted-conflict-writer

- [x] 4.1 Insert new Step (between existing Step 8 Spec Validate and Step 9 Design Handoff) in specflow.md.tmpl
- [x] 4.2 Add prose for CLI invocation: specflow-spec-verify <CHANGE_ID> --json
- [x] 4.3 Add prose for blocking on missing_baseline / unparseable_baseline errors with revise_spec advance
- [x] 4.4 Add prose for AskUserQuestion per conflict with four outcomes: fix delta, fix baseline, fix both, accept-as-is
- [x] 4.5 Add prose for writing accepted conflicts to design.md via the writer helper
- [x] 4.6 Add prose for advancing run with spec_verified (all resolved) or revise_spec (any fix chosen)
- [x] 4.7 Renumber all trailing steps after the insertion
- [x] 4.8 Regenerate global/commands/specflow.md from the updated template
- [x] 4.9 Write golden-file test verifying generated specflow.md includes the verify step with literal CLI invocations

## 5. End-to-End Integration Tests ✓

> Exercise the full spec_validate→spec_validated→spec_verify→spec_verified→spec_ready path and the revise_spec back-edge, confirming all components work together.

> Depends on: command-body-template

- [x] 5.1 Create fixture change with delta specs that produce pairings and ripple candidates
- [x] 5.2 Write integration test: validate_spec→spec_validated→spec_verify→spec_verified→spec_ready happy path
- [x] 5.3 Write integration test: spec_verify→revise_spec→spec_draft back-edge path
- [x] 5.4 Write integration test: accept-as-is produces design.md with correct six-column table and row count
- [x] 5.5 Verify openspec validate still reports the change as valid:true
- [x] 5.6 Verify full test suite is green with all new tests in place
