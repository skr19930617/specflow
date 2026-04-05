# Research: レビュー対象 Diff フィルタリング

## R1: git diff での完全削除・リネーム検出方法

**Decision**: `git diff --name-status` を使い、ステータスコードで判定する

**Rationale**:
- `D` ステータス = 完全削除ファイル（`deleted file mode`）
- `R100` ステータス = リネームのみ（similarity index 100%、内容変更なし）
- `R` の後の数値が similarity index。100 未満はリネーム + 内容変更のため除外対象外
- `git diff --diff-filter=D` で完全削除のみ、`--diff-filter=R` でリネームのみを抽出可能

**Alternatives considered**:
- diff 出力のパース（`deleted file mode` ヘッダ検出）: 正規表現パースが複雑でエラーしやすい
- `git status --porcelain`: ステージング状態に依存するため不適切

## R2: ファイル単位のフィルタリング後に git diff を再実行する方法

**Decision**: フィルタ後のファイルリストを `git diff -- <file1> <file2> ...` に渡す

**Rationale**:
- git diff はパスを引数として受け取り、指定ファイルのみの diff を出力する
- 既存の `:(exclude)` pathspec とも組み合わせ可能
- ファイル数が多い場合は xargs でバッチ処理可能だが、通常の変更規模では直接引数で十分

**Alternatives considered**:
- diff 出力を正規表現で分割・フィルタ: ファイル境界の検出が複雑（バイナリマーカー等）
- `--diff-filter` オプションのみ: カスタムパターン除外に対応できない

## R3: bash での fnmatch グロブマッチング

**Decision**: bash の `[[ $path == $pattern ]]` でパターンマッチングを行う

**Rationale**:
- bash の `==` 演算子は `extglob` 有効時にグロブパターンをサポート
- `*` はディレクトリ区切りを跨がない（fnmatch と同じ挙動）
- `**` は bash 4+ の `globstar` で対応可能だが、パターンマッチでは直接使えないため `*/` の再帰マッチとして処理する
- `shopt -s extglob` を有効にすることで高度なパターンマッチが可能

**Alternatives considered**:
- `find -name`: ファイルリストへのマッチングには不向き
- Python/Node スクリプト: 依存を増やしたくない
- `case` 文: extglob なしでも動作するが `**` サポートが限定的

## R4: コロン区切りパターンのパース方法

**Decision**: `IFS=':' read -ra patterns <<< "$DIFF_EXCLUDE_PATTERNS"` で配列に分割

**Rationale**:
- shell の `IFS` 分割は効率的で追加依存なし
- 空要素（`::` や末尾 `:`）は自動的に空文字列となり、フィルタ時にスキップ
- コロンは PATH 環境変数で使われる慣例に沿っており、ユーザーに馴染みやすい

**Alternatives considered**:
- カンマ区切り: glob パターンに `{a,b}` が含まれる場合に衝突
- 改行区切り: config.env の 1 行変数では扱いにくい
- JSON 配列: shell での処理に jq が必要
