# spec-consistency-verification Specification

## Purpose
TBD - created by archiving change add-spec-verify-phase-validate-delta-spec-consistency-against-baseline-specs. Update Purpose after archive.
## Requirements
### Requirement: `specflow-spec-verify` enumerates impacted baseline specs deterministically

The system SHALL expose a new CLI helper `specflow-spec-verify <change_id>
--json` that reads
`openspec/changes/<change_id>/proposal.md` and the change's delta spec
files under `openspec/changes/<change_id>/specs/**/spec.md`, enumerates
every capability listed under `Modified Capabilities` in `proposal.md`,
resolves each capability name to `openspec/specs/<name>/spec.md`, loads
only those baseline spec files, and emits a machine-readable JSON report
pairing each delta clause / Scenario with the baseline clauses it touches.

The CLI SHALL NOT inject any full baseline spec into agent context;
consumers (the `/specflow` agent) are expected to read only the paths and
excerpts referenced in the JSON report.

#### Scenario: CLI emits pairing JSON for every Modified Capabilities entry

- **WHEN** `specflow-spec-verify <change_id> --json` is invoked with a
  change whose `proposal.md` lists two modified capabilities
  `cap-a` and `cap-b`
- **AND** both `openspec/specs/cap-a/spec.md` and
  `openspec/specs/cap-b/spec.md` exist and parse successfully
- **THEN** the CLI SHALL exit 0
- **AND** stdout SHALL be a JSON object whose `pairings` array contains
  one entry per `(delta_clause, baseline_clause)` touch point
- **AND** each entry SHALL include `capability`, `delta_path`,
  `delta_anchor`, `baseline_path`, and `baseline_anchor`
- **AND** no full baseline spec file contents SHALL appear in the JSON
  (only excerpts bounded by anchor + ±3 surrounding lines)

#### Scenario: CLI skips extraction when Modified Capabilities is empty

- **WHEN** `specflow-spec-verify <change_id> --json` is invoked with a
  change whose `proposal.md` lists no `Modified Capabilities` entries
- **THEN** the CLI SHALL exit 0
- **AND** stdout SHALL be a JSON object whose `pairings` array is empty
- **AND** the JSON SHALL include `reason: "no_modified_capabilities"`

### Requirement: `specflow-spec-verify` blocks on missing or unparseable baselines

The CLI SHALL block with a structured error when a capability listed in
`Modified Capabilities` cannot be resolved to a loadable baseline spec.

#### Scenario: Missing baseline is surfaced as missing_baseline

- **WHEN** `specflow-spec-verify <change_id> --json` is invoked
- **AND** `Modified Capabilities` lists `cap-missing` but
  `openspec/specs/cap-missing/spec.md` does not exist
- **THEN** the CLI SHALL exit non-zero
- **AND** stdout SHALL be a JSON object with `error.code` equal to
  `missing_baseline`
- **AND** the JSON SHALL include the offending capability name under
  `error.capability`

#### Scenario: Unparseable baseline is surfaced as unparseable_baseline

- **WHEN** `specflow-spec-verify <change_id> --json` is invoked
- **AND** `openspec/specs/cap-broken/spec.md` exists but cannot be
  parsed into a requirements + scenarios tree
- **THEN** the CLI SHALL exit non-zero
- **AND** stdout SHALL be a JSON object with `error.code` equal to
  `unparseable_baseline`
- **AND** the JSON SHALL include `error.capability` and
  `error.parse_reason`

### Requirement: `specflow-spec-verify` detects REMOVED-clause ripple candidates

The CLI SHALL, whenever a delta spec contains a `## REMOVED Requirements` section, scan all baseline spec files under `openspec/specs/**/spec.md` (not only the ones named in `Modified Capabilities`) for textual references to the removed requirement name(s), and SHALL include every match as a ripple candidate in the JSON output.

The scan SHALL use a deterministic grep-style match against the removed
requirement header text. Full baseline file contents SHALL NOT be embedded
in the output — only the matched file path, line number, and ±3
surrounding lines.

#### Scenario: Removed requirement references are enumerated

- **WHEN** a delta spec under
  `openspec/changes/<change_id>/specs/<cap>/spec.md` contains a
  `## REMOVED Requirements` entry with header
  `### Requirement: Legacy export`
- **AND** another baseline spec references the text
  `Legacy export` inside `openspec/specs/<other>/spec.md`
- **THEN** the JSON emitted by `specflow-spec-verify` SHALL include a
  `ripple_candidates` array
- **AND** that array SHALL include one entry per match with
  `baseline_path`, `line`, and `excerpt`

#### Scenario: No REMOVED requirements means empty ripple

- **WHEN** a change has no `## REMOVED Requirements` section in any
  delta spec
- **THEN** the JSON SHALL include a `ripple_candidates` array equal to
  `[]`

### Requirement: Conflict judgement is advisory; the user is authoritative

The `/specflow` agent SHALL treat the output of `specflow-spec-verify`
and its own semantic judgement as **advisory**. Every conflict the agent
surfaces SHALL be presented to the user via `AskUserQuestion`, with the
user's choice (fix delta / fix baseline / fix both / accept-as-is)
forming the authoritative outcome. The phase SHALL NOT advance to
`spec_ready` without user confirmation whenever the agent has reported at
least one candidate conflict.

#### Scenario: User confirmation is required for any candidate conflict

- **WHEN** the agent reports one or more candidate conflicts for a
  change in `spec_verify`
- **THEN** the `/specflow` guide SHALL present each conflict to the user
  via `AskUserQuestion`
- **AND** the run SHALL NOT receive a `spec_verified` event until the
  user has selected an outcome for every reported conflict

#### Scenario: No-conflict runs still require no user prompt

- **WHEN** the agent reports zero candidate conflicts for a change in
  `spec_verify`
- **THEN** the `/specflow` guide SHALL advance the run with
  `spec_verified` without prompting the user

### Requirement: Conflict boundary excludes compatible strengthening

The semantic judgement SHALL flag a pairing as a conflict only when the
delta's ADDED / MODIFIED / REMOVED clause is genuinely **incompatible**
with the baseline. Strengthening or tightening that remains consistent
with the baseline (e.g. baseline `SHALL respond within 24 hours` vs.
delta `SHALL respond within 30 minutes`) SHALL NOT be flagged as a
conflict. Evaluation SHALL operate at the SHALL / MUST clause level and
at the Scenario behaviour level (WHEN / THEN); free prose inside
`Purpose` or introductory sections SHALL NOT produce conflicts.

#### Scenario: Tightening a numeric bound is not a conflict

- **WHEN** the baseline clause says `SHALL respond within 24 hours`
- **AND** the delta clause says `SHALL respond within 30 minutes`
- **THEN** the agent SHALL NOT flag the pairing as a conflict

#### Scenario: Contradictory normative verbs are a conflict

- **WHEN** the baseline clause says `SHALL be processed asynchronously`
- **AND** the delta clause says `SHALL be processed synchronously`
- **THEN** the agent SHALL flag the pairing as a conflict

### Requirement: Accepted conflicts are recorded in design.md under a fixed schema

The `/specflow` guide SHALL, when the user chooses `accept-as-is` for one or more conflicts, append (creating the file if needed) a section titled `## Accepted Spec Conflicts` to `openspec/changes/<change_id>/design.md`. The section SHALL contain a
markdown table with the exact header schema:

```
| id | capability | delta_clause | baseline_clause | rationale | accepted_at |
```

- `id` SHALL be a stable identifier within the change (e.g. `AC1`,
  `AC2`), monotonically increasing across accept events.
- `accepted_at` SHALL be an ISO-8601 UTC timestamp (e.g.
  `2026-04-17T12:34:56Z`).
- `rationale` SHALL be the free-text reason supplied by the user.
- `delta_clause` and `baseline_clause` SHALL be short anchor references
  (relative path + header) — full clause text SHALL NOT be inlined.

#### Scenario: Accept-as-is writes a row to the section

- **WHEN** the user selects `accept-as-is` for a single conflict during
  `spec_verify`
- **THEN** `openspec/changes/<change_id>/design.md` SHALL contain a
  `## Accepted Spec Conflicts` section
- **AND** that section SHALL include exactly one table row with the six
  columns `id`, `capability`, `delta_clause`, `baseline_clause`,
  `rationale`, and `accepted_at`

#### Scenario: Subsequent accepts append rows without duplicating headers

- **WHEN** the section already exists with one row
- **AND** the user accepts a second conflict on a later verify run
- **THEN** the section header line SHALL remain exactly once
- **AND** a second row SHALL be appended below the existing row
- **AND** the new row's `id` SHALL be strictly greater than every
  existing row's `id`

