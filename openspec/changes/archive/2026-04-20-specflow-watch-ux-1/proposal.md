## Why

`specflow-watch` は specflow run の進捗を横目で見るための TUI だが、現状は

- `/specflow.watch` と `/specflow` の watch 自動起動が macOS Terminal.app で `open -a Terminal --args` に依存しており、`--args` が無視されて **空のターミナルが開くだけでコマンドが実行されない**。Linux エミュレータの検出も持たないため、実質的に `SPECFLOW_NO_WATCH=1` と同等にフォールバックしてしまう。
- TUI 本体は **review が進んでもそのラウンドが表示されず**、手動 fix フェーズ (`revise_apply` / `revise_design` 直後) が見えず、バンドル配下の個別タスクも見えず、approval summary も読めない。events セクションは `phase_entered` / `phase_completed` / `gate_opened` を抽象的な kind のみで出力しており、どのフェーズが入り/抜け/待機中なのかが分からない。

これらは watch が「そこに居れば状況が分かる」という唯一の価値を損ねており、結果としてユーザはターミナルを切り替えて `cat .specflow/runs/<id>/run.json` を叩く運用になっている。

## What Changes

- **Cross-platform launch**: `/specflow.watch` と `/specflow` Step 3.7 の watch 自動起動を、以下の優先順で単一ディスパッチに統一する:
  1. `$TMUX` 設定あり → `tmux split-window -h`
  2. `$STY` 設定あり → `screen -X screen`
  3. macOS (`uname -s == Darwin`) → `osascript -e 'tell application "Terminal" to do script "…"'`
  4. Linux: **`$TERMINAL` 最優先** → `x-terminal-emulator` → `gnome-terminal` → `konsole` → `xfce4-terminal` → `alacritty` → `kitty` → `wezterm` → `xterm` の順に `command -v` で探索
  5. 全経路失敗時は**手動コマンドを 1 行案内して exit 0**（`💡 別ターミナルで specflow-watch <RUN_ID> を実行すると進捗をリアルタイムで確認できます`）。watch はオプショナルのため、起動失敗を親コマンドのエラーに伝播しない。

  `open -a Terminal --args bash -lc` 経路は Terminal.app が `--args` を無視して空ウィンドウを開くだけになるため廃止する。WSL 対応は本 change の対象外（非ゴール）。
- **Events summary**: 各 `event_kind` を具体的な 1 行に整形する:
  - `phase_entered` → `→ <target_phase> (<payload.triggered_event>)`
  - `phase_completed` → `✓ <source_phase> (<payload.outcome>)`
  - `gate_opened` → `⏸ waiting: <payload.gate_kind>` (`gate_ref` が判明していれば末尾に `(<gate_ref>)`)
  - `gate_resolved` → `▶ <payload.gate_kind> = <payload.resolved_response>`
  - `run_started` → `▶ run started`
  - `run_terminated` → `■ run <payload.final_status>`
  - 既知でない kind は従来どおり `payload.summary` / `payload.loop_state` をそのまま表示。
- **Review round persistence**: `design_review` / `apply_review` 中だけでなく、隣接フェーズでも直近の autofix-progress snapshot を保持表示する。**snapshot 選択規則はフェーズ family 一致**:
  - `design_draft` / `design_review` / `design_ready` → `autofix-progress-design_review.json`
  - `apply_draft` / `apply_review` / `apply_ready` / `approved` → `autofix-progress-apply_review.json`
  - その他のフェーズ (`proposal_*` / `spec_*` など) → 表示対象なし（従来どおり `No active review`）

  表示側は **live バッジ** (`current_phase ∈ {design_review, apply_review}`) と **completed バッジ** (それ以外でも snapshot あり) で区別する。
- **Manual fix visibility**: `run.history` の**末尾イベント**が `revise_apply` / `revise_design` の場合、ヘッダー phase の横に `(manual fix)` バッジを追加し、Review セクションに「Manual fix in progress — N unresolved findings」行を挟む。
  - **N の算出**: family 一致の autofix snapshot `counters.totalOpen`。snapshot が読めない場合は `N` の代わりに `? unresolved` と表示する（警告ではなく placeholder 扱い）。
  - バッジは次の `review_apply` / `review_design` イベントで自動的に消える。
- **Task graph tree**: 既存のバンドル一覧（ゲージ + カウント + status バッジ）を温存したうえで、各バンドル行の下に個別タスクを `├─ [SYM] N. title` / `└─ [SYM] N. title` のツリー形式で描画する。
  - **内部 status → SYM マッピング** (`TaskStatus = "pending" | "in_progress" | "done" | "skipped"` に対応):
    - `done` → `[✓]`
    - `in_progress` → `[◐]`
    - `pending` → `[ ]`
    - `skipped` → `[·]`
  - **バンドル完了時の強制チェック**: バンドル status が `done` のとき、子タスクの内部 status に関わらず `[✓]` で描画する。
- **Approval summary section**: `run.json::last_summary_path` が指す `approval-summary.md` から**冒頭の `Status:` 行**と **`What Changed` 内の diffstat 末尾行** (`N files changed, +X insertions(+), -Y deletions(-)`) を抽出し、新規 "Approval summary" セクションに 2 行で表示する。`What Changed` の全ファイル内訳や `Files Touched` 一覧は含めない。
  - **欠損/失敗時の挙動**:
    - `last_summary_path` が空または `null` → `No approval yet`（placeholder）
    - ファイルが存在しない → `Approval summary missing`（warning）
    - `Status:` 行が取れない → `Status: (unknown)` のみ表示
    - diffstat 行が取れない → Status 行だけを表示

## Capabilities

### New Capabilities

- None. 追加機能は全て既存 spec の修正で表現する。

### Modified Capabilities

- `realtime-progress-ui`: watch TUI のレンダリング契約を拡張する。
  - 新たに **events の具体的要約**・**review round 粘着表示**・**manual fix バッジ**・**task graph 子タスク行**・**approval summary セクション** を必須の表示要素として規定する。
  - live / completed 区別、バンドル完了時の子タスク強制チェックなどの表示不変条件も新規に要件化する。
- `slash-command-guides`: `/specflow.watch` と `/specflow` Step 3.7 の起動手順を **クロスプラットフォーム・ディスパッチャ** の順序で書き直す。macOS は `osascript do script` を一次経路とし、Linux では `x-terminal-emulator` → 主要エミュレータ → `xterm` を順に試す。`open -a Terminal --args` は使用しないことを明文化する。

## Impact

- **Code**:
  - `src/lib/watch-renderer/model.ts` — events 要約、review round 粘着、manual fix バッジ、task graph 子タスク、approval summary セクションの model ビルダーを拡張。
  - `src/lib/watch-renderer/render.ts` — 対応するセクションレンダラーとバンドル下のツリー描画を追加。
  - `src/lib/specflow-watch/artifact-readers.ts` — `approval-summary.md` 読み取りと隣接フェーズ用 snapshot 解決を追加。
  - `src/bin/specflow-watch.ts` — watchedPaths に approval summary を加え、model への引き渡しを拡張。
  - 新規 `src/lib/specflow-watch-launcher.ts`（または同等のシェル dispatcher）— tmux / screen / macOS / Linux / WSL / manual の順に解決するクロスプラットフォーム起動ヘルパー。
- **Templates / Commands**:
  - `assets/commands/specflow.watch.md.tmpl` — Launch path A/B/C を OS 横断に再編。
  - `assets/commands/specflow.md.tmpl` Step 3.7 — 同等の dispatcher に置換。
- **Tests**:
  - `src/tests/watch-renderer.test.ts`、`src/tests/specflow-watch-readers.test.ts`、`src/tests/specflow-watch-integration.test.ts` を更新。
  - 新規 `src/tests/specflow-watch-launcher.test.ts` — 各プラットフォームのコマンド整形を env stub で検証。
- **Docs**: spec delta 更新に伴い `openspec/specs/realtime-progress-ui/spec.md` / `openspec/specs/slash-command-guides/spec.md` の要件が変更される。
- **Non-goals**: watch の UI を React / TUI フレームワーク化する、`events.jsonl` の書き出し側契約を変える、autofix loop 自体の挙動を変える、は本 change の対象外。
