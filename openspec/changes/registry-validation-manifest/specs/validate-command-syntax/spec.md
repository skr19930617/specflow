## MODIFIED Requirements

### Requirement: specflow commands SHALL use correct openspec validate syntax
specflow コマンドファイル内の `openspec validate` 呼び出しは、位置引数 `[item-name]` と `--type change` オプションを使用しなければならない（MUST）。`--change` オプションは `openspec validate` ではサポートされていない。

正しい構文: `openspec validate "<CHANGE_ID>" --type change --json`

Additionally, the registry validation pipeline SHALL invoke `openspec validate` as one of its consistency checks, ensuring command syntax validation runs as part of the unified `npm run validate:registry` step.

#### Scenario: specflow.md の validate ステップが正しい構文を使用する
- **WHEN** `/specflow` フローの Step 6: Validate が実行される
- **THEN** `dist/package/global/commands/specflow.md` 内の validate コマンドは `openspec validate "<CHANGE_ID>" --type change --json` の形式である

#### Scenario: specflow.design.md の validate ステップが正しい構文を使用する
- **WHEN** `/specflow.design` フローの Step 4: Validate が実行される
- **THEN** `dist/package/global/commands/specflow.design.md` 内の validate コマンドは `openspec validate "<CHANGE_ID>" --type change --json` の形式である

#### Scenario: Registry validation includes command syntax check
- **WHEN** `npm run validate:registry` is executed
- **THEN** the validation pipeline SHALL verify that all command files using `openspec validate` follow the correct syntax pattern
