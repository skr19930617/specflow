## Context

`/specflow.approve` コマンド（`global/commands/specflow.approve.md`）は現在以下の順序で実行される:

1. Step 0.5: Read Current Phase Context
2. Quality Gate
3. Approval Summary Generation
4. Commit (`git add -A` → `git commit`)
5. Push & Pull Request
6. Archive (`openspec archive`)

この順序では、Archive が Commit の後に行われるため、コミット diff には archive 前の openspec artifacts（`openspec/changes/<id>/` 配下のファイル群）がそのまま残った状態で含まれる。

## Goals / Non-Goals

**Goals:**
- Archive セクションを Approval Summary Generation の後、Commit の前に移動する
- Archive 失敗時も commit 以降のフローを継続可能にする（非ブロッキング）

**Non-Goals:**
- Archive コマンド自体の動作変更
- Approval Summary の生成ロジック変更
- Commit / Push / PR 作成ロジックの変更

## Decisions

### Decision 1: Archive の配置位置

**選択:** Approval Summary Generation の直後、Commit の直前に配置する。

**理由:**
- Approval Summary は archive 前に生成する必要がある（`openspec/changes/<id>/` 配下のファイルを参照するため）
- Archive 後に Commit することで、diff に archive 済みの状態が反映される
- **代替案: Commit の直後に配置** → 却下。現状の問題（archive 前の artifacts がコミットに含まれる）が解決しない

### Decision 2: Archive 失敗時のエラーハンドリング

**選択:** 警告を表示して commit 以降のフローを続行する（非ブロッキング）。

**理由:**
- Archive はメタデータ管理の操作であり、実装コードの品質には影響しない
- Archive 失敗で commit が止まると、レビュー済みの実装がデプロイできなくなる
- **代替案: Archive 失敗時に中止** → 却下。ユーザーへの影響が大きすぎる
- **代替案: ユーザーに確認** → 却下。過剰なインタラクション

### Decision 3: 実装方法

**選択:** `specflow.approve.md` 内の Archive セクションを物理的に Commit セクションの前に移動し、エラーハンドリングの記述を更新する。

**理由:**
- 変更対象は単一のマークダウンファイル（コマンド定義）のみ
- セクションの移動と説明文の更新で完結する

## Risks / Trade-offs

- **[Risk] Approval Summary が archive 後のパスを参照できない** → Mitigation: Approval Summary は Archive 前に生成されるため影響なし（設計上の配置順序で回避済み）
- **[Risk] Archive 失敗時の commit に archive 前の artifacts が含まれる** → Mitigation: 警告メッセージで状況を明示し、手動 archive を促す
