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
template files when they do not already exist.

#### Scenario: Init creates local config and template files

- **WHEN** `specflow-init` succeeds
- **THEN** it SHALL create `.specflow/config.env`
- **AND** it SHALL create `.mcp.json` and `CLAUDE.md` from the configured
  template directory when those files are absent

#### Scenario: Init updates `.gitignore` for local-only files

- **WHEN** `specflow-init` succeeds
- **THEN** it SHALL add `.mcp.json`, `.specflow/config.env`, and
  `.specflow/runs/` to `.gitignore`
- **AND** it SHALL either ignore `.claude/` or only the local Claude settings
  files based on the `track .claude/ in git` choice

#### Scenario: Existing local template files are preserved

- **WHEN** `.mcp.json` or `CLAUDE.md` already exists in the target project
- **THEN** `specflow-init` SHALL leave the existing file in place

### Requirement: `specflow-init --update` refreshes project-facing assets from the installed bundle

Update mode SHALL operate from the current repository root and SHALL refresh the
installed slash commands and template-backed project files without re-running
full initialization.

#### Scenario: Update refreshes slash commands and `.mcp.json`

- **WHEN** `specflow-init --update` succeeds
- **THEN** it SHALL copy the installed command markdown into
  `$HOME/.claude/commands`
- **AND** it SHALL refresh the project `.mcp.json` from the template bundle

#### Scenario: Update prompts before overwriting `CLAUDE.md`

- **WHEN** the template `CLAUDE.md` differs from the project copy
- **THEN** update mode SHALL show a diff and ask before replacing the file

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
