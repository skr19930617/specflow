# Research: Review Ledger for Impl Review Loop

## R1: specflow コマンドの実装形態

**Decision**: 全 ledger ロジックを Claude Code slash command のプロンプト内で実装する
**Rationale**: specflow は Bash スクリプト + Claude Code プロンプトで構成されており、外部ランタイム（Node.js, Python）への依存はない。Claude Code は JSON の読み書き・解析・操作を Read/Write ツールで直接実行可能。
**Alternatives considered**:
- Bash スクリプト (`bin/specflow-update-ledger`): JSON パース・マッチングが bash では複雑すぎる。jq 依存を追加することになる。却下。
- Python スクリプト: 新しい依存を追加することになる。specflow の設計哲学（外部依存最小化）に反する。却下。

## R2: Codex review 出力フォーマット

**Decision**: 既存の review_impl_prompt.txt の JSON スキーマを変更しない
**Rationale**: Codex が返す `findings[]` の各要素は `{id, severity, category, file, title, detail}` フォーマット。これは ledger の finding レコードに必要な情報（severity, category, file, title, detail）をすべて含んでいる。`id` は Codex 側の一時 ID（F1, F2...）であり、ledger 用の `R{round}-F{seq}` ID に変換する。
**Alternatives considered**:
- Codex に追加フィールドを要求: review_impl_prompt.txt の変更が必要。他プロジェクトとの互換性が崩れる。却下。

## R3: Finding マッチングの精度

**Decision**: `file` + `category` + `severity` の完全一致 + `title` 正規化フォールバック
**Rationale**: Codex review は毎回独立に実行されるため、finding ID の永続性はない。file + category + severity の 3 キーで大半のケースをカバーできる。同一キーの複数 finding は title でディスアンビギュエーションし、それでもマッチしない場合は出現順ペアリング。決定論的で実装がシンプル。
**Alternatives considered**:
- LLM ベースのセマンティックマッチング: 毎回 API コールが必要。コスト・遅延・非決定論的。却下。
- Codex に前回 findings を渡して差分を判定させる: review_impl_prompt の大幅変更が必要。Codex のコンテキストを圧迫。却下。

## R4: JSON バリデーションと破損復旧

**Decision**: Claude Code の Read ツールで読み込み、JSON.parse 相当の処理をプロンプト内で実行。パース失敗時はエラー表示し、ユーザーに手動復旧を促す
**Rationale**: 自動バックアップ・復旧は複雑性を増す割に、破損の頻度は低い（手動編集ミスのみ）。シンプルにエラー報告 + 新規作成オプション提供で十分。
**Alternatives considered**:
- .bak ファイルの自動作成: ファイル増殖の懸念。必要性が低い。却下。
