# Approval Summary: add-readme-command

**Generated**: 2026-04-07 20:03
**Branch**: add-readme-command
**Status**: ⚠️ 1 unresolved high (plan review — accepted risk for implementation)

## What Changed

New files for this feature:
- `bin/specflow-analyze` — 511 lines added (bash project analyzer)
- `global/commands/specflow.readme.md` — 134 lines added (slash command)

## Files Touched

- `bin/specflow-analyze` (new)
- `global/commands/specflow.readme.md` (new)
- `openspec/changes/add-readme-command/` (proposal, plan, tasks, research, review artifacts)

## Review Loop Summary

### Spec Review
| Metric             | Count |
|--------------------|-------|
| Initial high       | 1     |
| Resolved high      | 1     |
| Unresolved high    | 0     |
| New high (later)   | 0     |
| Total rounds       | 3     |

### Plan Review
| Metric             | Count |
|--------------------|-------|
| Initial high       | 1     |
| Resolved high      | 2     |
| Unresolved high    | 1     |
| New high (later)   | 2     |
| Total rounds       | 4     |

### Impl Review
| Metric             | Count |
|--------------------|-------|
| Initial high       | 1     |
| Resolved high      | 1     |
| Unresolved high    | 0     |
| New high (later)   | 0     |
| Total rounds       | 1     |

## Spec Coverage

| # | Criterion (summary) | Covered? | Mapped Files |
|---|---------------------|----------|--------------|
| 1 | specflow-analyze がプロジェクト情報を JSON 収集 | Yes | bin/specflow-analyze |
| 2 | /specflow.readme で Claude が README.md を生成 | Yes | global/commands/specflow.readme.md |
| 3 | 既存 README は diff 表示後にユーザー承認で適用 | Yes | global/commands/specflow.readme.md (Step 3) |
| 4 | 新規プロジェクトでは README.md を新規作成 | Yes | global/commands/specflow.readme.md (Step 2/3) |
| 5 | tech stack に応じた shields.io バッジ | Yes | global/commands/specflow.readme.md (Badge Rules) |
| 6 | 絵文字付きセクション見出し | Yes | global/commands/specflow.readme.md (Emoji) |
| 7 | specflow-analyze 単体でも JSON 出力利用可能 | Yes | bin/specflow-analyze |
| 8 | エビデンスベース生成（推測で埋めない） | Yes | global/commands/specflow.readme.md (Grounding Policy) |
| 9 | OpenSpec 非依存 | Yes | bin/specflow-analyze (optional openspec/) |

**Coverage Rate**: 9/9 (100%)

## Remaining Risks

- R3-F01 (plan): 改善対象セクション直下の手書き本文が上書きされうる (severity: high) — ユーザーが実装進行を選択
- R4-F01 (plan): Protected blocks の位置が移動する可能性 (severity: medium)
- R1-F05 (impl): No test coverage for specflow-analyze (severity: medium) — deferred to manual verification
- R3-F01 (spec): Install/Usage sections can require guessed commands (severity: medium)
- R3-F02 (spec): GitHub Actions badge rule can generate broken badges (severity: medium)

## Human Checkpoints

- [ ] `specflow-analyze` を実際のプロジェクト（Node.js, Rust, Go 等）で実行し、JSON 出力が正確か確認
- [ ] `/specflow.readme` で既存 README があるプロジェクトに対して実行し、ユーザー記述セクションが保持されるか確認
- [ ] jq が入っていない環境で `specflow-analyze` のフォールバック JSON 出力が有効な JSON か検証
- [ ] 生成された shields.io バッジ URL がブラウザで正しくレンダリングされるか確認
