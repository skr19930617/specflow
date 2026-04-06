# Quickstart: OpenSpec Migration

## Prerequisites

- Bash 4+ (for associative arrays if needed)
- Git repository with existing `specs/` directory
- All work committed (migration modifies tracked files)

## Implementation Order

### 1. Create migration script

```bash
# bin/specflow-migrate-openspec.sh
# See FR-007 for full requirements
# Key: atomic .migrating/ pattern, file mapping, idempotence
```

### 2. Run migration on this repo

```bash
bin/specflow-migrate-openspec.sh
# Expected: 20 entries migrated, specs/ removed
```

### 3. Audit commands

Review each `global/specflow*.md`:
- Update `specs/` path references to `openspec/changes/`
- Record audit in `openspec/changes/020-openspec-migration/command-audit.md`

### 4. Update install/init/template

```bash
# bin/specflow-init: add openspec/ directory creation
# bin/specflow-install: install updated global commands
# template/: add openspec/ scaffolding, update CLAUDE.md
```

### 5. Update README

Document the new architecture and directory conventions.

## Verification Checklist

- [ ] `openspec/specs/` exists (empty)
- [ ] `openspec/changes/` has 20 subdirectories
- [ ] Each change record has `proposal.md`
- [ ] `specs/` directory is removed
- [ ] All specflow commands reference `openspec/` paths
- [ ] `bin/specflow-migrate-openspec.sh` is idempotent (re-run produces same state)
- [ ] `specflow-init` creates `openspec/` in fresh project
- [ ] README explains new architecture
- [ ] `command-audit.md` documents all command decisions

## Key Files

| File | Purpose |
|------|---------|
| `bin/specflow-migrate-openspec.sh` | One-shot migration script |
| `openspec/changes/020-openspec-migration/command-audit.md` | Command audit decisions |
| `openspec/README.md` | OpenSpec convention guide (in repo and template) |
| `template/openspec/README.md` | Bootstrap copy of convention guide |
