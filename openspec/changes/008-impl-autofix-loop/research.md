# Research: impl フェーズ auto-fix loop

## Decision 1: Auto-fix loop の実装場所

**Decision**: specflow.impl.md のハンドオフセクションに auto-fix loop のエントリポイントを配置し、ループ本体のロジックは specflow.impl.md 内に inline で記述する。specflow.fix.md はループの 1 ラウンド分の fix → re-review を実行する既存コマンドとしてそのまま呼び出す。

**Rationale**: specflow.impl.md はレビュー後のハンドオフを制御しており、ここが自動ループの開始判定を行う自然な場所。specflow.fix.md は既に fix → re-review の 1 サイクルを完結させるため、ループの各ラウンドで再利用可能。

**Alternatives considered**:
- 新しい specflow.autofix.md を作成 → 既存のフローに追加のジャンプが必要になり複雑化
- specflow.fix.md にループロジックを内蔵 → fix は単独でも呼ばれるため、ループ責務と混在するのは不適切

## Decision 2: ループ状態の管理方法

**Decision**: review-ledger.json の既存スキーマ（`current_round`, `findings[]`, `round_summaries[]`）をそのままループ状態の管理に使用する。追加のループ状態ファイルは作成しない。

**Rationale**: review-ledger.json は既にラウンド情報、finding の title/severity/status を保持しており、auto-fix loop の判定に必要な全データが揃っている。round_summaries の by_severity で重み付けスコアも算出可能。

**Alternatives considered**:
- 別途 autofix-state.json を作成 → データの二重管理になり、同期の問題が生じる
- メモリ内のみで状態管理 → Claude Code のセッション/コンテキストに依存し、ロバスト性が低い

## Decision 3: 発散検知のタイミングと方式

**Decision**: 各ラウンドの re-review 完了後（ledger 更新後）、次ラウンドのハンドオフ前に発散検知を実行する。比較は直前ラウンドとの差分。初回ラウンドの基準は impl レビュー直後の ledger 状態。

**Rationale**: ledger 更新後であれば round_summaries と findings が最新状態であり、正確な比較が可能。ハンドオフ前に判定することで、不要な fix ラウンドを防止できる。

**Alternatives considered**:
- fix 前に判定 → fix の結果が反映されていないため判定精度が低い
- fix 後・review 前に判定 → review 結果がないため new high の検知ができない

## Decision 4: config.env の設定読み込み

**Decision**: specflow.impl.md の Prerequisites で既に `source .specflow/config.env` を実行している。`SPECFLOW_MAX_AUTOFIX_ROUNDS` はこの config.env に追加し、source 後に変数として利用可能にする。

**Rationale**: 既存の config.env メカニズムを再利用するのが最もシンプル。ユーザーはこのファイルを編集してカスタマイズ可能。

**Alternatives considered**:
- .specflow/autofix-config.json → JSON パースが必要で冗長
- 環境変数直指定 → プロジェクトポータビリティが低い

## Decision 5: ループフロー設計

**Decision**: specflow.impl.md のハンドオフセクションで、ledger の `status` が `has_open_high` の場合に auto-fix loop を開始する。各ラウンドは Skill ツールで specflow.fix を呼び出し、戻り値（ledger 更新後の状態）を読んで継続/停止を判定する。

**Rationale**: Skill ツールによる specflow.fix の呼び出しは、既存のハンドオフパターンと一致する。fix 完了後に ledger を読むことで、最新の finding 状態に基づく判定が可能。

**Alternatives considered**:
- specflow.fix の内容を直接 inline 展開 → コードの重複、メンテナンス性の低下
- ループ専用の別コマンドに委任 → 不要な抽象化レイヤー
