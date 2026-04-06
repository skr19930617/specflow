# Research: Spec Decompose Command

## R1: How to detect if a spec was created from a GitHub issue vs inline text

**Decision**: Check for `/tmp/specflow-issue.json` file existence. If it exists and contains valid JSON with a `url` field, the spec is issue-linked. Otherwise, it's inline.

**Rationale**: This is the existing pattern used by `specflow.spec_review.md` — it reads the issue body from `/tmp/specflow-issue.json` and skips silently if not found. Reusing this convention ensures consistency.

**Alternatives considered**:
- Store origin metadata in spec frontmatter → would require spec template changes
- Store in a separate metadata file in the feature dir → adds complexity without clear benefit

## R2: How to use AI analysis to determine spec complexity

**Decision**: The `/specflow.decompose` slash command itself is a Claude Code prompt. AI analysis is performed inline by Claude reading the spec and identifying independent functional areas. No external AI API call is needed — the slash command prompt instructs Claude to analyze the spec.

**Rationale**: This project's architecture is Claude Code slash commands (Markdown prompts) + Bash helper scripts. The AI analysis naturally happens when Claude processes the slash command and reads the spec.

**Alternatives considered**:
- Call Codex MCP for analysis → adds unnecessary complexity; Claude can do this directly
- Use heuristics (line count, section count) → less accurate than AI-based analysis

## R3: How to create GitHub issues and labels via `gh` CLI

**Decision**: Use `gh issue create` and `gh label create` commands. Labels are created with `gh label create "phase-N" --force` (idempotent). Issues are created with `gh issue create --title "Phase N: ..." --body "..." --label "phase-N"`.

**Rationale**: The `gh` CLI is an existing project dependency. The `--force` flag on label create is idempotent (no error if label exists).

**Alternatives considered**:
- GitHub REST API via curl → `gh` CLI handles auth and is already required
- GitHub MCP tools → available but `gh` CLI is simpler for batch operations in bash

## R4: How to post a summary comment on the parent issue

**Decision**: Use `gh issue comment <number> --body "..."` to post a formatted comment listing all created sub-issues with their phase ordering.

**Rationale**: Simple, uses existing `gh` CLI dependency.

**Alternatives considered**:
- Edit parent issue body → destructive; comment is safer and visible in timeline

## R5: How to handle partial failure and retry

**Decision**: The slash command tracks created issues in an array. On failure, it reports which were created (with URLs) and which failed. The user can re-run the command, which detects already-created issues by searching for existing issues with the same phase prefix and parent reference.

**Rationale**: Keeping state in the conversation context (not a file) is simpler for MVP. Retry detection via `gh issue list --search` avoids duplicates.

**Alternatives considered**:
- Write state to a JSON file → adds file management complexity for MVP
- Rollback (close created issues) → rejected per spec clarifications

## R6: Implementation as a specflow slash command

**Decision**: Create `global/specflow.decompose.md` as the slash command file. Add a helper bash script `bin/specflow-create-sub-issues` for the batch issue creation logic.

**Rationale**: Follows existing project patterns — slash commands in `global/` for specflow commands, helper scripts in `bin/` for complex bash operations.

**Alternatives considered**:
- Pure slash command (no helper script) → issue creation loop in bash is complex enough to warrant a helper
- specflow command → user chose specflow command in clarifications
