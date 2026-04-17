## ADDED Requirements

### Requirement: Template source files define command body prose

The system SHALL store command body prose in Markdown template files at `assets/commands/<command-id>.md.tmpl`. Each template file SHALL contain the prose sections of a single command with explicit insertion tags marking generated content boundaries.

#### Scenario: Every command has a corresponding template file

- **WHEN** the template source directory `assets/commands/` is scanned
- **THEN** every command id registered in `commandContracts` SHALL have a matching `<command-id>.md.tmpl` file

#### Scenario: Template files contain only prose and insertion tags

- **WHEN** a `.md.tmpl` file is read
- **THEN** it SHALL contain Markdown prose and zero or more insertion tags (`{{insert: ...}}`, `{{contract: ...}}`, `{{render: ...}}`)
- **AND** it SHALL NOT contain TypeScript code or string interpolation expressions

### Requirement: Three insertion tag kinds are supported

The template system SHALL support exactly three insertion tag kinds, each with distinct semantics:

- `{{insert: <key>}}` — resolves to a shared prose snippet or common rules fragment (e.g., prerequisites, important rules)
- `{{contract: <phase>}}` — resolves to the raw structured data of a `PhaseContract` entry for the named phase
- `{{render: <phase>}}` — resolves to a Markdown-formatted rendering of a `PhaseContract` entry (tables, summaries) via `renderPhaseMarkdown`

#### Scenario: Insert tag resolves to shared prose

- **WHEN** a template contains `{{insert: openspec_prereq(specflow.apply)}}`
- **THEN** the resolver SHALL replace the tag with the output of the corresponding shared prose generator (e.g., `buildOpenspecPrereq("specflow.apply")`)

#### Scenario: Contract tag resolves to raw PhaseContract data

- **WHEN** a template contains `{{contract: apply_draft}}`
- **THEN** the resolver SHALL replace the tag with the structured data representation of the `apply_draft` PhaseContract entry

#### Scenario: Render tag resolves to formatted Markdown

- **WHEN** a template contains `{{render: apply_draft}}`
- **THEN** the resolver SHALL replace the tag with the Markdown output of `renderPhaseMarkdown` for the `apply_draft` PhaseContract entry

### Requirement: Template resolution occurs at build time only

The template resolver SHALL execute during the build pipeline. The runtime SHALL consume only the resolved output and SHALL NOT read or process `.md.tmpl` files.

#### Scenario: Build resolves all insertion tags

- **WHEN** `src/build.ts` runs successfully
- **THEN** every `.md.tmpl` file in `assets/commands/` SHALL be resolved
- **AND** the resolved output SHALL contain no remaining `{{insert:}}`, `{{contract:}}`, or `{{render:}}` tags

#### Scenario: Runtime does not access template source files

- **WHEN** the installed package is inspected
- **THEN** it SHALL NOT contain any `.md.tmpl` files
- **AND** the runtime code SHALL NOT import or reference the template resolver module

### Requirement: Nesting of insertion tags is prohibited

The template resolver SHALL process insertion tags at depth 1 only. If a resolved snippet itself contains insertion tags, those nested tags SHALL NOT be resolved and SHALL cause a build error.

#### Scenario: Nested insertion tag causes build error

- **WHEN** a shared prose snippet resolved by `{{insert: ...}}` itself contains an `{{insert: ...}}` tag
- **THEN** the build SHALL fail with an error identifying the nested tag and its location

### Requirement: Unresolved insertion tags cause a build hard error

The template resolver SHALL fail the build if any insertion tag references a key, phase, or snippet that does not exist. The error message SHALL identify the template file, the failing tag, and the missing reference.

#### Scenario: Missing insert key fails the build

- **WHEN** a template contains `{{insert: nonexistent_key}}`
- **THEN** the build SHALL fail with an error message containing the template file path and the key `nonexistent_key`

#### Scenario: Missing contract phase fails the build

- **WHEN** a template contains `{{contract: nonexistent_phase}}`
- **AND** `nonexistent_phase` is not registered in the `phaseContractRegistry`
- **THEN** the build SHALL fail with an error message containing the template file path and the phase `nonexistent_phase`

#### Scenario: Missing render phase fails the build

- **WHEN** a template contains `{{render: nonexistent_phase}}`
- **AND** `nonexistent_phase` is not registered in the `phaseContractRegistry`
- **THEN** the build SHALL fail with an error message containing the template file path and the phase `nonexistent_phase`

### Requirement: Template source files are not distributed in the npm package

The `assets/commands/*.md.tmpl` files SHALL be excluded from the published npm package. Only the build-resolved output SHALL be included in the distribution.

#### Scenario: npm pack excludes template source files

- **WHEN** `npm pack --dry-run` is evaluated
- **THEN** the package contents SHALL NOT include any file matching `assets/commands/*.md.tmpl`

### Requirement: Snapshot tests verify migration output equivalence

The test suite SHALL include snapshot tests that compare the build output of the template-based pipeline against the expected command markdown. These tests SHALL detect regressions in the generated command output after migration.

#### Scenario: Snapshot test detects output divergence

- **WHEN** a template file is modified in a way that changes the resolved output
- **THEN** the snapshot test SHALL fail, indicating the divergence between the expected and actual output

#### Scenario: Snapshot tests cover all migrated commands

- **WHEN** the snapshot test suite is executed
- **THEN** it SHALL include a test case for every command that has been migrated to the template-based authoring system

### Requirement: TS-side command definitions retain metadata and registration

After migration, `command-bodies.ts` (or its successor) SHALL retain command metadata (frontmatter, description), command registration in the contract registry, run hook definitions, and references. The template path for each command SHALL be declared in the TS-side definition.

#### Scenario: TS definition declares template path

- **WHEN** a command definition in the TS source is inspected
- **THEN** it SHALL declare the path to its corresponding `.md.tmpl` template file
- **AND** it SHALL retain the `frontmatter` object with `description`

#### Scenario: TS definition retains run hooks

- **WHEN** a command with run hooks is inspected in the TS source
- **THEN** the run hook definitions SHALL remain in the TS-side code
- **AND** they SHALL NOT be moved to the template file
