## MODIFIED Requirements

### Requirement: Generated markdown preserves body sections and hook sections

Generated command markdown SHALL render command body sections from resolved `.md.tmpl` templates and SHALL append a `Run State Hooks` section whenever the contract defines run hooks. Body sections for phases with `PhaseContract` data SHALL be generated from the `PhaseContract` registry via `renderPhaseMarkdown` through `{{render:}}` tags in the template. Phases without `PhaseContract` data SHALL use prose directly authored in the template.

#### Scenario: Hooked commands render run-state hook sections

- **WHEN** generated `specflow.md`, `specflow.design.md`, `specflow.apply.md`, `specflow.fix_design.md`, or `specflow.fix_apply.md` is read
- **THEN** the file SHALL contain a `## Run State Hooks` section

#### Scenario: Commands without hooks omit the hook section

- **WHEN** generated command markdown is read for a command with no run hooks
- **THEN** the file SHALL render the command body without a `Run State Hooks` section

#### Scenario: PhaseContract-backed sections are resolved via render tags

- **WHEN** a command body template contains a `{{render: <phase>}}` tag for a phase that has a `PhaseContract` entry in the registry
- **THEN** the resolved section's structured content (CLI commands, artifact references, gate conditions) SHALL be generated from the `PhaseContract` data via `renderPhaseMarkdown`
- **AND** the resolved section SHALL NOT contain hand-written duplicates of CLI command invocations that are already in `PhaseContract.cliCommands`

#### Scenario: Phases without PhaseContract use prose from template

- **WHEN** a command body template does not contain a `{{render:}}` or `{{contract:}}` tag for a given section
- **THEN** the section SHALL render using the prose directly written in the `.md.tmpl` template

### Requirement: Contract-defined slash-command assets

The system SHALL define slash-command assets from `commandContracts`. Each command SHALL have an id, slash-command name, output path under `global/commands/`, accepted argument placeholder, references, a template path pointing to `assets/commands/<id>.md.tmpl`, and a markdown body assembled from the resolved template merged with TS-side metadata.

#### Scenario: Mainline commands are registered

- **WHEN** the command registry is inspected
- **THEN** it SHALL include `specflow`, `specflow.design`, `specflow.apply`, and `specflow.approve`
- **AND** each of those commands SHALL render to `global/commands/<id>.md`

#### Scenario: Support commands are registered

- **WHEN** the command registry is inspected
- **THEN** it SHALL also include `specflow.reject`, `specflow.review_design`, `specflow.review_apply`, `specflow.fix_design`, `specflow.fix_apply`, `specflow.explore`, `specflow.spec`, `specflow.decompose`, `specflow.dashboard`, `specflow.setup`, `specflow.license`, and `specflow.readme`

#### Scenario: Command contracts declare template paths

- **WHEN** a command contract is inspected
- **THEN** it SHALL include a `templatePath` field pointing to the corresponding `assets/commands/<id>.md.tmpl` file
