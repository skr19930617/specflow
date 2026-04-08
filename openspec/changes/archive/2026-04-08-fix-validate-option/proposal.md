## Why

specflow の validate ステップで `openspec validate --change "<CHANGE_ID>" --json` を実行すると `error: unknown option '--change'` エラーが発生する（[#62](https://github.com/skr19930617/specflow/issues/62)）。`openspec validate` は `--change` オプションを持たず、位置引数 `[item-name]` と `--type <type>` を使用する設計になっている。他の openspec サブコマンド（`instructions`, `status`）は `--change` をサポートしているため、不整合が生じている。

## What Changes

- specflow コマンドファイル内の `openspec validate --change "<CHANGE_ID>" --json` を正しい構文 `openspec validate "<CHANGE_ID>" --type change --json` に修正
- 影響ファイル:
  - `global/commands/specflow.md` (Step 6: Validate)
  - `global/commands/specflow.design.md` (Step 4: Validate)

## Capabilities

### New Capabilities

なし

### Modified Capabilities

なし（既存の spec-level な要件変更はなく、コマンド引数の修正のみ）

## Impact

- `global/commands/specflow.md` — validate コマンドの引数を修正
- `global/commands/specflow.design.md` — validate コマンドの引数を修正
- ユーザーへの影響: `/specflow` および `/specflow.design` フロー内の validate ステップが正常に動作するようになる
