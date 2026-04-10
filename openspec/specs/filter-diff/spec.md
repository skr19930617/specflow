# filter-diff Specification

## Purpose

Produce a review-safe git diff stream and a machine-readable exclusion summary.

## Requirements

### Requirement: CLI entrypoint and output channels

The system SHALL provide `bin/specflow-filter-diff` as a Node-based CLI that writes filtered diff text to stdout and a JSON summary to stderr.

#### Scenario: Help output

- **WHEN** `specflow-filter-diff --help` is executed
- **THEN** it SHALL exit with code 0 and print usage information to stdout

#### Scenario: No matching changes

- **WHEN** `git diff --name-status` returns no changed files for the requested pathspecs
- **THEN** the CLI SHALL exit with code 0
- **THEN** stdout SHALL be empty
- **THEN** stderr SHALL contain a JSON summary with `included_count: 0`, `excluded_count: 0`, and `total_lines: 0`

### Requirement: Diff exclusion rules

The CLI SHALL exclude deleted files, rename-only files, and files matching built-in or environment-provided glob patterns.

#### Scenario: Deleted file exclusion

- **WHEN** a file appears in `git diff --name-status` with status `D`
- **THEN** the file SHALL be omitted from stdout diff output
- **THEN** stderr summary `excluded` SHALL include `{ "file": "<path>", "reason": "deleted_file" }`

#### Scenario: Rename-only exclusion

- **WHEN** a file appears with status `R100`
- **THEN** the file SHALL be omitted from stdout diff output
- **THEN** stderr summary `excluded` SHALL include `reason: "rename_only"` and `new_path`

#### Scenario: Built-in specflow exclusions

- **WHEN** a changed path matches review ledger or `current-phase.md` built-in exclusions
- **THEN** the file SHALL be omitted from stdout diff output

#### Scenario: Environment glob exclusions

- **WHEN** `DIFF_EXCLUDE_PATTERNS` contains a glob that matches a changed path
- **THEN** the matching file SHALL be omitted from stdout diff output
- **THEN** stderr summary `excluded` SHALL include `reason: "pattern_match"` and the matched `pattern`

### Requirement: Summary JSON contract

The stderr summary SHALL be valid JSON and include `excluded`, `warnings`, `included_count`, `excluded_count`, and `total_lines`.

#### Scenario: Filtered diff summary

- **WHEN** included files remain after exclusion
- **THEN** stdout SHALL contain the filtered `git diff -- <included files>` output
- **THEN** stderr summary `total_lines` SHALL equal the number of lines written to stdout
