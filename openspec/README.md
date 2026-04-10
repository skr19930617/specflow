# OpenSpec Directory

This directory holds the current baseline capability specs for the `specflow`
codebase.

The baseline was reset from the implementation that exists today in `src/`,
`assets/`, and `src/tests/`. Legacy change records were intentionally cleared,
so the committed tree keeps `openspec/changes/` empty except for a placeholder
file.

## Structure

```
openspec/
├── specs/
│   ├── slash-command-guides/
│   ├── contract-driven-distribution/
│   ├── workflow-run-state/
│   ├── review-orchestration/
│   ├── project-bootstrap-installation/
│   └── utility-cli-suite/
├── changes/
│   └── .gitkeep
├── config.yaml
└── README.md
```

## Concepts

- `specs/<capability>/spec.md` describes behavior implemented today and should
  track the codebase, not historical proposals.
- `changes/` is reserved for future OpenSpec change records. The repository
  baseline keeps it empty.
- `config.yaml` stores project-level OpenSpec settings and context. It is not
  part of the baseline reset.

## Maintenance Rules

- Update the matching baseline spec when behavior in `src/`, `assets/`, or the
  shipped CLI surface changes.
- Prefer the implementation and tests over old spec text if they disagree.
- Do not rebuild baseline specs from archived change records. Git history is the
  archive.
