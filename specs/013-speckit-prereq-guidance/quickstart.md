# Quickstart: speckit 前提条件チェック時のガイダンス改善

## 概要

specflow コマンドの Prerequisites セクションに含まれるエラーメッセージを改善し、ユーザーが次に取るべきアクションを明確にする。

## 変更パターン

### 短縮形式（9 ファイル）の変更

**Before:**
```markdown
## Prerequisites

1. Run `ls .specflow/config.env` via Bash. If missing → **STOP**.
2. Run `ls .specify/scripts/bash/check-prerequisites.sh` via Bash. If missing → **STOP**.
3. Run `source .specflow/config.env` via Bash.
```

**After:**
```markdown
## Prerequisites

1. Run `ls .specflow/config.env` via Bash to confirm `.specflow/` exists.
   - If missing:
     ```
     ❌ `.specflow/config.env` が見つかりません。

     次のステップで初期化してください:
     1. `/specflow.setup` を実行
     2. `/specflow` を再度実行
     ```
     → **STOP**.
2. Run `ls .specify/scripts/bash/check-prerequisites.sh` via Bash to confirm speckit is installed.
   - If missing:
     ```
     ❌ speckit が見つかりません。

     次のステップでインストールしてください:
     1. `npx specy init` を実行
     2. `/specflow` を再度実行
     ```
     → **STOP**.
3. Run `source .specflow/config.env` via Bash to load project config.
```

### 詳細形式（specflow.md）の変更

specflow.md は既にエラーメッセージを含むが、ステップ形式に更新する。

### README.md の変更

Prerequisites セクションを追加し、Failure State → Command Mapping を記載する。

## 検証方法

1. speckit がない環境で `/specflow` を実行 → `npx specy init` が案内されるか確認
2. `.specflow/config.env` がない環境で `/specflow` を実行 → `/specflow.setup` が案内されるか確認
3. README の手順通りに実行してセットアップが完了するか確認
