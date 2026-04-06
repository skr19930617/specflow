# Implementation Plan: speckit時代のレガシー排除

**Branch**: `021-remove-speckit-legacy` | **Date**: 2026-04-07 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/021-remove-speckit-legacy/spec.md`

## Summary

プロジェクト全体から「speckit」への参照を排除し、specflow ブランドに統一する。speckit.* スラッシュコマンドを specflow.* に統合し、マイグレーション関連ファイルを全削除し、全ドキュメント・履歴ファイルの speckit 参照を更新する。約78ファイル・300+箇所の変更。

## Technical Context

**Language/Version**: Bash (POSIX + bashisms), Markdown  
**Primary Dependencies**: Claude Code CLI, specflow slash commands, GitHub CLI (gh)  
**Storage**: File-based (Markdown, JSON, shell scripts)  
**Testing**: grep 検証 + specflow ワークフロー動作確認  
**Target Platform**: macOS/Linux (Claude Code CLI 環境)  
**Project Type**: CLI tooling / developer workflow  
**Performance Goals**: N/A (ファイル操作のみ)  
**Constraints**: .specify/ ディレクトリ名は維持、npm パッケージ名等の外部依存は変更不可  
**Scale/Scope**: 78ファイル、300+箇所の参照変更 + ファイル/ディレクトリ削除

## Constitution Check

*Constitution ファイルはテンプレートのままのため、ゲートチェックはスキップ。*

## Project Structure

### Documentation (this feature)

```text
specs/021-remove-speckit-legacy/
├── plan.md              # This file
├── research.md          # Codebase audit results
├── spec.md              # Feature specification
├── current-phase.md     # Phase tracking
├── review-ledger-spec.json  # Spec review ledger
└── tasks.md             # Task list (next step)
```

### Source Code (repository root)

```text
# 変更対象ファイル群
.claude/commands/
├── speckit.*.md (9 files) → specflow.*.md にリネーム/統合

global/
├── specflow.*.md (12 files) → speckit 参照を更新

.specify/
├── scripts/bash/check-prerequisites.sh → speckit 参照更新
├── templates/*.md → speckit 参照更新
└── init-options.json → speckit_version 確認

bin/
├── specflow-init → speckit 参照更新
└── specflow-migrate-openspec.sh → 削除

template/
├── CLAUDE.md → speckit 参照更新

# 削除対象
specs/020-openspec-migration/ → 全削除
openspec/changes/020-openspec-migration/ → 全削除
```

**Structure Decision**: 既存ファイルの変更・削除のみ。新規ファイル作成なし。

## Implementation Phases

### Phase 1: コマンドファイルのリネーム・統合

**目的**: speckit.* スラッシュコマンドを specflow.* に統合する

1. `.claude/commands/speckit.specify.md` → `.claude/commands/specflow.specify.md` にリネーム、内容の speckit 参照を更新
2. `.claude/commands/speckit.clarify.md` → `.claude/commands/specflow.clarify.md` にリネーム、内容更新
3. `.claude/commands/speckit.tasks.md` → `.claude/commands/specflow.tasks.md` にリネーム、内容更新
4. `.claude/commands/speckit.analyze.md` → `.claude/commands/specflow.analyze.md` にリネーム、内容更新
5. `.claude/commands/speckit.checklist.md` → `.claude/commands/specflow.checklist.md` にリネーム、内容更新
6. `.claude/commands/speckit.constitution.md` → `.claude/commands/specflow.constitution.md` にリネーム、内容更新
7. `.claude/commands/speckit.taskstoissues.md` → `.claude/commands/specflow.taskstoissues.md` にリネーム、内容更新
8. `speckit.plan.md` の内容を `global/specflow.plan.md` に統合し、`speckit.plan.md` を削除
9. `speckit.implement.md` の内容を `global/specflow.impl.md` に統合し、`speckit.implement.md` を削除

### Phase 2: グローバルコマンド参照の更新

**目的**: specflow.* コマンドファイル内の speckit.* 呼び出しを新名称に更新

1. `global/specflow.md` — speckit.specify, speckit.clarify 等の呼び出しを specflow.specify, specflow.clarify に更新
2. `global/specflow.plan.md` — speckit.plan, speckit.tasks の呼び出しを更新（Phase 1 で統合した内容を反映）
3. `global/specflow.impl.md` — speckit.implement の呼び出しを更新（Phase 1 で統合した内容を反映）
4. 残りの `global/specflow.*.md` ファイル — speckit への全参照を specflow に更新

### Phase 3: .specify/ 内部の更新

**目的**: specflow ランタイムが依存する .specify/ 内のファイルを更新

1. `.specify/scripts/bash/check-prerequisites.sh` — エラーメッセージ内の "speckit" を更新
2. `.specify/templates/plan-template.md` — speckit.plan, speckit.tasks 参照を更新
3. `.specify/templates/` 配下の他テンプレート — speckit 参照を更新
4. `.specify/init-options.json` — `speckit_version` キー名の確認と更新（外部依存でなければ）

### Phase 4: ドキュメントの更新

**目的**: ユーザー向けドキュメントからレガシー参照を排除

1. `README.md` — speckit 参照を全て specflow に更新
2. `CLAUDE.md` — Active Technologies セクションの feature 別履歴エントリを全削除し、現行スタックのみ記載。speckit 参照を更新
3. `template/CLAUDE.md` — speckit 参照を更新
4. `openspec/README.md` — migration 関連参照を削除

### Phase 5: 履歴ファイルの更新

**目的**: 過去の feature 履歴ファイルの speckit 参照を更新

1. `specs/*/review-ledger*.json` — speckit 参照を更新
2. `specs/*/approval-summary.md` — speckit 参照を更新
3. `specs/*/current-phase.md` — speckit 参照を更新
4. `openspec/changes/*/` — 過去の change records 内の speckit 参照を更新
5. `specs/*/spec.md`, `specs/*/plan.md`, `specs/*/tasks.md` — speckit 参照を更新

### Phase 6: マイグレーション関連の削除

**目的**: マイグレーション専用ファイル・ディレクトリの完全除去

1. `bin/specflow-migrate-openspec.sh` を削除
2. `specs/020-openspec-migration/` ディレクトリを全削除
3. `openspec/changes/020-openspec-migration/` ディレクトリを全削除

### Phase 7: 検証

**目的**: 全変更の完了と正常動作を検証

1. `grep -r "speckit" --include="*.md" --include="*.json" --include="*.sh" . --exclude-dir=.git --exclude-dir=specs/021-remove-speckit-legacy` で 0 件を確認
2. specflow ワークフローの動作確認（/specflow コマンドの起動テスト）
3. bin/specflow-init が正常動作することを確認

## Risk Analysis

| リスク | 影響 | 軽減策 |
|--------|------|--------|
| コマンド統合時の参照漏れ | ワークフロー破損 | Phase 7 で全コマンドの動作確認 |
| .specify/ 内の変更で speckit ランタイムが壊れる | specflow 全体が動作不能 | 変更前に現状の動作を確認、段階的に変更 |
| 履歴ファイル更新時のJSON破損 | ledger 参照不能 | JSON lint で検証 |
| 他ブランチとの競合 | マージ困難 | main ブランチとの差分を最小化 |

## Complexity Tracking

本タスクは新機能開発ではなくクリーンアップのため、複雑性は低い。ただし変更箇所が多い（78ファイル）ため、漏れのリスクに注意が必要。
