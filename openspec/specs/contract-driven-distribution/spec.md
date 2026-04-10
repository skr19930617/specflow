# contract-driven-distribution Specification

## Purpose

Describe the contract-driven build and distribution pipeline that produces the
runtime bundle shipped by `specflow`.

## Requirements

### Requirement: A single contracts bundle defines distributable assets

The system SHALL assemble a contracts bundle containing commands, prompts,
orchestrators, workflow, templates, and installer assets.

#### Scenario: Contracts bundle enumerates all asset families

- **WHEN** `src/contracts/install.ts` is evaluated
- **THEN** it SHALL export a bundle containing `commands`, `prompts`,
  `orchestrators`, `workflow`, `templates`, `installCopies`, `installLinks`,
  and `installSettingsMerge`

#### Scenario: Installer links are derived from orchestrator contracts

- **WHEN** install-link contracts are created
- **THEN** each orchestrator contract SHALL produce a matching `$HOME/bin`
  target for its CLI entrypoint

### Requirement: Contract validation protects bundle integrity before build

The build-time validator SHALL reject inconsistent contracts before distribution
artifacts are emitted.

#### Scenario: Source-backed assets require existing source files

- **WHEN** prompt, template, or orchestrator contracts are validated
- **THEN** the validator SHALL fail if the referenced prompt source, template
  source, or source-side TypeScript entry module does not exist

#### Scenario: Orchestrator schemas must be registered

- **WHEN** an orchestrator contract declares `stdinSchemaId`,
  `stdoutSchemaId`, or `stderrSchemaId`
- **THEN** the validator SHALL require the schema id to exist in the schema
  registry

#### Scenario: Every CLI entrypoint needs an orchestrator contract

- **WHEN** `src/bin/*.ts` is scanned during validation
- **THEN** each CLI entrypoint SHALL have a matching orchestrator contract id

### Requirement: Build emits runtime assets from contracts

The build SHALL validate contracts and SHALL render the distribution bundle from
the contract definitions.

#### Scenario: Build emits workflow, commands, prompts, and templates

- **WHEN** `src/build.ts` runs successfully
- **THEN** it SHALL write `dist/package/global/workflow/state-machine.json`
- **AND** it SHALL write generated command markdown under
  `dist/package/global/commands/`
- **AND** it SHALL write generated prompts under `dist/package/global/prompts/`
- **AND** it SHALL copy template assets into `dist/package/template/`

#### Scenario: Prompt output schemas are injected during rendering

- **WHEN** a prompt contract defines an `outputExample`
- **THEN** prompt rendering SHALL replace `{{OUTPUT_SCHEMA}}` with the rendered
  example payload

#### Scenario: Build emits manifest-style metadata files

- **WHEN** the build completes
- **THEN** it SHALL write `dist/manifest.json`, `dist/install-plan.json`, and
  `dist/contracts.json`

### Requirement: Generated command and workflow assets mirror the contracts

Generated assets SHALL preserve the structure described by the source
contracts.

#### Scenario: Generated command markdown keeps frontmatter and hook content

- **WHEN** a command contract is rendered
- **THEN** the generated markdown SHALL include frontmatter built from the
  command description and body frontmatter
- **AND** any run hooks SHALL render as fenced shell blocks in a `Run State
  Hooks` section

#### Scenario: Workflow JSON mirrors the workflow contract

- **WHEN** the workflow asset is rendered
- **THEN** the emitted JSON SHALL contain the workflow `version`, `states`,
  `events`, and `transitions`

### Requirement: Release packaging includes the runtime bundle required for installation

The published npm package SHALL include the runtime files needed by release and
postinstall flows.

#### Scenario: Package metadata exposes installable bins and postinstall

- **WHEN** `package.json` is inspected
- **THEN** it SHALL expose the `specflow-install` and `specflow-run` bins
- **AND** it SHALL keep `node scripts/postinstall.mjs` as the `postinstall`
  script

#### Scenario: npm pack includes bundled runtime assets

- **WHEN** `npm pack --dry-run` is evaluated
- **THEN** the package contents SHALL include CLI launchers under `bin/`
- **AND** compiled runtime files under `dist/bin/`
- **AND** generated bundle assets such as
  `dist/package/global/workflow/state-machine.json`
