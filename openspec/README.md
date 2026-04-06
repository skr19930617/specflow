# OpenSpec Directory

This directory follows the [OpenSpec](https://github.com/skr19930617/specflow) convention for managing planning and specification state.

## Structure

```
openspec/
├── specs/                          # Current truth (capability specs)
│   └── <capability>/
│       └── spec.md                 # Canonical spec for a stable capability
├── changes/                        # Proposed changes (change records)
│   └── <change-id>/
│       ├── proposal.md             # Required: change proposal / feature spec
│       ├── design.md               # Optional: implementation design / plan
│       ├── tasks.md                # Optional: task breakdown
│       └── specs/                  # Optional: spec deltas for affected capabilities
│           └── <capability>/
│               └── spec.md
└── README.md                       # This file
```

## Concepts

- **Capability Spec** (`specs/<capability>/spec.md`): Describes a stable capability of the system as it exists today. Represents current truth.
- **Change Record** (`changes/<change-id>/`): Proposes a modification to the system. Contains a proposal, optional design, tasks, and spec deltas.

## Creating a New Change

1. Create a directory: `openspec/changes/<change-id>/`
2. Add `proposal.md` with your feature specification
3. Optionally add `design.md` (implementation plan) and `tasks.md` (task breakdown)
4. If modifying an existing capability, add spec deltas under `specs/<capability>/spec.md`

## Naming Convention

- Change IDs: `<NNN>-<short-name>` (e.g., `001-user-auth`, `042-openspec-migration`)
- Capability names: descriptive slug (e.g., `review-system`, `migration-tools`)
