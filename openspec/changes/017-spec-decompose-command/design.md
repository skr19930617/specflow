<!-- Historical Migration
  Source: specs/017-spec-decompose-command/plan.md
  Migrated: 2026-04-06
  Context: Migrated from legacy specs/ structure to OpenSpec changes/ as part of issue #47
-->

# Implementation Plan: Spec Decompose Command

**Branch**: `017-spec-decompose-command` | **Date**: 2026-04-06 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/017-spec-decompose-command/spec.md`

## Summary

Add a `/specflow.decompose` slash command that analyzes a spec for complexity, proposes decomposition into independent sub-features, and (for issue-linked specs) creates GitHub issues with phase-prefixed titles and labels. A helper bash script handles batch issue creation. Inline specs receive a warning only.

## Technical Context

**Language/Version**: Bash (POSIX + bashisms), Markdown (Claude Code slash commands)  
**Primary Dependencies**: Claude Code CLI, GitHub CLI (`gh`), specflow (`.specify/`)  
**Storage**: File-based — slash command in `global/`, helper script in `bin/`, no persistent state  
**Testing**: Manual testing via `/specflow.decompose` on sample specs  
**Target Platform**: macOS/Linux terminal  
**Project Type**: CLI tool (slash commands + helper scripts)  
**Performance Goals**: N/A (interactive CLI)  
**Constraints**: Must follow existing specflow slash command patterns  
**Scale/Scope**: Single slash command + single helper script

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution is a template with no concrete constraints defined. No gate violations.

**Post-design re-check**: No violations. Design follows existing project patterns (slash commands in `global/`, scripts in `bin/`).

## Project Structure

### Documentation (this feature)

```text
specs/017-spec-decompose-command/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (from /specflow.tasks)
```

### Source Code (repository root)

```text
global/
└── specflow.decompose.md    # New slash command

bin/
└── specflow-create-sub-issues  # New helper script for batch issue creation
```

**Structure Decision**: Follows existing project patterns. Slash commands go in `global/` (installed to `~/.config/specflow/global/` by `specflow-install`). Helper scripts go in `bin/` (added to PATH by installation).

## Implementation Approach

### Component 1: Slash Command (`global/specflow.decompose.md`)

A Claude Code slash command (Markdown prompt) that:
1. Reads prerequisites (specflow installed, specflow config, feature branch)
2. Reads the current spec and checks for `/tmp/specflow-issue.json`
3. Instructs Claude to analyze the spec for independent functional areas
4. Presents decomposition proposal (or warning for inline specs, or "no action needed")
5. On user confirmation, calls the helper script to create issues
6. Reports results

**Pattern**: Follows `specflow.md`, `specflow.approve.md`, etc. — frontmatter with description, prerequisites check, step-by-step workflow.

### Component 2: Helper Script (`bin/specflow-create-sub-issues`)

A bash script that:
1. Accepts JSON input (sub-features array, parent issue number, repo info)
2. Creates phase labels if missing (`gh label create "phase-N" --force`)
3. Creates issues sequentially (`gh issue create`)
4. Tracks created vs failed issues
5. Posts summary comment on parent issue (`gh issue comment`)
6. Outputs JSON result (created issues, failed issues)

**Pattern**: Follows `specflow-filter-diff`, `specflow-fetch-issue` — bash script with `set -euo pipefail`, argument parsing, JSON output.

### Data Contract: Slash Command → Helper Script

The slash command passes a JSON payload to the helper script via **stdin**. The helper script outputs a JSON result to **stdout**.

#### Input Schema (stdin to `specflow-create-sub-issues`)

```json
{
  "parent_issue_number": 39,
  "repo": "skr19930617/specflow",
  "run_timestamp": "20260406-143022",
  "sub_features": [
    {
      "phase_number": 1,
      "title": "User authentication",
      "description": "Scoped description of the sub-feature...",
      "requirements": ["FR-001", "FR-002"],
      "acceptance_criteria": ["Users can log in via email/password", "..."],
      "phase_total": 4
    }
  ]
}
```

Required fields: `parent_issue_number`, `repo`, `run_timestamp`, `sub_features[]` with `phase_number`, `title`, `description`, `requirements`, `acceptance_criteria`, `phase_total`. The `run_timestamp` is generated once when the slash command starts a decomposition run (format: `YYYYMMDD-HHMMSS`) and reused for retries within the same run.

The helper script MUST validate that all required fields are present before making any GitHub API calls. If validation fails, exit with error and create no issues.

#### Output Schema (stdout from `specflow-create-sub-issues`)

```json
{
  "created": [
    {"phase_number": 1, "issue_number": 42, "issue_url": "https://github.com/owner/repo/issues/42", "title": "Phase 1: User authentication"}
  ],
  "failed": [
    {"phase_number": 3, "title": "Phase 3: Data export", "error": "API rate limit exceeded"}
  ],
  "summary_comment_posted": true,
  "parent_issue_number": 39
}
```

#### Issue Body Template

Each created sub-issue MUST use this body template to satisfy FR-009:

```markdown
## Phase {phase_number} of {phase_total}: {title}

**Parent Issue**: #{parent_issue_number}
**Decomposition ID**: decompose-{parent_issue_number}-{run_timestamp}-phase-{phase_number}

## Description
{description}

## Requirements
{requirements as bulleted list}

## Acceptance Criteria
{acceptance_criteria as bulleted list}
```

The `Decomposition ID` line serves as a unique marker for idempotent retry detection.

#### Retry Contract

On partial failure, the slash command receives the structured output with both `created` and `failed` arrays. To retry:
1. The slash command presents the partial result to the user via AskUserQuestion: show created issues (with URLs) and failed items, then offer "Retry failed items" / "Cancel (keep created)" options.
2. If the user chooses retry, the slash command constructs a new input payload containing ONLY the `failed` items as `sub_features`, **reusing the original `run_timestamp`** from the first run to preserve decomposition ID consistency and ensure idempotent retry.
3. The helper script checks for existing issues containing the decomposition-specific marker `decompose-{parent_issue_number}-{run_timestamp}-phase-{phase_number}` in the repo before creating (idempotent guard via `gh issue list --search "decompose-{parent}-{timestamp}-phase-{N}" --json number`). The `run_timestamp` is generated once per decomposition run and passed in the input payload, ensuring that retries within the same run are idempotent while separate decomposition runs of the same parent issue create distinct issues.
4. If a matching issue already exists, it is added to `created` without re-creation.
5. This ensures the retry is idempotent — re-running with the same input produces no duplicates, even if other issues have similar titles.

### Integration with specflow-install

The `specflow-install` script already handles copying `global/` files and `bin/` scripts. No changes needed to the install process — new files will be picked up automatically.

## Complexity Tracking

No violations to justify. Design is minimal: 1 slash command + 1 helper script.
