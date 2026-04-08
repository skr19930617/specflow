# Tasks: Migrate specflow to OpenSpec

**Change ID**: migrate-specflow-to-openspec
**Spec**: specs/workflow/spec.md

---

## Phase 1: Command prompt prerequisite cleanup

`global/commands/` 配下の全 specflow コマンドから `.specify/` 前提の prerequisite チェックと path 解決を除去し、OpenSpec ベースに置き換える。

- [x] T01: `global/commands/specflow.md` — Prerequisites の `ls .specify/scripts/bash/check-prerequisites.sh` を `ls openspec/config.yaml` に置換。`FEATURE_SPEC` 解決を branch 名ベースの change id 解決に置換（spec M-02, A-01）
- [x] T02: `global/commands/specflow.plan.md` — 同上の prerequisite 置換。`.specify/` 参照の除去（spec M-02）
- [x] T03: `global/commands/specflow.impl.md` — prerequisite 置換。Setup の `check-prerequisites.sh --json --paths-only` を change id ベースの `FEATURE_DIR` 解決に置換（spec M-02, A-01）
- [x] T04: `global/commands/specflow.impl_review.md` — prerequisite 置換。Setup の `check-prerequisites.sh` 呼び出しを除去。`BRANCH from check-prerequisites` を `change id` に置換（spec M-02, A-01）
- [x] T05: `global/commands/specflow.spec_review.md` — 同上パターン（spec M-02, A-01）
- [x] T06: `global/commands/specflow.plan_review.md` — 同上パターン（spec M-02, A-01）
- [x] T07: `global/commands/specflow.impl_fix.md` — prerequisite 置換。Setup の `check-prerequisites.sh` 呼び出しを除去（spec M-02, A-01）
- [x] T08: `global/commands/specflow.spec_fix.md` — 同上パターン（spec M-02, A-01）
- [x] T09: `global/commands/specflow.plan_fix.md` — 同上パターン（spec M-02, A-01）
- [x] T10: `global/commands/specflow.approve.md` — 3 箇所の `check-prerequisites.sh` 呼び出しを change id ベースに置換（spec M-02, A-01）
- [x] T11: `global/commands/specflow.decompose.md` — prerequisite 置換。Setup の `check-prerequisites.sh` 呼び出しを除去（spec M-02, A-01）
- [x] T12: `global/commands/specflow.dashboard.md` — prerequisite 置換（spec M-02）
- [x] T13: `global/commands/specflow.reject.md` — `.specify/` 除外パターンを除去（prerequisite チェックなし、git clean の除外のみ）（spec R-01）

**Checkpoint**: 全コマンドファイルに `check-prerequisites.sh` への参照が残っていないこと。

---

## Phase 2: Artifact path normalization

成果物の read/write 先を `openspec/changes/<id>/` に統一する。

- [x] T14: `global/commands/specflow.md` — spec 生成先を `openspec/changes/<id>/proposal.md` に変更。`.specify/` と `openspec/changes/` の二重管理記述を除去（spec M-01, M-03）
- [x] T15: `global/commands/specflow.plan.md` — 成果物 read/write 先の `FEATURE_DIR` を `openspec/changes/<id>` に固定。二重管理記述を除去（spec M-03）
- [x] T16: `global/commands/specflow.impl.md` — 同上。二重管理記述を除去（spec M-03）
- [x] T17: `global/commands/specflow.impl_review.md` — `review-ledger.json`, `current-phase.md` の read/write 先を `openspec/changes/<id>/` に固定（spec M-03）
- [x] T18: `global/commands/specflow.impl_fix.md` — `review-ledger.json` の read/write 先を固定。diff 除外パターンから `':(exclude).specify'` を除去（spec M-03, R-01）
- [x] T19: `global/commands/specflow.spec_review.md` — `review-ledger-spec.json` の read/write 先を固定（spec M-03）
- [x] T20: `global/commands/specflow.spec_fix.md` — 同上（spec M-03）
- [x] T21: `global/commands/specflow.plan_review.md` — `review-ledger-plan.json` の read/write 先を固定（spec M-03）
- [x] T22: `global/commands/specflow.plan_fix.md` — 同上（spec M-03）
- [x] T23: `global/commands/specflow.approve.md` — `approval-summary.md` の write 先を固定。diff 除外パターンを `openspec/changes/<id>/` ベースに更新（spec M-03）
- [x] T24: `global/commands/specflow.dashboard.md` — スキャン先を `openspec/changes/*/` に限定（既にほぼ対応済み。`specs/` フォールバックがあれば除去）（spec M-03）

**Checkpoint**: 全コマンドファイルで成果物パスが `openspec/changes/<id>/` のみを指していること。

---

## Phase 3: Legacy reference removal

`.specify`, spec-kit, specy, legacy `specs/` への参照を CLAUDE.md とコマンドファイルから除去する。

- [x] T25: `CLAUDE.md` — Prerequisites セクションから `.specify` / speckit 前提の記述を除去。OpenSpec 前提に書き換え（spec R-01, R-03）
- [x] T26: `global/commands/specflow.md` — `.specify/` への言及を除去（T01, T14 で残った参照があれば）（spec R-01）
- [x] T27: `global/commands/specflow.reject.md` — `git clean` の `':(exclude).specify'` 除外と `.specify/` 保持の説明を除去（spec R-01）
- [x] T28: `global/commands/specflow*.md` 全体 — `speckit`, `specy` 文字列の残存チェックと除去（spec R-03）
- [x] T29: `CLAUDE.md` — specflow コマンドテーブルの説明文を OpenSpec 前提に更新（`specs/` ディレクトリ構造の記述除去）（spec R-02）
- [x] T30: トップレベル `specs/` ディレクトリの削除（spec R-02）

**Checkpoint**: `grep -r '\.specify\|speckit\|specy' global/commands/ CLAUDE.md` がゼロ件。トップレベル `specs/` が存在しない。`openspec/specs/` は存在する。

---

## Phase 4: Init and install alignment

`bin/specflow-init` と `bin/specflow-install` の挙動と案内を OpenSpec 前提に揃える。

- [x] T31: `bin/specflow-init` — `.specflow/` テンプレートコピーを除去。`openspec/config.yaml` の存在チェックに変更。`.specify` 未検出時の警告を除去（spec M-02, R-01）
- [x] T32: `bin/specflow-init` — `--update` モードの `.specflow/` プロンプト補完ロジックを除去。コマンド更新のみに簡素化（spec R-01）
- [x] T33: `bin/specflow-init` — 完了メッセージの "Next steps" から `.specify` インストール案内を除去。OpenSpec 前提の案内に置換（spec R-01, R-03）
- [x] T34: `bin/specflow-install` — 完了メッセージの `specflow-init` 案内を OpenSpec 前提に更新（spec R-01）

**Checkpoint**: `bin/specflow-init` と `bin/specflow-install` に `.specify`, `.specflow/`, `speckit` への参照が残っていないこと。

---

## Execution Order

```
Phase 1 (T01–T13)  prerequisite cleanup
    ↓
Phase 2 (T14–T24)  artifact path normalization
    ↓
Phase 3 (T25–T30)  legacy reference removal
    ↓
Phase 4 (T31–T34)  init/install alignment
```

Phase 1 → 2 は順序依存（prerequisite を先に除去してから path を書き換える方が差分が小さい）。
Phase 3 は Phase 1–2 の残存参照を掃除するため後。
Phase 4 は bin/ スクリプトで、コマンドファイルの変更完了後に実施。

Phase 内の各タスクは独立しており並列実行可能（異なるファイルを編集するため）。
