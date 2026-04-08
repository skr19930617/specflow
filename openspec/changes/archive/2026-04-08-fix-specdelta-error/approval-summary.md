# Approval Summary: fix-specdelta-error

**Generated**: 2026-04-08 18:53
**Branch**: fix-specdelta-error
**Status**: ⚠️ 4 unresolved high

## What Changed

 global/commands/specflow.approve.md                | 38 +++++++----
 global/commands/specflow.design.md                 |  2 +-
 global/commands/specflow.md                        |  2 +-
 openspec/specs/approve-execution-order/spec.md     | 20 ++++++
 openspec/specs/validate-command-syntax/spec.md     | 18 +++++
 + archived changes from previous features
 24 files changed, 616 insertions(+), 15 deletions(-)

## Files Touched

- global/commands/specflow.approve.md
- global/commands/specflow.design.md
- global/commands/specflow.md
- openspec/specs/approve-execution-order/spec.md
- openspec/specs/validate-command-syntax/spec.md
- openspec/changes/archive/ (2 archived changes)

## Review Loop Summary

### Design Review
| Metric             | Count |
|--------------------|-------|
| Initial high       | 1     |
| Resolved high      | 1     |
| Unresolved high    | 1     |
| New high (later)   | 1     |
| Total rounds       | 2     |

### Impl Review
| Metric             | Count |
|--------------------|-------|
| Initial high       | 3     |
| Resolved high      | 0     |
| Unresolved high    | 3     |
| New high (later)   | 0     |
| Total rounds       | 1     |

Note: Impl review findings (R1-F01〜F03) were addressed in working tree auto-fix but ledger was not re-reviewed.

## Proposal Coverage

| # | Criterion (summary) | Covered? | Mapped Files |
|---|---------------------|----------|--------------|
| 1 | コードベース内部まで解析して capability 候補を検出 | Yes | global/commands/specflow.spec.md |
| 2 | 検出した capability 一覧がユーザーに提示され、選択・追加・削除できる | Yes | global/commands/specflow.spec.md |
| 3 | 選択された capability ごとに質問を行い spec が生成される | Yes | global/commands/specflow.spec.md |
| 4 | OpenSpec CLI の instructions/template が存在する場合はそれを使用する | Yes | global/commands/specflow.spec.md |
| 5 | openspec/specs/ が空の場合に specflow.spec への誘導が表示される | Yes | global/commands/specflow.md |
| 6 | spec 生成後、通常の specflow フローが正常に動作する | Yes | global/commands/specflow.spec.md |

**Coverage Rate**: 6/6 (100%)

## Remaining Risks

**Impl review findings (unresolved):**
- R1-F01: Recommended no-spec handoff does not actually invoke the bootstrap workflow (severity: high) — *fixed in working tree*
- R1-F02: Baseline spec validation command does not target the generated spec (severity: high) — *fixed in working tree*
- R1-F03: CLI-first spec generation required by the spec is still unimplemented (severity: high) — *fixed in working tree*
- R1-F04: Empty-project flow does not satisfy the manual capability entry requirement (severity: medium) — *fixed in working tree*
- R1-F05: No regression coverage for the new bootstrap and no-spec branches (severity: medium)

**Design review findings (unresolved):**
- R2-F01: CLI-first generation path is built around unsupported spec commands (severity: high) — *addressed in implementation*
- R2-F02: Capability selection depends on an undefined AskUserQuestion multi-select mode (severity: medium)
- R2-F03: No validation step confirms generated baseline specs are usable before handoff (severity: medium) — *addressed in implementation*

**Untested new files:**
- ⚠️ New file not mentioned in review: global/commands/specflow.spec.md (untracked, not in git diff)

## Human Checkpoints

- [ ] `/specflow.spec` を手動で実行し、コードベース解析 → capability 選択 → spec 生成が end-to-end で動作することを確認
- [ ] `/specflow` を spec なしのプロジェクトで実行し、Step 2.5 のハンドオフが正しく表示されることを確認
- [ ] 生成された spec で `/specflow.design` が spec delta エラーなしに動作することを確認
- [ ] `openspec templates --json` の CLI プローブが正しくフォールバックすることを確認
