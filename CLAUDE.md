## Specification Workflow Rules

- このリポジトリの仕様管理は OpenSpec を正本とする。
- 現行仕様の正本は `openspec/specs/` のみ。
- 変更提案と作業中成果物は `openspec/changes/<change-id>/` に配置する。
- `/specflow.*` コマンドは OpenSpec ベースのワークフローとして扱う。
- コマンドやスクリプトは、成果物の read/write 先を `openspec/changes/<change-id>/` に統一する。
- `openspec/specs/` は current spec の source of truth であり、明示的な変更タスクがない限り直接編集しない。
- 各作業では、最初に「触るファイル」と「今回触らない範囲」を列挙する。
