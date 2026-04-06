# Data Model: OpenSpec Migration

## Entities

### OpenSpec Directory Structure

```
openspec/
├── specs/                          # Capability specs (current truth)
│   └── <capability>/
│       └── spec.md
├── changes/                        # Change records (proposals)
│   └── <change-id>/
│       ├── proposal.md             # Required (from spec.md)
│       ├── design.md               # Optional (from plan.md)
│       ├── tasks.md                # Optional (from tasks.md)
│       ├── specs/                  # Optional (spec deltas, future use)
│       │   └── <capability>/
│       │       └── spec.md
│       └── <other-artifacts>/      # Copied as-is
└── README.md                       # Convention guide
```

### Migrated Change Record

| Field | Source | Transformation |
|-------|--------|---------------|
| `proposal.md` | `spec.md` | Add "Historical Migration" header with source path and date |
| `design.md` | `plan.md` | Add migration header (if source exists) |
| `tasks.md` | `tasks.md` | Add migration header (if source exists) |
| Other files | As-is | Copy unchanged |

### Migration Header Format

```markdown
<!-- Historical Migration
  Source: specs/<NNN>-<name>/spec.md
  Migrated: YYYY-MM-DD
  Context: Migrated from legacy specs/ structure to OpenSpec changes/ as part of issue #47
-->
```

### Command Audit Record

| Field | Type | Description |
|-------|------|-------------|
| Command file | string | Filename (e.g., `specflow.md`) |
| Classification | enum | `keep`, `modify`, `remove` |
| Rationale | string | Why this classification |
| Path updates needed | list | Specific `specs/` → `openspec/` path changes |
| References removed | list | For `remove` only: files that referenced this command |

### Migration Script States

| State | Detection | Action |
|-------|-----------|--------|
| Not started | Source exists, no target or temp | Migrate normally |
| In progress | `.migrating/` temp exists | Clean up temp, re-migrate from source |
| Complete | Target exists, no source | Skip |
| Conflict | Both source and target exist | Remove target, re-migrate from source |

## Relationships

```
OpenSpec Root
├── has-many → Capability Spec (0..N, starts empty)
└── has-many → Change Record (1..N, 20 migrated initially)
    ├── has-one → proposal.md (required)
    ├── has-one → design.md (optional)
    ├── has-one → tasks.md (optional)
    └── has-many → other artifacts (0..N)

Repository
├── has-one → openspec/ (planning state)
├── has-many → bin/ scripts (distributable)
├── has-many → global/ commands (distributable)
└── has-one → template/ (distributable bootstrap)
```

## Validation Rules

- Every change record MUST have a `proposal.md`
- Change-id MUST match the pattern `<NNN>-<name>` (preserved from source)
- No `.migrating/` directories should exist after successful migration
- `specs/` directory MUST NOT exist after migration
- All `global/specflow*.md` commands MUST reference `openspec/` paths (not `specs/`)
