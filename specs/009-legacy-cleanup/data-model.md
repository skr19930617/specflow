# Data Model: レガシーコードのリファクタリング

**Date**: 2026-04-03 | **Branch**: 009-legacy-cleanup

## Overview

本 issue はリファクタリング・メンテナンスタスクのため、新規エンティティの追加やスキーマ変更はない。

## ファイル参照マップ

現行のファイル間参照関係:

### bin/ スクリプト
| File | Referenced by |
|------|--------------|
| `bin/specflow-install` | README.md |
| `bin/specflow-init` | README.md, global/specflow.setup.md, global/specflow.md |
| `bin/specflow-fetch-issue` | README.md, global/specflow.md, global/claude-settings.json |

### template/.specflow/
| File | Referenced by |
|------|--------------|
| `config.env` | README.md, global/specflow*.md, CLAUDE.md |
| `review_spec_prompt.txt` | README.md, global/specflow.md, global/specflow.spec_fix.md |
| `review_plan_prompt.txt` | README.md, global/specflow.plan.md, global/specflow.plan_fix.md |
| `review_impl_prompt.txt` | README.md, global/specflow.impl.md, global/specflow.fix.md |
| `review_impl_rereview_prompt.txt` | global/specflow.fix.md (**README に未記載**) |

### 変更対象ファイル
| File | Change Type | Reason |
|------|------------|--------|
| `README.md` | Update | ファイル構成セクションに review_plan_prompt.txt, review_impl_rereview_prompt.txt を追記 |
| `bin/specflow-install` | Update | 壊れたシンボリックリンク掃除機能を追加 |
| `bin/specflow-init` | Update | 完了メッセージを実際のコピーファイル一覧と一致させる |
