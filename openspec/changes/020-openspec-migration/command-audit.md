# Command Audit: OpenSpec Migration

**Date**: 2026-04-06
**Issue**: #47 — Migrate specflow to OpenSpec repository structure

## Audit Results

| Command | Classification | `specs/` refs found | Action taken |
|---------|---------------|---------------------|--------------|
| specflow.md | **modify** | 2 | Updated to `openspec/changes/` |
| specflow.approve.md | **modify** | 4 | Updated to `openspec/changes/` |
| specflow.dashboard.md | **modify** | 5 | Updated to `openspec/changes/` |
| specflow.decompose.md | **keep** | 0 | No changes needed |
| specflow.fix.md | **keep** | 0 | No changes needed |
| specflow.impl.md | **modify** | 1 | Updated to `openspec/changes/` |
| specflow.impl_review.md | **keep** | 0 | No changes needed |
| specflow.plan.md | **modify** | 1 | Updated to `openspec/changes/` |
| specflow.plan_fix.md | **keep** | 0 | No changes needed |
| specflow.plan_review.md | **keep** | 0 | No changes needed |
| specflow.reject.md | **keep** | 0 | No changes needed |
| specflow.setup.md | **keep** | 0 | No changes needed |
| specflow.spec_fix.md | **keep** | 0 | No changes needed |
| specflow.spec_review.md | **keep** | 0 | No changes needed |

## Summary

- **keep**: 9 commands (no `specs/` path references, operate via FEATURE_DIR)
- **modify**: 5 commands (had direct `specs/` path references, now updated)
- **remove**: 0 commands (all provide unique value not replaced by OpenSpec)

## Decision Rule

- **keep**: Command uses FEATURE_DIR from check-prerequisites.sh, no hardcoded `specs/` paths
- **modify**: Command had hardcoded `specs/` strings needing update to `openspec/changes/`
- **remove**: N/A — no commands are fully superseded by OpenSpec conventions
