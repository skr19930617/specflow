# utility-cli-suite Specification

## Purpose

Describe the supporting CLI tools that provide project analysis, GitHub issue
lookup, local proposal entry orchestration, diff filtering, OpenSpec artifact
discovery, and sub-issue creation.

## Requirements

### Requirement: `specflow-analyze` reports structured project metadata

`specflow-analyze` SHALL inspect a target path and SHALL emit structured project
metadata derived from the repository and common build files.

#### Scenario: Analyze reports basic project identity

- **WHEN** `specflow-analyze <path>` succeeds
- **THEN** the result SHALL include `project_name`, detected languages, and the
  detected package manager

#### Scenario: Analyze includes OpenSpec and repository context

- **WHEN** the target contains `openspec/config.yaml` or git metadata
- **THEN** the result SHALL include available OpenSpec specs and changes, plus
  repository metadata such as origin-derived owner and repo when available

### Requirement: `specflow-fetch-issue` validates issue URLs and returns schema-valid metadata

`specflow-fetch-issue` SHALL accept exactly one GitHub issue URL, resolve the
issue through `gh`, and return the validated issue payload.

#### Scenario: Missing issue URL prints usage

- **WHEN** `specflow-fetch-issue` is invoked without an argument
- **THEN** it SHALL print `Usage: specflow-fetch-issue <issue-url>` and exit
  non-zero

#### Scenario: Non-matching URLs are rejected

- **WHEN** the argument does not match `https://<host>/<owner>/<repo>/issues/<number>`
- **THEN** the CLI SHALL print `Invalid GitHub issue URL: <url>` and exit
  non-zero

#### Scenario: Non-GitHub.com hosts set `GH_HOST`

- **WHEN** the URL host is not `github.com`
- **THEN** the CLI SHALL set `GH_HOST` before calling `gh issue view`

### Requirement: `specflow-prepare-change` creates local proposal artifacts from normalized source input

`specflow-prepare-change` SHALL accept a normalized source JSON file, create or
reuse the target OpenSpec change, materialize `proposal.md`, and enter
`proposal_draft`.

#### Scenario: Existing scaffold-only changes receive a seeded proposal draft

- **WHEN** `openspec/changes/<CHANGE_ID>/` exists with `.openspec.yaml` but no
  `proposal.md`
- **AND** `specflow-prepare-change <CHANGE_ID> --source-file <path>` succeeds
- **THEN** it SHALL write `openspec/changes/<CHANGE_ID>/proposal.md`
- **AND** it SHALL return a run state in `proposal_draft`

#### Scenario: Missing change ids are derived from normalized source metadata

- **WHEN** `specflow-prepare-change --source-file <path>` is invoked without a
  positional change id
- **THEN** the CLI SHALL derive `CHANGE_ID` from the normalized source
- **AND** it SHALL call `openspec new change <CHANGE_ID>` when the change does
  not yet exist

#### Scenario: Run creation preserves reduced source metadata

- **WHEN** `specflow-prepare-change` starts a new run
- **THEN** it SHALL call `specflow-run start <CHANGE_ID> --source-file <path>`
- **AND** the resulting run state SHALL persist `source`

### Requirement: `specflow-filter-diff` emits filtered review diffs and a summary contract

`specflow-filter-diff` SHALL write the filtered diff to stdout and a JSON
summary to stderr.

#### Scenario: Deleted and rename-only changes are excluded

- **WHEN** `git diff --name-status -M100` reports a deleted file or an `R100`
  rename-only file
- **THEN** the path SHALL be excluded from the emitted diff
- **AND** the summary SHALL record the exclusion reason

#### Scenario: Built-in and environment patterns are excluded

- **WHEN** a changed file matches a built-in review-artifact pattern or a
  `DIFF_EXCLUDE_PATTERNS` glob
- **THEN** the file SHALL be excluded from the diff

#### Scenario: Empty diffs still emit a summary

- **WHEN** no files remain after filtering
- **THEN** stdout SHALL be empty
- **AND** stderr SHALL still emit a summary with zero counts

### Requirement: `specflow-design-artifacts` wraps OpenSpec status and validation

`specflow-design-artifacts` SHALL expose the `next` and `validate` helper
subcommands around OpenSpec artifact resolution.

#### Scenario: `next` returns the first ready artifact

- **WHEN** `openspec status --change <CHANGE_ID> --json` reports a ready artifact
- **THEN** `specflow-design-artifacts next <CHANGE_ID>` SHALL return `status:
  "ready"` together with the artifact id, output path, template, instruction,
  and dependencies

#### Scenario: `next` reports blocked or complete states

- **WHEN** no artifact is ready
- **THEN** the wrapper SHALL return either `status: "blocked"` with blocked ids
  or `status: "complete"` when OpenSpec reports completion

#### Scenario: `validate` normalizes OpenSpec validation output

- **WHEN** `openspec validate <CHANGE_ID> --type change --json` succeeds
- **THEN** the wrapper SHALL return `status: "valid"` when the first item is
  valid
- **AND** it SHALL return `status: "invalid"` with the parsed payload otherwise

### Requirement: `specflow-create-sub-issues` creates decomposition issues from validated stdin JSON

`specflow-create-sub-issues` SHALL read a JSON payload from stdin, validate it
against the create-sub-issues input schema, and create or reuse GitHub issues.

#### Scenario: Invalid stdin is rejected

- **WHEN** stdin is empty, malformed JSON, or fails schema validation
- **THEN** the CLI SHALL exit non-zero and print a JSON error to stderr

#### Scenario: Phase labels are ensured before issue creation

- **WHEN** valid input is processed
- **THEN** the CLI SHALL ensure `phase-<N>` labels exist for the requested
  phases before creating issues

#### Scenario: Existing decomposition ids are reused

- **WHEN** an issue already exists for the derived decomposition id
- **THEN** the CLI SHALL reuse that issue instead of creating a duplicate

#### Scenario: Summary comments remain optional

- **WHEN** `skip_comment` is true
- **THEN** the CLI SHALL skip posting the parent-issue summary comment
- **AND** it SHALL report `summary_comment_posted: false`

#### Scenario: Partial failures return exit code 2

- **WHEN** some sub-issues are created and some fail
- **THEN** the CLI SHALL exit with code `2`
- **AND** stdout SHALL still report the `created` and `failed` arrays
