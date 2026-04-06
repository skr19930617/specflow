# Data Model: Spec Decompose Command

## Entities

### DecompositionProposal (transient, in-conversation)

Represents the AI-generated decomposition plan presented to the user before confirmation.

| Field | Type | Description |
|-------|------|-------------|
| parent_issue_url | string | URL of the parent GitHub issue (null for inline specs) |
| parent_issue_number | integer | Issue number extracted from URL |
| repo_owner | string | GitHub repository owner |
| repo_name | string | GitHub repository name |
| sub_features | SubFeature[] | Ordered list of proposed sub-features |
| is_issue_linked | boolean | Whether spec originated from a GitHub issue |

### SubFeature (transient, in-conversation)

Represents one proposed sub-feature in the decomposition.

| Field | Type | Description |
|-------|------|-------------|
| phase_number | integer | 1-based phase ordering |
| title | string | Short descriptive title for the sub-feature |
| description | string | Scoped description of the sub-feature |
| requirements | string[] | List of FR-IDs extracted from the parent spec |
| acceptance_criteria | string[] | Acceptance criteria specific to this sub-feature |

### CreatedIssue (transient, in-conversation)

Tracks an issue after successful creation on GitHub.

| Field | Type | Description |
|-------|------|-------------|
| phase_number | integer | Phase ordering |
| issue_number | integer | GitHub issue number |
| issue_url | string | Full URL to the created issue |
| title | string | Issue title (with phase prefix) |
| status | "created" \| "failed" | Creation result |

## State Transitions

```
[Start] → AI Analysis → {needs_decomposition: true/false}
  → if false: Report "no decomposition needed" → [End]
  → if true:
    → if inline_spec: Warn user → [End]
    → if issue_linked:
      → Present proposal → {user_confirms: true/false}
        → if false: Cancel → [End]
        → if true: Create issues sequentially
          → per issue: {created / failed}
          → if all created: Post summary comment → [End]
          → if some failed: Report partial result, offer retry → [End]
```

## Notes

- All entities are transient (conversation-scoped). No persistent state files are created by this feature.
- The slash command prompt itself manages the state via Claude's conversation context.
- The helper bash script `specflow-create-sub-issues` receives sub-feature data as JSON arguments.
