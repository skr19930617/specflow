# Research: speckit 前提条件チェック時のガイダンス改善

## R1: 影響範囲 — 前提条件チェックを含むファイル一覧

**Decision**: 以下の 10 ファイルの Prerequisites セクションを修正対象とする

**Rationale**: grep 調査の結果、`global/` ディレクトリ内の全 specflow コマンドファイルが同一フォーマットの Prerequisites セクションを持つ。`.claude/commands/` 配下の speckit コマンドは `check-prerequisites.sh` を呼び出すだけで独自のエラーメッセージを持たないため対象外。

**対象ファイル（3行形式の Prerequisites セクション）:**
1. `global/specflow.md` — 詳細形式（エラーメッセージ付き）
2. `global/specflow.plan.md` — 短縮形式
3. `global/specflow.spec_fix.md` — 短縮形式
4. `global/specflow.plan_fix.md` — 短縮形式
5. `global/specflow.impl.md` — 短縮形式 + config 読み取り
6. `global/specflow.fix.md` — 短縮形式
7. `global/specflow.spec_review.md` — 短縮形式
8. `global/specflow.plan_review.md` — 短縮形式
9. `global/specflow.impl_review.md` — 短縮形式 + config 読み取り
10. `global/specflow.approve.md` — check-prerequisites.sh 経由（Step 0.5 内）

**対象外:**
- `.claude/commands/speckit.*.md` — `check-prerequisites.sh` 経由で呼び出すため、独自エラーメッセージなし
- `.specify/scripts/bash/check-prerequisites.sh` — speckit 側スクリプト、本プロジェクトの修正対象外

## R2: 現在のエラーメッセージ

**Failure State 1（speckit 未インストール）:**
- 短縮形式: `If missing → **STOP**.`（メッセージなし）
- 詳細形式（specflow.md）: `"speckit が見つかりません。speckit をインストールしてから再度実行してください。"`

**Failure State 2（specflow 未初期化）:**
- 短縮形式: `If missing → **STOP**.`（メッセージなし）
- 詳細形式（specflow.md）: `".specflow/config.env が見つかりません。先に specflow-init を実行してください。"`

## R3: README の現状

**Decision**: README.md に Prerequisites セクションを追加する

**Rationale**: 現在の README は `gh`, `claude`, `git`, `jq`, `speckit`, `codex` のインストールに言及しているが、`npx specy init` や `/specflow.setup` の具体的なフロー、failure state と recovery command のマッピングは記載されていない。

**Alternatives considered**: 
- 別途 SETUP.md を作成 → 不採用（README に一元化する方がシンプル）
