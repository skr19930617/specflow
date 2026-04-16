## MODIFIED Requirements

### Requirement: Generated markdown preserves body sections and hook sections

Generated command markdown SHALL render command body sections in order and SHALL
append a `Run State Hooks` section whenever the contract defines run hooks.
Body sections for phases with `PhaseContract` data SHALL be generated from the
`PhaseContract` registry via `renderPhaseMarkdown`, merged with any remaining
prose templates. Phases without `PhaseContract` data SHALL fall back to the
existing static Markdown template.

#### Scenario: Hooked commands render run-state hook sections

- **WHEN** generated `specflow.md`, `specflow.design.md`, `specflow.apply.md`,
  `specflow.fix_design.md`, or `specflow.fix_apply.md` is read
- **THEN** the file SHALL contain a `## Run State Hooks` section

#### Scenario: Commands without hooks omit the hook section

- **WHEN** generated command markdown is read for a command with no run hooks
- **THEN** the file SHALL render the command body without a `Run State Hooks`
  section

#### Scenario: PhaseContract-backed sections are generated not hand-written

- **WHEN** a command body section corresponds to a phase that has a
  `PhaseContract` entry in the registry
- **THEN** the section's structured content (CLI commands, artifact references,
  gate conditions) SHALL be generated from the `PhaseContract` data
- **AND** the section SHALL NOT contain hand-written duplicates of
  CLI command invocations that are already in `PhaseContract.cliCommands`

#### Scenario: Phases without PhaseContract fall back to static templates

- **WHEN** a command body section corresponds to a phase that does NOT have a
  `PhaseContract` entry in the registry
- **THEN** the section SHALL render using the existing static Markdown template
