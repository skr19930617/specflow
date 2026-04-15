# Approval Summary: define-surface-event-contract-for-external-runtimes

**Generated**: 2026-04-15T02:34:00Z
**Branch**: define-surface-event-contract-for-external-runtimes
**Status**: ✅ No unresolved high

## What Changed

```
 package-lock.json                     |  62 ++++++++++++++++++-
 package.json                          |   1 +
 src/contracts/install.ts              |   7 +++
 src/contracts/surface-events.ts       | 205 +++ (new)
 src/generators/static-assets.ts       |   4 ++
 src/lib/phase-router/derive-action.ts |   7 +++
 src/lib/phase-router/router.ts        |  60 +++++++++++++++---
 src/lib/phase-router/types.ts         |  47 ++++++++++----
 src/tests/phase-router.test.ts        | 113 +++++++++++++++++++++++++++++++---
 src/tests/surface-event-schema-drift.test.ts | 242 +++ (new)
 assets/global/schemas/surface-events/ | 10 schema files (new)
```

## Files Touched

- package-lock.json
- package.json
- src/contracts/install.ts
- src/contracts/surface-events.ts (new)
- src/generators/static-assets.ts
- src/lib/phase-router/derive-action.ts
- src/lib/phase-router/router.ts
- src/lib/phase-router/types.ts
- src/tests/phase-router.test.ts
- src/tests/surface-event-schema-drift.test.ts (new)
- assets/global/schemas/surface-events/*.schema.json (10 new files)

## Review Loop Summary

### Design Review
| Metric             | Count |
|--------------------|-------|
| Initial high       | 1     |
| Resolved high      | 1     |
| Unresolved high    | 0     |
| New high (later)   | 0     |
| Total rounds       | 3     |

### Impl Review
| Metric             | Count |
|--------------------|-------|
| Initial high       | 1     |
| Resolved high      | 1     |
| Unresolved high    | 0     |
| New high (later)   | 0     |
| Total rounds       | 2     |

## Proposal Coverage

| # | Criterion (summary) | Covered? | Mapped Files |
|---|---------------------|----------|--------------|
| 1 | SurfaceEventEnvelope with all required fields | Yes | src/contracts/surface-events.ts |
| 2 | Bidirectional (inbound + outbound) direction | Yes | src/contracts/surface-events.ts |
| 3 | schema_version for forward compatibility | Yes | src/contracts/surface-events.ts |
| 4 | Correlation object (run_id, change_id, sequence, caused_by) | Yes | src/contracts/surface-events.ts |
| 5 | Actor identity reuses actor-surface-model taxonomy | Yes | src/contracts/surface-events.ts |
| 6 | Surface identity from surface taxonomy | Yes | src/contracts/surface-events.ts |
| 7 | Hierarchical event type system (4 categories, 11 concrete types) | Yes | src/contracts/surface-events.ts |
| 8 | Fixed payload schema per concrete event type | Yes | src/contracts/surface-events.ts |
| 9 | Slash-command-to-event mapping documented | Yes | openspec/changes/.../specs/surface-event-contract/spec.md |
| 10 | TypeScript types + JSON Schema dual format | Yes | src/contracts/surface-events.ts, assets/global/schemas/surface-events/ |
| 11 | Phase-router conforms to event contract | Yes | src/lib/phase-router/router.ts, types.ts |
| 12 | JSON Schema in distribution bundle | Yes | src/contracts/install.ts, src/generators/static-assets.ts |

**Coverage Rate**: 12/12 (100%)

## Remaining Risks

- R2-F07: EVENT_TYPE_TO_KIND maps request_changes and block to 'approval' (severity: low) — intentional coarse categorization per spec, but could confuse external consumers filtering on event_kind.

## Human Checkpoints

- [ ] Verify the EVENT_TYPE_TO_KIND mapping makes semantic sense for external consumers (request_changes/block under "approval" category)
- [ ] Confirm that PhaseContract.gated_event_type will be populated correctly by the production PhaseContractRegistry (#129) when it lands
- [ ] Validate that the JSON Schema $ref resolution works correctly when consumed from `$HOME/.config/specflow/global/schemas/`
- [ ] Test that the ajv devDependency doesn't affect the production bundle size (devDependency only)
