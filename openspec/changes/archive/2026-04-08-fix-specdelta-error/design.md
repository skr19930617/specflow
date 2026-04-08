## Context

specflow は OpenSpec CLI と連携して issue-driven development を実現するコマンド群。現在のフローは `openspec/specs/` にベースライン spec が存在することを前提としており、既存プロジェクトへの導入時に spec delta エラーが発生する。

既存コマンド群（`specflow.md`, `specflow.design.md`, `specflow.apply.md` 等）は `global/commands/` に Markdown ファイルとして定義され、Claude Code のスキルシステムで実行される。新コマンドも同じパターンに従う。

## Goals / Non-Goals

**Goals:**
- 既存プロジェクトのコードベースを解析し、capability 単位の spec を一括生成する `specflow.spec` コマンドを提供する
- specflow メインフロー内で spec 未存在を早期検出し、`specflow.spec` へ誘導する
- OpenSpec CLI の instructions/template 機能を優先的に活用し、CLI 非対応の場合のみエージェント主導で生成する

**Non-Goals:**
- specflow の他の既存コマンド（design, apply, approve 等）の変更
- spec の自動更新・同期機能（初回生成のみ）
- コードベースの完全な静的解析やAST解析（エージェントの読解力ベース）

## Decisions

### D1: コマンドファイルの配置

`global/commands/specflow.spec.md` として新規作成する。

**理由:** 既存の specflow コマンド群（`specflow.apply.md`, `specflow.design.md` 等）と同じディレクトリ・命名規則に従い、Claude Code のスキルシステムから自動的に発見・実行可能にするため。

### D2: コードベース解析のアプローチ

エージェントが Glob/Grep/Read ツールを使い、以下の順序で解析する:
1. ディレクトリ構造のスキャン（Glob でファイルパターン検出）
2. 設定ファイルの読み取り（package.json, go.mod, Cargo.toml, pyproject.toml 等）
3. 主要ファイルの内部読み取り（エントリポイント、ルーター、モデル定義等）
4. capability 候補の抽出とグルーピング

**理由:** AST 解析ツールを導入せず、既存の Claude Code ツール群だけで実現可能。コード内部まで解析するという要件を、エージェントの読解能力で満たす。

**代替案:** 言語固有の AST 解析ツール（ts-morph, go/ast 等）を使う案は、多言語対応のコストが高く、specflow コマンドの実行環境に追加依存を持ち込むため不採用。

### D3: capability 選択のインターフェース

AskUserQuestion の multiSelect モードを使用し、検出した capability 一覧を提示する。ユーザーは:
- チェックボックスで生成対象を選択
- 「その他」オプションで手動追加

**理由:** specflow の他のコマンド（clarify 等）で既に AskUserQuestion が使われており、一貫したUXを提供できる。

### D4: spec 生成時の OpenSpec CLI 活用戦略

1. capability 名を正規化する: 入力をケバブケースに変換（小文字化、スペース/アンダースコアをハイフンに置換、連続ハイフンを単一に、先頭末尾のハイフンを除去）。重複する capability 名は警告して統合する。
2. `openspec new spec "<normalized-name>"` でディレクトリ作成を試みる
3. `openspec instructions` で spec 用のテンプレート・ルールを取得できるか確認する
4. 取得できた場合はそのテンプレートに従い生成。取得できない場合は以下の **canonical fallback template** を使用する:

**Canonical Fallback Template:**
```markdown
# <capability-name> Specification

## Purpose
<capability の目的を1-2文で記述>

## Requirements
### Requirement: <requirement name>
<requirement description using SHALL/MUST>

#### Scenario: <scenario name>
- **WHEN** <condition>
- **THEN** <expected outcome>
```

このテンプレートは既存の `openspec/specs/approve-execution-order/spec.md` のフォーマットに準拠しており、downstream の specflow.design が delta spec を作成する際に正しく参照できる構造になっている。

5. ディレクトリ作成は `mkdir -p openspec/specs/<normalized-name>` で直接行い、CLI の `openspec new spec` が失敗した場合でも確実にパスが存在するようにする。

**理由:** CLI 優先の方針に従い、CLI の進化に自動追従できる。CLI 非対応時でも canonical template により出力契約が明確で、downstream の specflow フローとの互換性が保証される。

### D5: specflow メインフローへのハンドオフ挿入位置

`specflow.md` の Step 3（Create Change + Proposal）の前に新しいステップを挿入する:
- Glob で `openspec/specs/*/spec.md` パターンに一致するファイルを検索する
- 一致するファイルが1つも存在しない場合（ディレクトリのみ存在・空ディレクトリ・`openspec/specs/` 自体が欠落のいずれでも）、AskUserQuestion で `specflow.spec` への誘導を提示
- ユーザーが「スキップ」を選んだ場合は通常フローを続行

**理由:** proposal 作成時に Modified Capabilities を正しく記述するには既存 spec の把握が必要。proposal 作成前のチェックが最も早い段階でエラーを防げる。ディレクトリの有無ではなく `spec.md` ファイルの存在をチェックすることで、空ディレクトリや不完全な状態を正しく検出できる。

### D6: capability ごとの質問フロー

各 capability に対して以下の質問カテゴリで spec 内容を充実させる:
1. **スコープ確認**: この capability がカバーする範囲
2. **主要要件**: 現在のコードが満たしている要件（WHEN/THEN 形式のシナリオ）
3. **制約・前提条件**: 依存関係やパフォーマンス要件

質問は AskUserQuestion で1つずつ提示し、回答を spec に反映する。

**理由:** 一括で全質問を表示すると圧倒的になるため、specflow.md の clarify と同じ1問ずつのパターンを採用。

## Risks / Trade-offs

- **[大規模コードベースでの解析時間]** → エージェントの読み取り回数が多くなる可能性がある。Glob で概要を把握し、深掘りは主要ファイルに限定することで緩和。
- **[capability 検出の精度]** → エージェントの判断に依存するため、過不足が生じる可能性がある。ユーザーによる選択・追加・削除ステップで補正。
- **[OpenSpec CLI の spec サポート状況]** → CLI に spec 用の instructions がない可能性がある。フォールバックとして既存 spec のフォーマットを参照する戦略で対応。
