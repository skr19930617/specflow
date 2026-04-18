# project-bootstrap-installation Specification

## Purpose

Describe how `specflow` initializes a project and installs the packaged runtime
bundle into a user environment.
## Requirements
### Requirement: `specflow-init` bootstraps a project root and OpenSpec context

`specflow-init` SHALL initialize a project root, gather the selected agents, and
prepare the local OpenSpec and specflow configuration files.

#### Scenario: No-argument init targets the current git repository root

- **WHEN** `specflow-init` is invoked without arguments inside a git repository
- **THEN** it SHALL use the repository root as the target path

#### Scenario: Init creates a repository when the target is not already one

- **WHEN** the target directory is not an initialized git repository
- **THEN** `specflow-init` SHALL run `git init`

#### Scenario: OpenSpec init injects project context when config exists

- **WHEN** `openspec init` succeeds during `specflow-init`
- **THEN** the command SHALL add `Project: <project name>` to
  `openspec/config.yaml` if the file does not already contain a `context:` entry

### Requirement: `specflow-init` writes local project scaffolding and ignore rules

Project initialization SHALL create the local specflow config and SHALL copy
template files when they do not already exist. `.specflow/profile.json` SHALL NOT be included in `.gitignore` as it is a shared committed artifact.

#### Scenario: Init creates local config and template files

- **WHEN** `specflow-init` succeeds
- **THEN** it SHALL create `.specflow/config.env`
- **AND** it SHALL create `CLAUDE.md` from the configured template directory
  when that file is absent

#### Scenario: Init updates `.gitignore` for local-only files

- **WHEN** `specflow-init` succeeds
- **THEN** it SHALL add `.specflow/config.env` and `.specflow/runs/` to
  `.gitignore`
- **AND** it SHALL either ignore `.claude/` or only the local Claude settings
  files based on the `track .claude/ in git` choice
- **AND** it SHALL NOT add `.specflow/profile.json` to `.gitignore`

#### Scenario: Existing local template files are preserved

- **WHEN** `CLAUDE.md` already exists in the target project
- **THEN** `specflow-init` SHALL leave the existing file in place

### Requirement: `specflow-init --update` refreshes project-facing assets from the installed bundle

Update mode SHALL operate from the current repository root and SHALL refresh the
installed slash commands and template-backed project files. When a valid profile exists, update mode SHALL also trigger adapter rendering.

#### Scenario: Update refreshes slash commands

- **WHEN** `specflow-init --update` succeeds
- **THEN** it SHALL copy the installed command markdown into
  `$HOME/.claude/commands`

#### Scenario: Update prompts before overwriting `CLAUDE.md`

- **WHEN** the template `CLAUDE.md` differs from the project copy
- **THEN** update mode SHALL show a diff and ask before replacing the file

#### Scenario: Update triggers adapter rendering when profile exists

- **WHEN** `specflow-init --update` succeeds
- **AND** `.specflow/profile.json` exists and passes schema validation
- **THEN** update mode SHALL trigger the Claude adapter to re-render CLAUDE.md from the profile

#### Scenario: Update skips rendering when no profile exists

- **WHEN** `specflow-init --update` succeeds
- **AND** `.specflow/profile.json` does not exist
- **THEN** update mode SHALL skip adapter rendering and display a suggestion to run `setup`

### Requirement: `specflow-install` deploys the packaged runtime bundle from the manifest and install plan

`specflow-install` SHALL use `dist/install-plan.json` and `dist/manifest.json`
to copy runtime assets, install slash-command markdown, and expose CLI links.

#### Scenario: Install copies packaged runtime directories

- **WHEN** `specflow-install` runs
- **THEN** it SHALL copy the packaged template directory and the packaged
  `global/prompts`, `global/workflow`, `global/commands`, and
  `global/claude-settings.json` trees into `$HOME/.config/specflow/`

#### Scenario: Install symlinks each published CLI

- **WHEN** `specflow-install` runs
- **THEN** it SHALL create symlinks for every orchestrator-defined CLI in
  `$HOME/bin/`
- **AND** it SHALL remove stale `specflow*` symlinks that are no longer expected

#### Scenario: Install publishes slash commands and merges Claude permissions

- **WHEN** `specflow-install` runs
- **THEN** it SHALL copy generated command markdown into `$HOME/.claude/commands`
- **AND** it SHALL merge the packaged Claude permission allow-list into
  `$HOME/.claude/settings.json` without dropping existing entries

### Requirement: `setup` command analyzes the repository and generates a structured profile

The `setup` command SHALL analyze the repository root, detect ecosystem and toolchain, interactively confirm findings with the user, and generate `.specflow/profile.json`.

#### Scenario: Setup detects a single-root single-language repository

- **WHEN** `setup` is invoked in a repository with exactly one primary ecosystem indicator
- **THEN** it SHALL detect language, toolchain, commands, and directories
- **AND** it SHALL present findings to the user for confirmation

#### Scenario: Setup blocks on required fields until user provides input

- **WHEN** `setup` cannot detect a required field (`languages` or `toolchain`)
- **THEN** it SHALL prompt the user for interactive input
- **AND** it SHALL NOT write `profile.json` until all required fields are confirmed

#### Scenario: Setup writes null for undetected optional fields

- **WHEN** `setup` cannot detect an optional field
- **THEN** it SHALL set the field to `null` in the profile
- **AND** it SHALL offer the user a chance to provide a value, but allow skipping

#### Scenario: Setup runs schema validation before writing profile

- **WHEN** the user has confirmed all field values
- **THEN** `setup` SHALL validate the assembled profile against the schema
- **AND** it SHALL only write `.specflow/profile.json` if validation passes

#### Scenario: Setup triggers adapter rendering after profile generation

- **WHEN** `setup` successfully writes `.specflow/profile.json`
- **THEN** it SHALL automatically trigger the Claude adapter to render CLAUDE.md

### Requirement: `setup` detects out-of-scope repositories and aborts

The `setup` command SHALL detect repository configurations that are not supported in v1 and abort with a clear message.

#### Scenario: Multiple ecosystem indicators cause abort

- **WHEN** `setup` detects primary indicators from two or more different ecosystems (e.g., `package.json` and `go.mod`)
- **THEN** it SHALL display an out-of-scope warning and exit without writing a profile

#### Scenario: Workspace definitions cause abort

- **WHEN** `setup` detects workspace definitions (e.g., `pnpm-workspace.yaml`, `[workspace]` in `Cargo.toml`)
- **THEN** it SHALL display an out-of-scope warning and exit without writing a profile

#### Scenario: No ecosystem indicators cause abort

- **WHEN** `setup` finds no recognized project definition files at the repository root
- **THEN** it SHALL display an out-of-scope warning and exit without writing a profile

#### Scenario: Ambiguous toolchain within same ecosystem prompts user

- **WHEN** `setup` finds conflicting lockfiles within the same ecosystem (e.g., `package-lock.json` and `pnpm-lock.yaml`)
- **THEN** it SHALL prompt the user to select the correct toolchain

### Requirement: `setup` owns profile schema migration

When `setup` encounters a profile with an older `schemaVersion`, it SHALL migrate the profile to the current schema before proceeding with analysis.

#### Scenario: Outdated profile is migrated on rerun

- **WHEN** `setup` reads a profile with `schemaVersion` less than the current expected version
- **THEN** it SHALL transform the profile to the new schema format
- **AND** it SHALL present the migration changes to the user for confirmation before writing

