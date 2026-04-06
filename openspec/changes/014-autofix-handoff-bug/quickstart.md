# Quickstart: Auto-fix Handoff Bug Fix

**Branch**: `014-autofix-handoff-bug` | **Date**: 2026-04-05

## What This Changes

impl review 後の handoff メカニズムを AskUserQuestion 直接確認に置き換え、AskQuestion の表示を簡略化する。

## Files to Modify

1. **`global/specflow.impl_review.md`** — メイン修正対象
   - Handoff セクション (Lines 216-426) を書き換え
   - Case A/B/C の 3 分岐を統一フローに置換
   - severity 集計・表示ロジック追加

## Key Changes

### Before (現在)
```
impl review → actionable_high_count チェック
  → Case A: AskUserQuestion (タイトル一覧付き) → auto-fix loop
  → Case B: handoff ボタン (Approve/Fix/Reject)
  → Case C: エラー handoff
```

### After (修正後)
```
impl review → actionable findings チェック
  → findings > 0: AskUserQuestion (severity:件数のみ) → Auto-fix or 手動修正
  → findings == 0: 承認フローへ直接遷移
  → スキップ時: 手動修正誘導（デフォルト）
```

## Testing

手動テスト手順:
1. impl review を実行し、指摘がある状態で auto-fix 確認が severity+件数のみで表示されることを確認
2. 「Auto-fix 実行」選択で auto-fix loop が起動することを確認
3. 「手動修正」選択で /specflow.fix への誘導が表示されることを確認
4. 指摘 0 件の場合は確認なしで承認フローに進むことを確認
