# Quickstart: Spec Decompose Command

## Usage

### Decompose an issue-linked spec

```
/specflow.decompose
```

Reads the current feature's spec and `/tmp/specflow-issue.json` to determine if decomposition is needed.

### What it does

1. Reads the spec file for the current feature branch
2. Uses AI analysis to identify independent functional areas
3. **If issue-linked and decomposition needed**: presents a proposal, then creates sub-issues on GitHub with phase prefixes and labels
4. **If inline spec and too large**: warns the user to manually split the spec
5. **If spec is already well-scoped**: confirms no decomposition needed

## Prerequisites

- On a specflow feature branch with a `spec.md`
- `gh` CLI installed and authenticated
- For issue-linked decomposition: `/tmp/specflow-issue.json` must exist (created by `/specflow`)

## Example Output

```
## Decomposition Proposal

The spec contains 4 independent functional areas:

| Phase | Title | Requirements |
|-------|-------|-------------|
| 1 | User authentication | FR-001, FR-002 |
| 2 | Dashboard layout | FR-003, FR-004 |
| 3 | Data export | FR-005 |
| 4 | Notification system | FR-006, FR-007 |

Confirm to create 4 GitHub issues with phase labels?
[Confirm] [Cancel]
```

## Files Created

| File | Location | Description |
|------|----------|-------------|
| `specflow.decompose.md` | `global/` | Slash command (installed to `~/.config/specflow/global/`) |
| `specflow-create-sub-issues` | `bin/` | Helper script for batch issue creation |
