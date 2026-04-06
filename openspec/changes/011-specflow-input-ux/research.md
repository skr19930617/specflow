# Research: specflow 起動時の入力形式改善

## R1: AskUserQuestion の制約と代替方法

**Decision**: AskUserQuestion を使用せず、テキスト案内メッセージ + ユーザーの次メッセージ待ちで入力を受け取る

**Rationale**: AskUserQuestion はボタンオプションが最低 2 個必須（API 仕様）。フリーテキスト入力のみの UI は実現不可。テキスト案内方式ならスラッシュコマンドの Markdown 内で自然に記述でき、ユーザーは通常のメッセージ入力で URL や仕様を送信できる。

**Alternatives considered**:
- ダミーボタン方式: AskUserQuestion に「URL を入力」「仕様を入力」のボタンを置き、Other で入力。→ 現状と同じ違和感が残る。却下。
- 2 ボタン方式: 目的別にボタンを分けて Other 入力。→ 1 ステップ多い。却下。

## R2: 入力テキストの分類ロジック

**Decision**: 正規表現 `https?://[^/]+/[^/]+/[^/]+/issues/\d+` に一致 → issue URL、それ以外 → インライン仕様記述

**Rationale**: GitHub issue URL は `https://github.com/<owner>/<repo>/issues/<number>` の形式。GitHub Enterprise も `https://<host>/<owner>/<repo>/issues/<number>` で同じパターン。シンプルな正規表現で十分に判定可能。

**Alternatives considered**:
- URL 全般を検出して種類別に分岐: 複雑になる。issue URL 以外はインライン仕様として扱えば十分。
- `gh issue view` で URL 検証: ネットワーク依存。判定は正規表現で行い、取得時にエラーハンドリングする方が効率的。

## R3: specflow.md の Step 1 書き換え方法

**Decision**: 既存の Step 1（AskUserQuestion でボタン表示）をテキスト案内方式に書き換える。分岐ロジックを明記する。

**Rationale**: 変更対象は `global/specflow.md` の Step 1 セクションのみ。他の Step（2〜5）は入力テキストを受け取った後の処理なので影響なし。

**Alternatives considered**:
- 新しいコマンドファイルを作成: 不要。既存ファイルの修正で十分。
- シェルスクリプトに分類ロジックを外出し: Markdown コマンドファイル内の指示で十分。スクリプト化は過剰。

## R4: インライン仕様記述時の後続フロー

**Decision**: インライン仕様記述の場合、Step 2（issue 取得）をスキップし、テキストを feature description として Step 3（specflow.specify）に直接渡す

**Rationale**: specflow.specify は feature description テキストを入力として受け取る設計。issue 本文もテキストとして渡されるため、インライン仕様もそのまま渡せる。issue メタデータ（番号、ラベル等）は spec 作成に必須ではない。

**Alternatives considered**:
- issue なしの場合は specflow を使わず specflow.specify を直接呼ぶ: ユーザーに別コマンドを覚えさせる。UX 改善の趣旨に反する。却下。
