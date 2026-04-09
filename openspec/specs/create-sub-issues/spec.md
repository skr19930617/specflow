# create-sub-issues Specification

## Purpose
Create GitHub sub-issues from a decomposition payload while preserving idempotent retry semantics.

## Requirements
### Requirement: Node CLI entrypoint
The system SHALL provide `bin/specflow-create-sub-issues` as a Node-based CLI that reads a JSON payload from stdin and writes a JSON result to stdout.

#### Scenario: Help output
- **WHEN** `specflow-create-sub-issues --help` is executed
- **THEN** the CLI SHALL exit with code 0 and print usage information to stdout

#### Scenario: Missing stdin payload
- **WHEN** the CLI is executed with empty stdin
- **THEN** it SHALL exit with code 1 and print a JSON error to stderr

### Requirement: Input contract validation
The stdin payload SHALL match the decomposition contract with `parent_issue_number`, `repo`, `run_timestamp`, and non-empty `sub_features`.

#### Scenario: Invalid JSON
- **WHEN** stdin is not valid JSON
- **THEN** the CLI SHALL exit with code 1 and print `{"error":"Invalid JSON: ..."}` to stderr

#### Scenario: Missing required fields
- **WHEN** the payload omits required fields or provides an empty `sub_features` array
- **THEN** the CLI SHALL exit with code 1 and print a validation error JSON to stderr

### Requirement: Phase label creation
Before creating issues, the CLI SHALL ensure `phase-N` labels exist for every requested sub-feature.

#### Scenario: Phase labels are created or updated
- **WHEN** the payload includes phases 1 through N
- **THEN** the CLI SHALL invoke `gh label create phase-<N> --force` for each phase and continue even if a label already exists

### Requirement: Idempotent duplicate guard
The CLI SHALL search for an existing issue by decomposition id before attempting to create a new issue.

#### Scenario: Existing issue is reused
- **WHEN** `gh issue list --search <decomposition-id>` returns an existing issue
- **THEN** the CLI SHALL add that issue to `created[]` and SHALL NOT call `gh issue create` for that phase

### Requirement: Result contract and exit codes
The stdout result SHALL include `created`, `failed`, `summary_comment_posted`, and `parent_issue_number`.

#### Scenario: All issues created successfully
- **WHEN** every requested sub-feature is created or reused successfully
- **THEN** the CLI SHALL exit with code 0
- **THEN** `failed` SHALL be empty

#### Scenario: Partial failure
- **WHEN** one or more sub-features fail to create
- **THEN** the CLI SHALL exit with code 2
- **THEN** `failed` SHALL describe the failed phases and truncated error messages

### Requirement: Summary comment control
The CLI SHALL post a decomposition summary comment unless `skip_comment` is true.

#### Scenario: Summary comment posted
- **WHEN** at least one issue is created and `skip_comment` is absent or false
- **THEN** the CLI SHALL attempt `gh issue comment <parent_issue_number>`
- **THEN** `summary_comment_posted` SHALL reflect the command result

#### Scenario: Summary comment skipped
- **WHEN** `skip_comment` is true
- **THEN** the CLI SHALL NOT call `gh issue comment`
- **THEN** `summary_comment_posted` SHALL be false
