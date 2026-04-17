## MODIFIED Requirements

### Requirement: Build emits runtime assets from contracts

The build SHALL validate contracts, resolve command body templates, and SHALL render the distribution bundle from the contract definitions.

#### Scenario: Build emits workflow, commands, prompts, and templates

- **WHEN** `src/build.ts` runs successfully
- **THEN** it SHALL write `dist/package/global/workflow/state-machine.json`
- **AND** it SHALL write generated command markdown under `dist/package/global/commands/`
- **AND** it SHALL write generated prompts under `dist/package/global/prompts/`
- **AND** it SHALL copy template assets into `dist/package/template/`

#### Scenario: Build resolves command body templates before emitting command markdown

- **WHEN** `src/build.ts` processes command contracts
- **THEN** it SHALL read each command's `.md.tmpl` template from `assets/commands/`
- **AND** it SHALL resolve all insertion tags (`{{insert:}}`, `{{contract:}}`, `{{render:}}`) in the template
- **AND** it SHALL merge the resolved prose sections with the TS-side metadata (frontmatter, run hooks) to produce the final command markdown

#### Scenario: Prompt output schemas are injected during rendering

- **WHEN** a prompt contract defines an `outputExample`
- **THEN** prompt rendering SHALL replace `{{OUTPUT_SCHEMA}}` with the rendered example payload

#### Scenario: Build emits manifest-style metadata files

- **WHEN** the build completes
- **THEN** it SHALL write `dist/manifest.json`, `dist/install-plan.json`, and `dist/contracts.json`

### Requirement: Contract validation protects bundle integrity before build

The build-time validator SHALL reject inconsistent contracts before distribution artifacts are emitted. Template source validation SHALL be included in the validation pass.

#### Scenario: Source-backed assets require existing source files

- **WHEN** prompt, template, or orchestrator contracts are validated
- **THEN** the validator SHALL fail if the referenced prompt source, template source, or source-side TypeScript entry module does not exist

#### Scenario: Command template source files must exist

- **WHEN** a command contract declares a template path
- **THEN** the validator SHALL fail if the referenced `.md.tmpl` file does not exist in `assets/commands/`

#### Scenario: Orchestrator schemas must be registered

- **WHEN** an orchestrator contract declares `stdinSchemaId`, `stdoutSchemaId`, or `stderrSchemaId`
- **THEN** the validator SHALL require the schema id to exist in the schema registry

#### Scenario: Every CLI entrypoint needs an orchestrator contract

- **WHEN** `src/bin/*.ts` is scanned during validation
- **THEN** each CLI entrypoint SHALL have a matching orchestrator contract id

## ADDED Requirements

### Requirement: Template resolution is a build pipeline step

The build pipeline SHALL include a template resolution step that processes `assets/commands/*.md.tmpl` files. This step SHALL execute after contract validation and before command markdown emission.

#### Scenario: Template resolution runs in the build pipeline

- **WHEN** `src/build.ts` is executed
- **THEN** the template resolution step SHALL run after contract validation passes
- **AND** a template resolution failure SHALL prevent command markdown emission

#### Scenario: Template resolution failure stops the build

- **WHEN** any `.md.tmpl` file contains an unresolvable insertion tag
- **THEN** the build SHALL fail with an error identifying the file and the unresolvable tag
- **AND** no command markdown SHALL be emitted for any command
