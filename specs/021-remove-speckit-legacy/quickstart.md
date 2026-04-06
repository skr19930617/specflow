# Quickstart: speckit時代のレガシー排除

## 概要

プロジェクト全体から speckit 参照を排除し specflow に統一するクリーンアップタスク。

## 実装手順

1. **コマンドリネーム**: `.claude/commands/speckit.*.md` → `specflow.*.md`
2. **参照更新**: `global/*.md` 内の speckit.* 呼び出しを specflow.* に変更
3. **.specify/ 更新**: テンプレート・スクリプト内の speckit 参照を更新
4. **ドキュメント更新**: README.md, CLAUDE.md の speckit 参照を排除
5. **履歴更新**: specs/ と openspec/changes/ の履歴ファイルを更新
6. **削除**: migration スクリプトとディレクトリを削除
7. **検証**: grep で speckit 参照 0 件を確認、ワークフロー動作確認

## 検証コマンド

```bash
# speckit 参照の検索（0件であること）
grep -r "speckit" --include="*.md" --include="*.json" --include="*.sh" . \
  --exclude-dir=.git --exclude-dir=specs/021-remove-speckit-legacy

# migration ファイルが存在しないこと
ls bin/specflow-migrate-* 2>/dev/null  # 結果なし
ls -d specs/020-openspec-migration 2>/dev/null  # 結果なし
```
