# Data Model: 015-global-prompt-install

## Entities

### Review Prompt File

本機能にはデータベースやスキーマの変更はない。対象はファイルシステム上のテキストファイルのみ。

| 属性 | 変更前 | 変更後 |
|------|--------|--------|
| 配置先 | `.specflow/review_*_prompt.txt` (プロジェクトローカル) | `global/review_*_prompt.md` (specflow リポジトリ) |
| 拡張子 | `.txt` | `.md` |
| 内容 | プレーンテキスト | Markdown（意味は保持） |

### Prompt ファイル一覧

| ファイル名（変更後） | 用途 |
|---------------------|------|
| `global/review_spec_prompt.md` | Spec レビュー prompt |
| `global/review_plan_prompt.md` | Plan/Tasks レビュー prompt |
| `global/review_impl_prompt.md` | 初回実装レビュー prompt |
| `global/review_impl_rereview_prompt.md` | 再レビュー prompt |

## 状態遷移

なし（prompt ファイルは静的な設定ファイル）

## リレーション

```
global/specflow.*.md (slash commands)
  └── reads → global/review_*_prompt.md (prompt files)
```

Slash commands が `Read` ツールで prompt を読み込み、Codex MCP に文字列として渡す。
