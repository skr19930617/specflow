## Why

`src/contracts/command-bodies.ts` は 870 行の TS ファイルで、自然言語の手順・workflow 契約・共通ルール・runtime 注意書きが巨大な文字列リテラルとして混在している。prose と contract の境界が不明確で、共通部分の再利用が見えにくく、command authoring が「TS 内の巨大文字列編集」になりレビューしづらい。

本変更は runtime semantics の全面 redesign ではなく、**authoring 上の責務分離を見える形にすること**を目的とする。

- Source: https://github.com/skr19930617/specflow/issues/156

## What Changes

- command authoring source を TS object 内の長文文字列から **Markdown template + 明示的挿入記法** に移行する
- 3種の insertion syntax を定義する:
  - `{{insert: <key>}}` — 共通 prose / common rules の挿入（例: prerequisites, important rules）
  - `{{contract: <phase>}}` — PhaseContract の構造化データをそのまま埋め込み
  - `{{render: <phase>}}` — PhaseContract を Markdown table / summary に整形して埋め込み
- template source ファイルを `assets/commands/*.md.tmpl` に配置し、prose をそのまま Markdown で記述する
- **template 解決は build 時のみ**。runtime は resolved markdown を参照するだけで template を知らない
- build 時に template を解決して最終 command markdown を生成するパイプラインを追加する
- **全 command を新形式へ一括移行する**（段階移行ではなく全量）
- 移行の正しさを検証する **snapshot テスト**を追加する（移行前の generated markdown と template 経由の output を diff 比較）
- TS 側と template 側の責務境界:
  - **TS 側に残す**: frontmatter (description), command 登録, run hooks, references
  - **Template 側に移す**: sections の本文 (prose + insertion tags)
- 既存の user-facing command output との互換性を維持する

### Design Decisions (Challenge で確定)

- **ネスト挿入は不可**（深さ 1 のみ）。resolver の複雑度を最小に保つ。将来必要になったら拡張する
- **参照先が存在しない場合は build 時ハードエラー**。typo や削除済み contract を即座に検出する
- **template source は npm パッケージに含めない**。build 済みの resolved markdown のみ配布する

## Capabilities

### New Capabilities
- `command-template-authoring`: Markdown テンプレートベースの command authoring システム。insertion syntax（insert/contract/render）の定義、template source ファイル（`assets/commands/*.md.tmpl`）の構造、build 時の template 解決パイプライン、snapshot テストによる互換性検証を含む。

### Modified Capabilities
- `contract-driven-distribution`: build パイプラインが template source を解決して最終 command markdown を生成する仕組みを追加する。template source は配布に含めず resolved output のみ配布する。
- `slash-command-guides`: 生成される command markdown が template 経由で生成される形に変更される。PhaseContract 連携の既存メカニズム（`renderPhaseMarkdown`）との統合。TS 側には frontmatter・登録・hooks が残り、template 側に sections 本文が移る。

## Impact

- `src/contracts/command-bodies.ts` — 巨大文字列の大部分が template ファイルに移動。TS 側は frontmatter + command 登録 + template パス参照の薄いラッパーに変換
- `src/contracts/phase-contract.ts` — `{{contract:}}` / `{{render:}}` 挿入の解決元
- `src/contracts/prerequisites.ts` — `{{insert:}}` 挿入の解決元
- build pipeline（`src/contracts/install.ts` 周辺） — template 解決ステップの追加
- 新規: `assets/commands/*.md.tmpl` — template source ファイル群（配布対象外）
- 新規: template resolver モジュール — insertion syntax のパース・解決（ネスト不可、参照不整合はハードエラー）
- 新規: snapshot テスト — 移行前後の output 一致を検証
