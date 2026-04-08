# Proposal: Migrate specflow to OpenSpec

**Change ID**: migrate-specflow-to-openspec
**Status**: Complete
**Created**: 2026-04-07

## Purpose

specflow のワークフローを OpenSpec 準拠に移行する。
仕様の正本を `openspec/` に一本化し、legacy な `.specify` / spec-kit / specy 由来の構造・手順への依存を除去する。

## Scope

- `/specflow.*` コマンド群から `.specify/` 参照（check-prerequisites.sh, テンプレート読み込み等）を除去し、`openspec/` のみを参照するよう書き換える
- `global/` 配下の specflow プロンプトが前提とするディレクトリ構造を `openspec/changes/<id>/` ベースに統一する
- `CLAUDE.md` の Prerequisites・コマンドテーブルを OpenSpec 前提に更新する
- 不要になった `.specify/` ディレクトリおよび `specs/` レガシー構造を削除する

## Out of Scope

- OpenSpec 自体のスキーマ定義や config.yaml の変更
- Codex MCP サーバーの変更
- 既存の完了済み change（`openspec/changes/0*-*/`）の内容修正
- `/opsx:*` コマンドへのリネーム（別 change で扱う）

## Completion Criteria

- すべての specflow コマンドが `.specify/` を参照せず動作する
- 仕様成果物の読み書き先が `openspec/changes/<id>/` のみである
- `.specify/` ディレクトリと `specs/` レガシー構造がリポジトリから除去されている
- `CLAUDE.md` に `.specify` / spec-kit / specy への言及が残っていない
