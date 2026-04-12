## MODIFIED Requirements

### Requirement: `specflow-prepare-change` creates local proposal artifacts from normalized source input

`specflow-prepare-change` SHALL accept raw input as a positional argument,
auto-detect the input mode, normalize the source internally, create or reuse
the target OpenSpec change, materialize `proposal.md`, and enter
`proposal_draft`.

#### Scenario: Issue URL input triggers internal fetch and normalization

- **WHEN** `specflow-prepare-change <CHANGE_ID> <issue-url>` is invoked
- **AND** `<issue-url>` matches `https://<host>/<owner>/<repo>/issues/<number>`
- **THEN** the CLI SHALL internally invoke `specflow-fetch-issue` to resolve
  the issue
- **AND** it SHALL normalize the fetched issue into the standard source shape
- **AND** it SHALL write `openspec/changes/<CHANGE_ID>/proposal.md`
- **AND** it SHALL return a run state in `proposal_draft`

#### Scenario: Inline text input is normalized directly

- **WHEN** `specflow-prepare-change <CHANGE_ID> <inline-text>` is invoked
- **AND** `<inline-text>` does not match the issue URL pattern
- **THEN** the CLI SHALL normalize the inline text into the standard source
  shape with `kind: "inline"` and `provider: "generic"`
- **AND** it SHALL write `openspec/changes/<CHANGE_ID>/proposal.md`
- **AND** it SHALL return a run state in `proposal_draft`

#### Scenario: Missing change ids are derived from raw input

- **WHEN** `specflow-prepare-change <raw-input>` is invoked with exactly one
  positional argument and no `--source-file` flag
- **THEN** the CLI SHALL derive `CHANGE_ID` from the raw input (issue title
  for URL mode, or sanitized text for inline mode)
- **AND** it SHALL call `openspec new change <CHANGE_ID>` when the change does
  not yet exist

#### Scenario: Existing scaffold-only changes receive a seeded proposal draft

- **WHEN** `openspec/changes/<CHANGE_ID>/` exists with `.openspec.yaml` but no
  `proposal.md`
- **AND** `specflow-prepare-change <CHANGE_ID> <raw-input>` succeeds
- **THEN** it SHALL write `openspec/changes/<CHANGE_ID>/proposal.md`
- **AND** it SHALL return a run state in `proposal_draft`

#### Scenario: Run creation preserves reduced source metadata

- **WHEN** `specflow-prepare-change` starts a new run
- **THEN** it SHALL call `specflow-run start <CHANGE_ID>` with the normalized
  source metadata
- **AND** the resulting run state SHALL persist `source`

#### Scenario: Deprecated --source-file flag emits warning and functions

- **WHEN** `specflow-prepare-change <CHANGE_ID> --source-file <path>` is
  invoked
- **THEN** the CLI SHALL emit a deprecation warning to stderr:
  `"Warning: --source-file is deprecated. Pass raw input as a positional argument instead."`
- **AND** it SHALL read the pre-normalized JSON file and proceed identically
  to the current behavior

#### Scenario: Conflicting inputs are rejected

- **WHEN** both a positional `<raw-input>` argument and `--source-file` flag
  are provided
- **THEN** the CLI SHALL exit non-zero with error:
  `"Conflicting inputs: provide either a raw input argument or --source-file, not both"`

#### Scenario: Missing input is rejected

- **WHEN** no positional arguments and no `--source-file` flag are provided
- **THEN** the CLI SHALL exit non-zero with error:
  `"Missing required input: provide a raw input argument or --source-file"`

#### Scenario: Too many positional arguments are rejected

- **WHEN** more than 2 positional arguments are provided
- **THEN** the CLI SHALL exit non-zero with error:
  `"Too many arguments: expected [CHANGE_ID] <raw-input>"`

#### Scenario: Issue URL fetch failure reports the underlying error

- **WHEN** `specflow-prepare-change` detects an issue URL but
  `specflow-fetch-issue` fails
- **THEN** the CLI SHALL exit non-zero with error:
  `"Issue fetch failed: <specflow-fetch-issue error>. Verify the URL and try again."`
