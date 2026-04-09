# validate-command-syntax Specification

## Purpose
TBD - created by archiving change fix-validate-option. Update Purpose after archive.
## Requirements
### Requirement: specflow commands SHALL use correct openspec validate syntax
specflow コマンドファイル内の `openspec validate` 呼び出しは、位置引数 `[item-name]` と `--type change` オプションを使用しなければならない（MUST）。`--change` オプションは `openspec validate` ではサポートされていない。

正しい構文: `openspec validate "<CHANGE_ID>" --type change --json`

#### Scenario: specflow.md の validate ステップが正しい構文を使用する
- **WHEN** `/specflow` フローの Step 6: Validate が実行される
- **THEN** `dist/package/global/commands/specflow.md` 内の validate コマンドは `openspec validate "<CHANGE_ID>" --type change --json` の形式である

#### Scenario: specflow.design.md の validate ステップが正しい構文を使用する
- **WHEN** `/specflow.design` フローの Step 4: Validate が実行される
- **THEN** `dist/package/global/commands/specflow.design.md` 内の validate コマンドは `openspec validate "<CHANGE_ID>" --type change --json` の形式である
