# Quickstart: Split Review Commands

## What Changed

The ambiguous `/specflow.review` is replaced by three phase-specific review commands:

| Before | After |
|--------|-------|
| `/specflow.review` (ambiguous) | `/specflow.spec_review` — spec only |
| (embedded in flow) | `/specflow.plan_review` — plan/tasks only |
| (embedded in flow) | `/specflow.impl_review` — implementation only |

## Usage

### Standalone (re-review after fix)
```
/specflow.spec_review    # Re-review spec after /specflow.spec_fix
/specflow.plan_review    # Re-review plan after /specflow.plan_fix
/specflow.impl_review    # Re-review impl after /specflow.fix
```

### Within Flow (automatic)
The flow commands (`/specflow`, `/specflow.plan`, `/specflow.impl`) now delegate their review step to the corresponding review command. No user action needed.

## Flow Diagram

```
/specflow → spec_review → Plan に進む → /specflow.plan → plan_review → 実装に進む → /specflow.impl → impl_review → Approve
                ↓                                          ↓                                            ↓
          Spec を修正                               Plan を修正                                     Fix / Reject
          /specflow.spec_fix                       /specflow.plan_fix                              /specflow.fix
                ↓                                          ↓                                            ↓
          spec_review (再)                          plan_review (再)                              impl_review (再)
```
