## Why

各 phase の手順（入力・出力アーティファクト、呼ぶべき CLI、ユーザー判断ポイント）がすべて `src/contracts/command-bodies.ts` の自然言語 Markdown テンプレートに埋め込まれている。Server が決定的オーケストレーターとして動くためには、これらをプログラマブルなデータ構造 (`PhaseContract`) として定義し、Markdown ガイドはそこから生成する形に逆転させる必要がある。

依存: #128 (RunState split) 完了済み。Epic: #127。

## What Changes

- 既存の `PhaseContract` 型 (`src/lib/phase-router/types.ts`) を拡張し、router フィールド (`next_action`, `gated`, `terminal`) と新しい execution フィールド (`requiredInputs`, `producedOutputs`, `cliCommands`, `agentTask`, `gatedDecision`) を**単一型に統合**する
- `PhaseContract` の正規定義場所を `src/contracts/phase-contract.ts` に移動する。`src/lib/phase-router/types.ts` は re-export のみ。router も command-bodies もここから import する
- サブ型 (`ArtifactRef`, `CliStep`, `AgentTaskSpec`, `GatedDecisionSpec`) を最小限の型として定義する（後続 PR で拡張可能）
  - `AgentTaskSpec` = `{ agent: string; description: string }`
  - `GatedDecisionSpec` = `{ options: string[]; advanceEvents: Record<string, string> }`
- `command-bodies.ts` の各 phase 手順のうち**構造化可能な部分** (CLI コマンド、入出力アーティファクト、ゲート判定) を `PhaseContract[]` レジストリとして構造化する。散文的なガイダンスは引き続き Markdown テンプレートとして保持する
- `PhaseContract → Markdown` 変換器を本 PR で実装する。構造化データから Markdown セクションを生成し、散文テンプレートと合成する
- `phase-router` を新フィールド活用へ書き換える（import パス変更 + 新 execution フィールドの参照）
- Markdown 同等性テストはセマンティック比較（セクション見出し、CLI コマンド、ゲート条件の一致。空白・改行差異は許容）

## Capabilities

### New Capabilities
- `phase-contract-types`: `PhaseContract` 統合型・サブ型の定義、`PhaseContract[]` レジストリの構築、`PhaseContract → Markdown` 変換器の実装

### Modified Capabilities
- `slash-command-guides`: Markdown ガイド生成を `PhaseContract` ベースに切り替え。構造化データ部分は `PhaseContract` から動的生成し、散文テンプレートと合成する
- `phase-router`: `PhaseContract` 型定義の import 先を `src/contracts/phase-contract.ts` に変更し、新しい execution フィールドも活用するようリファクタリング

## Impact

- `src/contracts/phase-contract.ts` — 新規: `PhaseContract` 統合型・サブ型・レジストリ・変換器
- `src/contracts/command-bodies.ts` — 大幅リファクタリング: 構造化可能部分を `PhaseContract` データに移行
- `src/lib/phase-router/types.ts` — `PhaseContract` を `src/contracts/phase-contract.ts` から re-export する形に変更
- `src/lib/phase-router/router.ts`, `derive-action.ts` — 新 execution フィールド活用へ書き換え
- 既存テスト — Markdown セマンティック同等性テスト追加、router テスト更新
- ビルドパイプライン — 新しい型エクスポートの追加
