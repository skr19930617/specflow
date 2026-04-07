# Spec Delta: Workflow Migration

**Parent Change**: migrate-specflow-to-openspec
**Status**: Draft
**Baseline**: Current specflow commands in `global/commands/specflow*.md`

---

## MODIFIED Requirements

### M-01: Spec generation workflow

specflow の spec 生成フローが `.specify/scripts/bash/check-prerequisites.sh` を呼び出して `FEATURE_DIR` / `FEATURE_SPEC` を解決している。
これを `openspec/changes/<id>/` を直接参照する方式に置き換える。

**Before**: `check-prerequisites.sh --json --paths-only` → JSON parse → `FEATURE_DIR`, `FEATURE_SPEC`, `BRANCH`
**After**: change id からパスを静的に構築 → `openspec/changes/<id>/proposal.md` の存在で検証

**Scenario M-01-1**: `/specflow` を実行すると、`.specify/` を参照せず `openspec/changes/<id>/` 配下に spec 成果物を生成する。

**Scenario M-01-2**: `openspec/changes/<id>/` が存在しない場合、ディレクトリを自動作成して処理を続行する。

---

### M-02: Prompt / command lookup workflow

コマンドファイルの Prerequisites セクションが `.specify/scripts/bash/check-prerequisites.sh` の存在確認を前提としている。
この前提を除去し、`openspec/config.yaml` の存在またはコマンド引数のみで動作するようにする。

**Before**: `ls .specify/scripts/bash/check-prerequisites.sh` → 失敗時エラー終了
**After**: Prerequisites チェックを `openspec/config.yaml` の存在確認に変更。不在時は初期化ガイドを表示。

**Scenario M-02-1**: `.specify/` が存在しないリポジトリで `/specflow.plan` を実行すると、`openspec/config.yaml` の存在を確認し、正常に動作する。

**Scenario M-02-2**: `openspec/config.yaml` が存在しないリポジトリで `/specflow` を実行すると、OpenSpec 初期化ガイドを表示して終了する。

---

### M-03: Artifact read/write location

すべての成果物（spec, plan, tasks, review-ledger, current-phase, approval-summary）の読み書き先を統一する。

**Before**: `FEATURE_DIR`（`check-prerequisites.sh` が返す動的パス。実態は `specs/<number>-<name>/` または `openspec/changes/<id>/`）
**After**: `openspec/changes/<id>/` 固定。`FEATURE_DIR` 変数は `openspec/changes/<id>` に静的解決。

**Scenario M-03-1**: `/specflow.impl_review` が `review-ledger.json` を書き込む先が `openspec/changes/<id>/review-ledger.json` である。

**Scenario M-03-2**: `/specflow.approve` が `approval-summary.md` を書き込む先が `openspec/changes/<id>/approval-summary.md` である。

**Scenario M-03-3**: `/specflow.dashboard` がスキャンするディレクトリが `openspec/changes/*/` のみである。

---

## REMOVED Requirements

### R-01: `.specify/` directory dependency

`.specify/` ディレクトリおよびその配下のスクリプト・テンプレートへの参照をすべて除去する。

対象:
- `check-prerequisites.sh` の呼び出し（全コマンドの Prerequisites + Setup セクション）
- `.specify/` を前提としたパス解決ロジック
- `git add` / `git diff` の `.specify/` 除外パターン（除外対象自体が消えるため不要）

**Scenario R-01-1**: 全 `global/commands/specflow*.md` ファイルに `.specify` への文字列参照が含まれない。

---

### R-02: `specs/` legacy directory as artifact location

`specs/<number>-<name>/` 形式のレガシーディレクトリを成果物の格納先として使用しない。
既存の `specs/` 配下は削除対象とする。`openspec/specs/` は削除対象に含めない。

**Scenario R-02-1**: リポジトリのトップレベルに `specs/` ディレクトリが存在しない。

**Scenario R-02-2**: `openspec/specs/` ディレクトリは残存している。

---

### R-03: spec-kit / specy naming references

CLAUDE.md およびコマンドファイルから spec-kit、speckit、specy への言及を除去する。

**Scenario R-03-1**: `CLAUDE.md` に `spec-kit`、`speckit`、`specy`、`.specify` の文字列が含まれない。

**Scenario R-03-2**: `global/commands/` 配下のすべての `.md` ファイルに `speckit`、`specy` の文字列が含まれない。

---

## ADDED Requirements

### A-01: Change ID resolution

コマンド実行時に change id を解決するルールを定義する。

1. コマンド引数で明示された場合 → そのまま使用
2. 現在の git branch 名から推定（`<id>` 部分を抽出）
3. `openspec/changes/` 配下に一致するディレクトリが見つからない場合 → エラー終了

**Scenario A-01-1**: branch `migrate-specflow-to-openspec` で `/specflow.plan` を実行すると、`openspec/changes/migrate-specflow-to-openspec/` を自動解決する。

**Scenario A-01-2**: branch `main` で change id 引数なしに `/specflow.impl` を実行すると、change id を解決できずエラーメッセージを表示する。
