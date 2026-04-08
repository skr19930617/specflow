## Context

specflow のコマンドファイル（`global/commands/specflow.md` と `global/commands/specflow.design.md`）が `openspec validate --change "<CHANGE_ID>" --json` を実行しているが、`openspec validate` は `--change` オプションをサポートしていない。

OpenSpec CLI の validate コマンドは位置引数 `[item-name]` と `--type <type>` オプションを使用する設計:
```
openspec validate [item-name] --type change|spec --json
```

一方、`openspec instructions` と `openspec status` は `--change <id>` をサポートしており、validate だけが異なるインターフェースを持つ。

## Goals / Non-Goals

**Goals:**
- specflow コマンドファイル内の `openspec validate` 呼び出しを正しい構文に修正する
- `--type change` を明示的に指定して曖昧さを排除する

**Non-Goals:**
- OpenSpec CLI 側の validate コマンドのインターフェース変更
- validate 以外の openspec コマンド呼び出しの変更（instructions, status は正しく動作している）
- specflow のワークフローロジックの変更

## Decisions

### 修正対象と構文

**変更前:** `openspec validate --change "<CHANGE_ID>" --json`
**変更後:** `openspec validate "<CHANGE_ID>" --type change --json`

**理由:** `openspec validate --help` の出力に基づき、位置引数 + `--type` が正しい構文。`--type change` を明示することで、change 名が spec 名と重複した場合の曖昧さを防ぐ。

### 影響ファイル

| ファイル | 箇所 |
|----------|------|
| `global/commands/specflow.md` | Step 6: Validate |
| `global/commands/specflow.design.md` | Step 4: Validate |

2ファイル・各1箇所の修正のみ。

## Risks / Trade-offs

- **リスク:** 将来 OpenSpec CLI が `--change` オプションを validate にも追加した場合、この修正は冗長になるが害はない
  → 緩和策: 位置引数 + `--type` は現行の正式なインターフェースであり、後方互換性は保たれる
- **リスク:** 他にも同様の不整合があるコマンドが存在する可能性
  → 緩和策: 今回のスコープは validate のみ。他のコマンドは `--help` で確認済みで問題なし
