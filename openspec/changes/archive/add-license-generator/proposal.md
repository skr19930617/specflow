# Proposal: ライセンスを生成するコマンドの追加

> GitHub Issue: [#57](https://github.com/skr19930617/specflow/issues/57) — ライセンスを生成するコマンドの追加

## 背景

OSS プロジェクトにはライセンスファイルが必須だが、適切なライセンスの選定は開発者にとって判断が難しい。specflow にはプロジェクト解析機能（`specflow-analyze`）が既にあるため、プロジェクトの特性に基づいたライセンス推奨が可能である。

## スコープ

スラッシュコマンド `/specflow.license` を追加し、以下の機能を提供する:

1. `specflow-analyze` でプロジェクトを解析
2. プロジェクト特性に基づいたおすすめライセンスを提示
3. `AskUserQuestion` で UI ボタンによるライセンス選択
4. 選択されたライセンスの `LICENSE` ファイルを生成

## 要件

### 必須要件

1. **コマンド定義**: `global/commands/specflow.license.md` にスラッシュコマンドを作成する
2. **プロジェクト解析**: `specflow-analyze` を使用してプロジェクトの言語・フレームワーク・既存ライセンスを取得する
3. **ライセンス選択 UI**: `AskUserQuestion` でボタン形式のライセンス選択を提供する
4. **ライセンス説明表示**: 選択前に各ライセンスの概要・特徴をコンソールに表示する
5. **おすすめ表示**: プロジェクト特性に基づいた推奨ライセンスを理由とともに提示する
6. **LICENSE ファイル生成**: 選択されたライセンスの正式な全文を `LICENSE` ファイルとして生成する
7. **年・著者名の自動取得**: `git config user.name` と現在の年を使用してライセンステキストに埋め込む。`git config user.name` が空または未設定の場合は `AskUserQuestion` をオプションなし（フリーテキスト入力モード）で呼び出し、著者名の入力を求める。質問テキストに `git config user.name` の例を提示する。ユーザーが空文字を入力した場合は再度入力を求める（最大3回、その後は `"<AUTHOR>"` プレースホルダーを使用し手動置換を求める）。ユーザーがプロンプトをキャンセル/dismiss した場合も `"<AUTHOR>"` プレースホルダーを使用する
8. **マニフェストファイルの license フィールド更新**: LICENSE ファイル生成後、以下のマニフェストファイルが存在する場合のみ、license フィールドを SPDX 識別子で更新する:
   - `package.json` — トップレベルの `"license": "<SPDX-ID>"` フィールドを設定（JSON の Edit）
   - `Cargo.toml` — `[package]` テーブル内の `license = "<SPDX-ID>"` フィールドを設定。`[package]` テーブルが存在しない場合はスキップ
   - `pyproject.toml` — `[project]` テーブル内の `license` フィールドを設定。`[project]` テーブルが存在しない場合はスキップ。`[tool.poetry]` 等のバックエンド固有テーブルは対応しない（`[project]` のみ）。既存の `license` フィールドがテーブル形式（`license = {text = "..."}` 等の PEP 639 以前の形式）の場合は更新をスキップし、`"⚠ pyproject.toml の license フィールドがレガシー形式のためスキップしました"` と表示する。文字列形式の場合のみ SPDX 識別子で上書きする
   - 上記以外のマニフェストファイルは対応しない
   - マニフェストファイルが存在しない場合はスキップ（新規作成しない）
   - 既存の license フィールドがあり、選択したライセンスの SPDX 識別子と異なる場合は `AskUserQuestion` で確認（「上書きする」/「スキップ」）。同一の場合はスキップ
   - LICENSE ファイルが存在しなかったがマニフェストに license フィールドが存在する場合、ライセンス選択画面で現在のマニフェスト値を参考情報として表示する
   - ユーザーが LICENSE ファイルの上書きをキャンセルした場合はマニフェスト更新もスキップする

### 対応ライセンス

| UI ラベル | GitHub API ID | SPDX 識別子 | 説明 | 年/著者の置換 |
|----------|---------------|-------------|------|--------------|
| MIT | `mit` | `MIT` | 最も寛容なライセンス | `[year]` → 年, `[fullname]` → 著者名 |
| Apache 2.0 | `apache-2.0` | `Apache-2.0` | エンタープライズ向け寛容ライセンス | 置換なし（テンプレートに年/著者プレースホルダーなし） |
| GPL 3.0 | `gpl-3.0` | `GPL-3.0-only` | コピーレフトライセンス | 置換なし（前文に年/著者の指示あるが本文には含まない） |
| BSD 2-Clause | `bsd-2-clause` | `BSD-2-Clause` | MIT に近いシンプルなライセンス | `[year]` → 年, `[fullname]` → 著者名 |
| ISC | `isc` | `ISC` | MIT/BSD と同等で最も短い | `[year]` → 年, `[fullname]` → 著者名 |
| AGPL 3.0 | `agpl-3.0` | `AGPL-3.0-only` | ネットワーク越しの使用にも適用されるコピーレフト | 置換なし |
| Unlicense | `unlicense` | `Unlicense` | パブリックドメイン相当 | 置換なし |

**置換ルール**: GitHub Licenses API レスポンスの `body` フィールドに `[year]` / `[fullname]` プレースホルダーが含まれる場合のみ置換する。含まれない場合はそのまま出力する。

### おすすめロジック

`specflow-analyze` の JSON 出力フィールドに基づき、以下の優先順位で決定する（最初にマッチしたルールを採用）:

| 優先度 | 条件（`specflow-analyze` フィールド） | 推奨ライセンス | 理由 |
|--------|--------------------------------------|---------------|------|
| 1 | `license` が非 null（※ `specflow-analyze` は LICENSE ファイルの存在から検出する。マニフェストの license フィールドは参照しない） | 現在のライセンスを表示し `AskUserQuestion` で上書き確認（「上書きする」/「キャンセル」）。キャンセル時はコマンド全体を終了する | 既存選択を尊重 |
| 2 | `package_manager` が `"npm"` または `languages` に `"JavaScript"` / `"TypeScript"` を含む | MIT | npm エコシステムで最も一般的 |
| 3 | `languages` に `"Rust"` を含む | MIT OR Apache 2.0 | Rust エコシステムのデュアルライセンス慣習 |
| 4 | `languages` に `"Go"` を含む | BSD 2-Clause | Go 標準ライブラリと同じ |
| 5 | `frameworks` が非空（何らかのフレームワーク使用） | MIT | ライブラリ/フレームワーク依存プロジェクトに最適 |
| 6 | 上記いずれにも該当しない | MIT | 最も広く採用されている OSS ライセンス |

**注意**: 推奨はあくまで提案であり、ユーザーは AskUserQuestion で任意の7種類から自由に選択できる。

## 設計決定

1. **コマンド名**: `specflow.license`（既存の `specflow.*` 命名規則に準拠）
2. **配置場所**: `global/commands/specflow.license.md`
3. **ライセンス全文**: GitHub Licenses API（`api.github.com/licenses/{spdx-id}`）から動的に取得する
4. **出力先**: プロジェクトルートの `LICENSE` ファイル
5. **既存ファイル対応**: 既存の LICENSE がある場合は上書き確認を行う

## ワークフロー

```
1. specflow-analyze でプロジェクト解析
2. 既存 LICENSE がある場合（`specflow-analyze.license` が非 null）は上書き確認。キャンセル時はコマンド終了
3. 各ライセンスの説明テーブルを表示
4. おすすめライセンスを理由とともに提示
5. AskUserQuestion でライセンス選択（ボタン形式、7種類）
6. 著者名・年を取得（git config 不在時はユーザー入力）
7. GitHub Licenses API からライセンス全文を取得
8. LICENSE ファイルを生成
9. package.json / Cargo.toml 等の license フィールドを更新
10. 結果を報告
```

## 受け入れ基準

- [ ] `global/commands/specflow.license.md` が存在する
- [ ] `specflow-analyze` を使用してプロジェクトを解析する
- [ ] 各ライセンスの説明がコンソールに表示される
- [ ] おすすめライセンスが理由とともに提示される
- [ ] `AskUserQuestion` でボタン形式のライセンス選択ができる（7種類固定）
- [ ] GitHub Licenses API からライセンス全文を取得し `LICENSE` ファイルに書き込まれる
- [ ] 年と著者名がライセンステキストに正しく埋め込まれる（git config 不在時はユーザー入力）
- [ ] 既存の LICENSE ファイルがある場合は上書き確認が行われる
- [ ] `package.json`・`Cargo.toml`・`pyproject.toml` の license フィールドが SPDX 識別子で自動更新される（ファイルが存在する場合のみ）

## スコープ外

- ライセンスの法的アドバイス
- マルチライセンス（複数ライセンスの同時適用）
- 7種類以外のカスタムライセンス対応
- SPDX 識別子の検証
- ライセンスヘッダーのソースファイルへの挿入
