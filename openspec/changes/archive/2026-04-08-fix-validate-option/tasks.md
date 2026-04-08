## 1. コマンドファイル修正

- [x] 1.1 `global/commands/specflow.md` の Step 6: Validate 内の `openspec validate --change "<CHANGE_ID>" --json` を `openspec validate "<CHANGE_ID>" --type change --json` に修正
- [x] 1.2 `global/commands/specflow.design.md` の Step 4: Validate 内の `openspec validate --change "<CHANGE_ID>" --json` を `openspec validate "<CHANGE_ID>" --type change --json` に修正

## 2. 検証

- [x] 2.1 修正後の構文で `openspec validate` コマンドが正常に動作することを確認
