## Context

`specflow-watch` は specflow run の進捗を **読み取り専用で** 可視化するスタンドアロン TUI である。本 change の対象は、TUI 本体 (`src/bin/specflow-watch.ts` + `src/lib/watch-renderer/*` + `src/lib/specflow-watch/artifact-readers.ts`) とその起動経路 (`assets/commands/specflow.watch.md.tmpl` と `assets/commands/specflow.md.tmpl` の Step 3.7)。現状の問題点は proposal に詳述しており、それぞれの対策を本章では **どう実装するか** で記述する。

重要な前提:

- `WatchModel` と `renderFrame` は純関数で、`src/bin/specflow-watch.ts` が TTY アダプタを担う。差分レンダリングは既存の `paint()` が担い、フレーム列の長さ・内容が変わってもそのまま動く。
- 本 change は TUI 構造そのものは壊さない — 既存のセクション順（Header → Terminal banner → Review round → Task graph → Recent events）を温存し、その**末尾に** Approval summary を足す。
- タスクグラフのバンドル-タスク構造は `src/lib/task-planner/types.ts` で既定であり、`TaskStatus = "pending" | "in_progress" | "done" | "skipped"` に閉じる。
- 全ての副作用は `specflow-watch` 側にあり、テンプレート差し替えは `src/tests/__snapshots__/specflow.{watch,md}.snap` の更新だけで配線される。

## Goals / Non-Goals

**Goals:**

- クロスプラットフォーム起動を一箇所のディスパッチャに収束させ、テンプレート（`specflow.watch.md.tmpl`、`specflow.md.tmpl` Step 3.7）はそのディスパッチャ手順を参照する。mac / Linux 主要エミュレータ / tmux / screen / 手動フォールバックで動く。
- Watch TUI で以下を**既存セクションを壊さずに**追加・修正: events 具体化、review round 粘着表示（live/completed）、manual fix バッジ + 行、bundle 配下の子タスク tree、approval summary セクション。
- 全ての振る舞いは純関数レイヤ (`model.ts` / `render.ts` / `artifact-readers.ts`) に閉じ、単体テストで保護する。

**Non-Goals:**

- WSL 対応（今回対象外、将来の別 change）。
- TUI を React/Ink 等に移行、`events.jsonl` の書き出し契約変更、autofix loop 自体の挙動変更。
- 既存 `/specflow.apply` や review workflow の変更。
- `tasks.md` を watch の入力源にすること（本 change 後も task-graph.json が唯一の正とする）。

## Concerns

### C1: 起動経路の確実性（macOS で空 Terminal が開く）

現状 `open -a Terminal -n --args bash -lc "…"` は Terminal.app が `--args` を無視するため空ウィンドウが開く。`osascript -e 'tell application "Terminal" to do script "…"'` を一次経路にすれば確実に実行される。Linux は `$TERMINAL` → 主要エミュレータの順で `command -v` 探索。ただし Linux エミュレータは起動引数の契約が異なるため、エミュレータごとに専用の起動フォームを定義する（C1a 参照）。

### C1a: Linux エミュレータごとの起動引数の差異

Linux ターミナルエミュレータは `-e` フラグの解釈が統一されていない。`gnome-terminal` は `-e` を deprecated にしており `-- command args` を要求する。`konsole` は `-e command args`（`--` なし）。`wezterm` は `start -- command args`。エミュレータごとに launch form を定義し、単一の `"$t" -e "specflow-watch $target"` には頼らない。

### C1b: 起動コマンドの shell/AppleScript quoting

`launch_watch()` はリポジトリパス (`repo_dir`) とターゲット (`target`) をコマンド文字列に補間する。パスにスペースや `'`、`"` などの shell メタ文字を含む場合に安全に動作させるため、ブランチごとに適切なクォーティング戦略を適用する。具体的には: (1) 個別引数として渡すブランチ（`gnome-terminal --`、`konsole -e`、`alacritty -e`、`kitty`、`wezterm start --`、`xterm -e`、`screen`、`x-terminal-emulator`、`$TERMINAL`）は `"$target"` のダブルクォートで十分（シェルがワード分割しないため）、(2) 単一文字列として渡すブランチ（`tmux split-window -h "..."` と `xfce4-terminal -e "..."` ）は `printf '%q'` でエスケープ、(3) `osascript` は AppleScript 文字列にシングルクォートエスケープ (`_qs()`) で埋め込み、`repo_dir` と `target` の**両方**をエスケープする、(4) manual fallback の表示行では `_shell_quote` で target をクォートし、ユーザがコピー＆ペーストしたときにスペース等の特殊文字が安全に扱われるようにする。各ブランチのクォーティング戦略は Contracts セクションのエミュレータ起動引数テーブルにまとめ、テストで全ブランチのクォーティング正当性を検証する。

### C1c: バックグラウンド起動の成否検証

GUI ターミナルエミュレータは起動後にブロックするため `&` でバックグラウンド化する必要があるが、`cmd & { return 0; }` パターンでは `&` が常に成功するため、コマンドが即座にクラッシュしても dispatcher が成功と判定してフォールバックしない。これを防ぐため、バックグラウンド起動後に PID の生存を短時間 (200ms) チェックする `_try_bg()` ヘルパーを導入し、全てのバックグラウンドブランチで使用する。PID が生存していれば成功と判定、消滅していればそのブランチを失敗扱いにして次候補へフォールスルーする。同期的に成功/失敗が判定できるブランチ（`tmux`、`screen`、`osascript`）は従来どおり `&&` で直接チェックする。

### C2: events の抽象性（`phase_entered` しか書いてない）

`RawObservationEvent` の `event_kind` / `source_phase` / `target_phase` / `payload.triggered_event` / `payload.outcome` / `payload.gate_kind` / `payload.resolved_response` はすでに `events.jsonl` に書かれている。読み側 (`model.ts::eventSummary`) がそれらを使っていないだけ。

### C3: review round が隣接フェーズで消える

`selectActiveAutofixPhase` が `design_review` / `apply_review` のときのみ snapshot パスを返す。これを「family 一致」ルールに拡張し、`apply_draft` / `apply_ready` / `approved` でも `apply_review` の snapshot を返す。レンダリング側に live / completed フラグを足して視覚的に区別。

### C4: 手動 fix フェーズが見えない

`run.history` の末尾イベントが `revise_apply` / `revise_design` のとき、model に manualFix フラグを立てて header と review に反映。次の `review_*` で自動解除。

### C5: バンドル配下の個別タスクが見えない

`WatchModel.task_graph.bundles[].tasks_done/total` しか持たず、`BundleView` に `tasks[]` を持たせていない。model を拡張し、render で box-drawing tree を描画。バンドル `done` 時は子タスクを `[✓]` 固定で描画。

### C6a: events の未知 kind と欠損フィールドの扱い

`eventSummary` を concrete formatter に書き換える際、既知の `event_kind` 以外の値は従来どおり `payload.summary` / `payload.loop_state` をフォールバック表示しなければならない（proposal 要件）。また、`payload.triggered_event` / `payload.outcome` 等のフィールドが欠損している場合は括弧付きサフィックスごと省略し、`undefined` を描画してはならない。formatter は kind ごとの happy-path 分岐 + unknown fallback + 各フィールド optional 省略の 3 層で構成する。

### C6: approval summary が見えない

`run.last_summary_path` が指す `approval-summary.md` を読まない。新規 `readApprovalSummaryFile` リーダーと新 section を追加し、Status 行 + `## What Changed` セクション内に限定した最終 diffstat 行のみ抽出する。diffstat 正規表現を `What Changed` セクションにスコープすることで、他セクションの類似テキストとの誤マッチを防ぐ（D5 参照）。

## State / Lifecycle

### Watch プロセスのライフサイクル（変更なし）

- 起動 → 対象 run 解決 → TTY alt-screen → fs.watch 登録 + 2s polling fallback → 終了時に alt-screen leave。
- 本 change はライフサイクルを変えない。追加の watched path のうち、autofix snapshot 等の既存パスは**ファイル存在時のみ** push される。ただし `approval-summary.md` は missing → present 遷移の検出が必要なため、`last_summary_path` が非 null であればファイル存在に関わらず **親ディレクトリを** watchedPaths に追加する。ファイルが存在しない間は `Approval summary missing` を表示し、ファイルが書かれた時点で親ディレクトリの fs.watch イベントにより再読み込みが発火して正常表示に遷移する。

### 追加される派生状態

- **Manual fix state** は `run.history` の末尾イベントから即座に導出可能。永続化不要。

  ```
  manualFix =
    | { kind: "idle" }
    | { kind: "design" }   // history.last.event == "revise_design"
    | { kind: "apply" }    // history.last.event == "revise_apply"
  ```

- **Review round family** は `current_phase` から決定論的に導出される派生状態 (`"design" | "apply" | null`)。

- **Approval summary read** は `last_summary_path` の文字列によってファイル有無が判定され、読めなければ `absent` / `missing` / `ok` のいずれかのタグ付き結果になる。

### 永続化感度

- 本 change は一切の run artifact を書き込まない。読み取り対象の追加も `approval-summary.md`（本来アーカイブ時に書かれる）と `autofix-progress-apply_review.json`（review-apply が書く）だけ。

## Contracts / Interfaces

### WatchModel の追加/変更

```ts
// model.ts — 既存型を拡張
interface WatchModelHeader {
  // ...既存
  manual_fix_kind: "idle" | "design" | "apply";   // NEW
}

interface ReviewRoundView {
  // ...既存
  visibility: "live" | "completed";                // NEW — live/completed バッジ用
  loop_state: string | null;                       // NEW — snapshot の loop_state (completed バッジ用)
  manual_fix_open_count: number | null;            // NEW — null なら ? unresolved
}

interface BundleView {
  // ...既存
  tasks: readonly {                                 // NEW — 子タスク配列
    readonly id: string;
    readonly title: string;
    readonly status: TaskStatus;
    readonly display_status: TaskStatus;           // bundle.done のときは "done" に強制
  }[];
}

interface ApprovalSummaryView {                     // NEW
  readonly status_line: string | null;
  readonly diffstat_line: string | null;
}

interface WatchModel {
  // ...既存
  approval_summary: SectionState<ApprovalSummaryView>;   // NEW
}
```

### artifact-readers.ts の追加

```ts
// selectActiveAutofixPhase を拡張
export function selectActiveAutofixPhase(
  currentPhase: string,
): AutofixReviewPhase | null {
  if (currentPhase === "design_draft") return "design_review";
  if (currentPhase === "design_review") return "design_review";
  if (currentPhase === "design_ready") return "design_review";
  if (currentPhase === "apply_draft") return "apply_review";
  if (currentPhase === "apply_review") return "apply_review";
  if (currentPhase === "apply_ready") return "apply_review";
  if (currentPhase === "approved") return "apply_review";
  return null;
}

// 新規
export interface ApprovalSummaryExtract {
  readonly status_line: string | null;
  readonly diffstat_line: string | null;
}
export function readApprovalSummary(
  projectRoot: string,
  run: Pick<RunState, "last_summary_path">,
): ArtifactReadResult<ApprovalSummaryExtract>;
// Note: diffstat extraction is scoped to the `## What Changed` section.
// The reader first isolates text between `## What Changed` and the next `##` heading,
// then applies the diffstat regex only within that slice.
// This prevents false matches from other sections (e.g. `## Files Touched`).
```

### Launcher shell contract（新規）

`specflow-watch-launch.sh` ではなく、`assets/commands/*.md.tmpl` 内に **Bash レシピ** として記述する（Launcher 用の TS バイナリは増やさない — slash-command guide から直接実行するため）。レシピは:

```bash
launch_watch() {
  local target="$1"
  local repo_dir
  repo_dir="$(pwd)"
  local watch_method=""

  # Helper: quote a string for embedding inside AppleScript single-quoted literals
  _qs() { printf '%s' "$1" | sed "s/'/'\\\\''/g"; }
  # Helper: quote a string for emulators that take -e as a single shell string
  _shell_quote() { printf '%q' "$1"; }
  # Helper: background a command and verify its PID survives 200ms (see C1c/D10)
  _try_bg() {
    "$@" &
    local pid=$!
    sleep 0.2
    kill -0 "$pid" 2>/dev/null
  }

  # --- Synchronous branches (success checked via && on exit code) ---
  if [ -n "$TMUX" ]; then
    tmux split-window -h "specflow-watch $(_shell_quote "$target")" && { watch_method="tmux"; printf 'WATCH_METHOD=%s\n' "$watch_method"; return 0; }
  fi
  if [ -n "$STY" ]; then
    screen -X screen specflow-watch "$target" && { watch_method="screen"; printf 'WATCH_METHOD=%s\n' "$watch_method"; return 0; }
  fi
  if [ "$(uname -s)" = "Darwin" ] && command -v osascript >/dev/null 2>&1; then
    local qs_dir; qs_dir="$(_qs "$repo_dir")"
    local qs_target; qs_target="$(_qs "$target")"
    osascript -e "tell application \"Terminal\" to do script \"cd '${qs_dir}' && specflow-watch '${qs_target}'\"" \
              -e 'tell application "Terminal" to activate' >/dev/null && { watch_method="osascript"; printf 'WATCH_METHOD=%s\n' "$watch_method"; return 0; }
  fi
  # --- Backgrounded branches (success checked via _try_bg PID probe) ---
  # $TERMINAL is a best-effort attempt using -e; if the emulator uses non-standard args it will
  # fail and _try_bg returns non-zero, falling through to per-emulator branches (see D9/D10).
  if [ -n "$TERMINAL" ] && command -v "$TERMINAL" >/dev/null 2>&1; then
    if _try_bg "$TERMINAL" -e specflow-watch "$target"; then
      watch_method="\$TERMINAL($TERMINAL)"; printf 'WATCH_METHOD=%s\n' "$watch_method"; return 0
    fi
  fi
  if command -v x-terminal-emulator >/dev/null 2>&1; then
    if _try_bg x-terminal-emulator -e specflow-watch "$target"; then
      watch_method="x-terminal-emulator"; printf 'WATCH_METHOD=%s\n' "$watch_method"; return 0
    fi
  fi
  if command -v gnome-terminal >/dev/null 2>&1; then
    if _try_bg gnome-terminal -- specflow-watch "$target"; then
      watch_method="gnome-terminal"; printf 'WATCH_METHOD=%s\n' "$watch_method"; return 0
    fi
  fi
  if command -v konsole >/dev/null 2>&1; then
    if _try_bg konsole -e specflow-watch "$target"; then
      watch_method="konsole"; printf 'WATCH_METHOD=%s\n' "$watch_method"; return 0
    fi
  fi
  if command -v xfce4-terminal >/dev/null 2>&1; then
    if _try_bg xfce4-terminal -e "specflow-watch $(_shell_quote "$target")"; then
      watch_method="xfce4-terminal"; printf 'WATCH_METHOD=%s\n' "$watch_method"; return 0
    fi
  fi
  if command -v alacritty >/dev/null 2>&1; then
    if _try_bg alacritty -e specflow-watch "$target"; then
      watch_method="alacritty"; printf 'WATCH_METHOD=%s\n' "$watch_method"; return 0
    fi
  fi
  if command -v kitty >/dev/null 2>&1; then
    if _try_bg kitty specflow-watch "$target"; then
      watch_method="kitty"; printf 'WATCH_METHOD=%s\n' "$watch_method"; return 0
    fi
  fi
  if command -v wezterm >/dev/null 2>&1; then
    if _try_bg wezterm start -- specflow-watch "$target"; then
      watch_method="wezterm"; printf 'WATCH_METHOD=%s\n' "$watch_method"; return 0
    fi
  fi
  if command -v xterm >/dev/null 2>&1; then
    if _try_bg xterm -e specflow-watch "$target"; then
      watch_method="xterm"; printf 'WATCH_METHOD=%s\n' "$watch_method"; return 0
    fi
  fi
  watch_method="manual"
  printf 'WATCH_METHOD=%s\n' "$watch_method"
  printf '💡 別ターミナルで specflow-watch %s を実行すると進捗をリアルタイムで確認できます\n' "$(_shell_quote "$target")"
  return 0
}
```

各エミュレータの起動引数契約:

| Emulator | Launch form | Quoting strategy | Verification | Notes |
| --- | --- | --- | --- | --- |
| `tmux` | `split-window -h "..."` | `printf '%q'` で target をエスケープ | `&&` (同期) | 文字列引数内で shell 展開される |
| `screen` | `-X screen cmd args` | `"$target"` (shell word) | `&&` (同期) | screen セッション内コマンド |
| `osascript` | `do script "..."` | `_qs()` でシングルクォートをエスケープし AppleScript 内に埋め込み | `&&` (同期) | `repo_dir` と `target` の両方をエスケープ |
| `$TERMINAL` | `-e cmd args` (best-effort) | `"$target"` (shell word) | `_try_bg` (PID probe) | ユーザ設定変数。`-e` 非対応の場合は PID 即死→フォールバック (D9/D10) |
| `x-terminal-emulator` | `-e cmd args` | `"$target"` (shell word) | `_try_bg` (PID probe) | Debian alternatives — 実体により挙動が変わるが `-e` が最も互換 |
| `gnome-terminal` | `-- cmd args` | `"$target"` (shell word) | `_try_bg` (PID probe) | `-e` は deprecated、`--` 以降をコマンドとして解釈 |
| `konsole` | `-e cmd args` | `"$target"` (shell word) | `_try_bg` (PID probe) | `-e` 以降を単一コマンド + 引数として解釈 |
| `xfce4-terminal` | `-e "cmd args"` | `printf '%q'` で target をエスケープ | `_try_bg` (PID probe) | `-e` は単一文字列として解釈（shell 展開されるためクォート必要） |
| `alacritty` | `-e cmd args` | `"$target"` (shell word) | `_try_bg` (PID probe) | `-e` 以降を exec |
| `kitty` | `cmd args` (直接) | `"$target"` (shell word) | `_try_bg` (PID probe) | サブコマンドなし、引数をそのまま exec |
| `wezterm` | `start -- cmd args` | `"$target"` (shell word) | `_try_bg` (PID probe) | `start` サブコマンド + `--` separator |
| `xterm` | `-e cmd args` | `"$target"` (shell word) | `_try_bg` (PID probe) | 伝統的な `-e` |
| (manual) | — | `printf '%q'` で target をクォートして表示 | — | コピー＆ペースト安全 |

この shell 関数はテンプレート生成時にインライン埋め込みされる。テンプレートのスナップショットテスト (`src/tests/__snapshots__/specflow.{watch,md}.snap`) で構造を検証するのに加え、`src/tests/specflow-watch-launcher.test.ts` で **ブランチごとの振る舞いレベル検証** を行う。具体的には: 各テストケースが `launch_watch()` を `command -v` の stub（`PATH` を制御して特定コマンドのみ解決可能にする）と env 変数 (`$TMUX`, `$STY`, `$TERMINAL`) の組み合わせで呼び出し、(1) 実行されるコマンド文字列がエミュレータ固有の引数契約に合致すること、(2) `WATCH_METHOD=<expected>` が stdout に出力されること、(3) スペースやシングルクォートを含む `target` / `repo_dir` が正しくクォートされていること、(4) 検出済みエミュレータの PID が即死した場合に `_try_bg` が失敗を返し次候補にフォールスルーすること、を検証する。テストは `child_process.execSync` で bash サブシェルを起動し、実際のシェル評価を通すことでクォーティングの正しさを実環境に近い形で保証する。PID 即死テストでは、stub エミュレータスクリプトに即座に `exit 1` させることで `_try_bg` の 200ms probe が失敗を返す振る舞いを検証する。

### 呼び出し関係（既存の向き）

```
specflow-watch.ts (CLI)
  └── buildModel() ──► WatchModel (pure)
        ├── buildHeader()            <── 変更なし（manual_fix_kind を追加）
        ├── buildReviewView()        <── visibility + loop_state + manual_fix_open_count を追加
        ├── buildTaskGraphView()     <── BundleView.tasks を埋める
        └── buildApprovalSummary()   <── NEW
  └── renderFrame() ──► string[] (pure)
        ├── renderHeader()           <── (manual fix) バッジ
        ├── renderReviewSection()    <── live/completed(+loop_state) バッジ + manual fix 行
        ├── renderTaskGraphSection() <── bundle 下に tree 行を描画
        └── renderApprovalSection()  <── NEW
```

## Persistence / Ownership

- **Read 対象の追加**:
  - `openspec/changes/<archive>/approval-summary.md` — `run.last_summary_path` が指す archive 配下パス。
  - `.specflow/runs/<run>/autofix-progress-apply_review.json` — 既存 path、watchedPaths に既に含まれる。
- **Write 対象**: なし（本 change は一切の run artifact を書かない、既存ポリシー維持）。
- **所有者**: `realtime-progress-ui` capability は watch TUI 全体を所有。`slash-command-guides` は template を所有。

## Integration Points

- **run.json**: `last_summary_path` フィールドを新たに参照（読み取りのみ）。
- **archive area**: Archive 後に `approval-summary.md` が `openspec/changes/archive/<date-change-id>/` に残る。watch はそのパスを読む。
- **外部コマンド**: `tmux`, `screen`, `osascript`, `xterm`/`gnome-terminal`/etc. 起動レシピから直接呼び出される。これらが存在しないときは自動的に次候補へ落ち、最終的に manual hint で exit 0。
- **SPECFLOW_NO_WATCH**: `/specflow` Step 3.7 のみが参照する env。`/specflow.watch` 本体は無条件に起動（ユーザの明示コマンドなので opt-out 不要）。

## Decisions

### D1: Launcher は TS ライブラリではなくテンプレート内 Bash にする

- **選択**: `assets/commands/*.md.tmpl` 内に `launch_watch()` Bash 関数として記述し、slash-command guide 生成時に埋め込む。
- **却下**: `src/lib/specflow-watch-launcher.ts` を作って `specflow-watch-launch` CLI を増やす案。
- **理由**: slash-command guide は直接 Bash ブロックを実行する前提のため、TS 経由のラッパーを挟むと読み側コスト（プロセス起動・PATH 解決）が無駄に増える。Bash レシピはテンプレートのスナップショットテストで十分検証できる。`npm test` の既存スナップショットで回帰検知可能。

### D2: `selectActiveAutofixPhase` は family 単位で広げる（draft/ready/approved を含む）

- **選択**: proposal に記載のマッピング (design_draft/design_review/design_ready → design, apply_draft/apply_review/apply_ready/approved → apply)。
- **却下**: 「現在 phase の history を遡って最後の review snapshot を返す」動的案。
- **理由**: family ルールは `current_phase` だけで決まる決定論的な純関数で、history パース不要。O(1) で予測可能。

### D3: Manual fix 判定は history 末尾 1 件のみを見る

- **選択**: `run.history[run.history.length - 1].event === "revise_*"` の単純判定。
- **却下**: `current_phase == "*_draft" && 過去に review_*` の複合条件。
- **理由**: ユーザ確認済み（proposal clarify の回答）。history 末尾で追跡する方が「次の review_* で勝手に消える」仕様と一貫する。

### D4: 子タスクは「常に」表示（折りたたみなし）

- **選択**: 既存バンドル summary 行の下に常に子タスク tree を展開。
- **却下**: 表示量軽減のためバンドル done 時は折りたたむ案。
- **理由**: ユーザ要求が「バンドル完了時に子にチェック」を明示しているため、done バンドルこそ子タスクが可視でなければ要件を満たせない。cols 幅が狭いときは title 側を truncate する既存パターンで対応。

### D5: Approval summary は正規表現抽出、サマリ 3 行のみ（セクションスコープ）

- **選択**: `Status:` 行（先頭 1 件）+ `## What Changed` セクション内（`## What Changed` から次の `##` 見出しまで）に限定した `\d+ files? changed, .+? insertions?\(\+\), .+? deletions?\(-\)` の diffstat 末尾行の 2 行。diffstat 正規表現はファイル全体ではなく `What Changed` セクションにスコープして適用する。これにより、他のセクション（例: `## Files Touched`）に類似の diffstat 風テキストが存在しても誤抽出しない。
- **却下**: 全 `What Changed` + `Files Touched` 展開。
- **理由**: TUI は既に 5 セクションあり、画面圧迫を避ける。詳細は `approval-summary.md` を直接開けば見られる。

**`Status: (unknown)` degradation path の end-to-end 契約** (F09 対応):

抽出が部分的に失敗した場合の動作は、reader → view → renderer の 3 層すべてで明示的に定義する:

| 状態 | `readApprovalSummary` 戻り値 | `buildApprovalSummary` → ApprovalSummaryView | `renderApprovalSection` 出力 |
| --- | --- | --- | --- |
| `last_summary_path == null` | `{ kind: "absent" }` | `SectionState<ApprovalSummaryView>` = `{ kind: "placeholder", message: "No approval yet" }` | dim テキスト `No approval yet` の 1 行 |
| ファイル不在 | `{ kind: "absent" }`（reader 内で区別せず absent にフォールバック） | `{ kind: "warning", message: "Approval summary missing" }` | 赤 warning `⚠ Approval summary missing` の 1 行 |
| ファイル存在・Status 行なし・diffstat あり | `{ kind: "ok", value: { status_line: null, diffstat_line: "..." } }` | `{ kind: "ok", value: { status_line: "Status: (unknown)", diffstat_line: "..." } }`（view ビルダが null を placeholder に置換） | `Status: (unknown)` + diffstat の 2 行 |
| ファイル存在・Status 行あり・diffstat なし | `{ kind: "ok", value: { status_line: "...", diffstat_line: null } }` | `{ kind: "ok", value: { status_line: "...", diffstat_line: null } }` | Status 行のみの 1 行（renderer は null の diffstat を行ごと省略） |
| ファイル存在・両方あり | `{ kind: "ok", value: { status_line: "...", diffstat_line: "..." } }` | 同一 | 2 行両方を表示 |
| ファイル存在・両方なし（malformed） | `{ kind: "ok", value: { status_line: null, diffstat_line: null } }` | `{ kind: "warning", message: "Approval summary malformed" }`（view ビルダが両方 null を warning に昇格） | 赤 warning `⚠ Approval summary malformed` |
| 読み取り例外 | `{ kind: "unreadable", reason: "..." }` | `{ kind: "warning", message: "Approval summary unreadable: ..." }` | 赤 warning 1 行 |

**テストカバレッジ**: `src/tests/specflow-watch-readers.test.ts` に 7 状態ぶんのフィクスチャを追加。`src/tests/watch-renderer.test.ts` に `buildApprovalSummary` の 7 分岐と対応する `renderApprovalSection` スナップショットを追加。

### D11: 同期ブランチ（tmux/screen/osascript）の成否判定は exit code のみ、子プロセスの起動検証は**明示的に非目標**とする

- **選択**: `tmux split-window`, `screen -X screen`, `osascript do script` の成否は **これらのラッパーコマンドの exit code** で判定する。`&&` が真 → ランチャーは `WATCH_METHOD=<sync>` を出力して `return 0`。それ以後、子プロセス (`specflow-watch`) が正常に起動したかは **ランチャーの責務ではない**。
- **却下**: (a) tmux pane 作成直後に `tmux list-panes` で pid を取得して `_try_bg` 相当の probe を行う案、(b) osascript の戻り値から Terminal window id を取得してプロセスツリーを辿る案。
- **理由**:
  - tmux/screen/osascript はウィンドウ/ペイン/タブの**作成**に責任を持つプロセスであり、その中で起動されるコマンドの成否はそれ自体の責任範囲外。`specflow-watch` が起動に失敗したケース（PATH に無い等）はその新ターミナル内にエラーメッセージが表示されるため、ユーザにとって観測可能。
  - 全ブランチに PID probe を課すと偽陽性（エミュレータが正常起動中に probe が失敗）が混入し、実際には動作する経路がフォールバックされる。
  - `_try_bg` は「バックグラウンド起動したコマンドが即座にクラッシュしたか」を検出する手段であり、同期ラッパーの戻り値チェックと目的が異なる。
- **許容するトレードオフ**: tmux/screen/osascript が success を返した後に `specflow-watch` が起動失敗する場合、ランチャーは manual fallback を発火しない。このケースでの UX 劣化はあるが、(i) 実運用で極めて稀（PATH が通らない状況は通常 `command -v` で排除済み）、(ii) ユーザは新ウィンドウ内のエラー出力から自力で判断可能、(iii) `/specflow` 本流のフローは watch 起動失敗を非致命として扱う。
- **同期と非同期の責任分離**: この設計により、`launch_watch()` の各ブランチの責任は「どのメカニズムでターミナルを起動するか」に一元化される。`_try_bg` は GUI ターミナルエミュレータのバックグラウンドプロセスが即死したケース（引数ミス、Display 接続失敗）の検出に専念する。

### D6: live/completed バッジは 2 タグのみ、abandoned は出さない

- **選択**: live (current phase ∈ review gate) と completed (family 一致 snapshot あり＋ review gate 外) の 2 値。
- **却下**: `abandoned` (stale heartbeat) を別バッジにする案。
- **理由**: `abandoned` は snapshot `loop_state` 側で表現される（既存）。badge を増やすと視覚情報が過多になる。

### D7: completed バッジは `loop_state` サフィックスを含む

- **選択**: completed バッジのテキストを `completed — <loop_state>` とする（例: `completed — terminal_success`）。`loop_state` が取得できない場合は `completed` のみ。
- **理由**: proposal が completed-family review snapshots に `loop_state` を含むバッジを要求しているため。live バッジは進行中のため `loop_state` は付与しない。

### D8: Launcher は全ブランチで shell-safe quoting を適用する

- **選択**: `launch_watch()` の冒頭で `target` と `repo_dir` を shell-safe にクォートし、各ブランチで安全に補間する。具体的には: (1) Bash 変数は常にダブルクォートで囲む (`"$target"`, `"$repo_dir"`)、(2) osascript の AppleScript 文字列にはシングルクォートのエスケープ (`'\\''`) を適用する専用ヘルパー `_qs()` を定義、(3) `xfce4-terminal -e` のような単一文字列引数を取るエミュレータでは `printf '%q'` でエスケープ。
- **却下**: パスにスペースを含まない前提で raw 補間する案。
- **理由**: リポジトリパスにスペースや特殊文字を含むケースは現実に存在し、全ブランチで安全性を保証する必要がある。

### D9: `$TERMINAL` ブランチは汎用 `-e` フォームの限界を明示しフォールバック前提で扱う

- **選択**: `$TERMINAL` が設定されている場合は `"$TERMINAL" -e specflow-watch "$target"` を試行するが、これは `-e` 契約を共有するエミュレータでのみ動作する。`$TERMINAL` が非標準引数のエミュレータ（例: `wezterm`）を指す場合は失敗し、後続の個別ブランチにフォールバックする。`$TERMINAL` ブランチの失敗を非致命的として扱い（`_try_bg` の PID probe で検出、D10 参照）、次候補の探索を続行する。
- **理由**: `$TERMINAL` はユーザが設定する自由変数であり、全エミュレータの引数契約を推測することは不可能。個別ブランチで既知エミュレータを正確にハンドリングする方が確実。

### D10: バックグラウンドブランチは `_try_bg` PID probe で成否を検証する

- **選択**: GUI ターミナルエミュレータのバックグラウンド起動ブランチすべてに `_try_bg()` ヘルパーを適用する。`_try_bg()` は `"$@" &` でプロセスをバックグラウンド起動し、200ms 後に `kill -0 "$pid"` で PID 生存を確認する。生存していれば成功 (exit 0)、消滅していれば失敗 (exit 非 0) を返し、`if _try_bg ...; then ... fi` パターンで次候補へのフォールスルーを可能にする。同期的に成否が判定できるブランチ（`tmux`、`screen`、`osascript`）は従来どおり `&&` で直接チェックする。
- **却下**: (a) `cmd & { return 0; }` — `&` は常に成功するためフォールバック不可能。(b) `cmd &` + stderr チェック — エミュレータが stderr に書くタイミングは保証されない。(c) タイムアウトなしの `wait $pid` — GUI ターミナルはウィンドウクローズまでブロックするため使用不可。
- **理由**: PID probe は「コマンドが即座にクラッシュしたか」を確実に検出できる最小限の手段。200ms はプロセス初期化の失敗（コマンド不在、引数エラー、ディスプレイ接続失敗）を捕捉するに十分で、正常起動中のエミュレータを誤判定するリスクは極めて低い。

## Risks / Trade-offs

| Risk | Mitigation |
| --- | --- |
| 新しい events 要約が長文になり行折り返しが発生 | `truncateVisible(cols)` を通す既存経路で自動処理。スナップショットテストで 80 / 120 cols の両方を固定 |
| approval-summary.md のフォーマット変化 | 正規表現は Status 行と diffstat 末尾のみを抽出する **寛容設計**。失敗時は partial display にフォールバック |
| tmux/screen/linux エミュレータ不在の CI 環境でのテスト | `specflow-watch-launcher.test.ts` が `PATH` stub で `command -v` の解決を制御し、各ブランチのコマンド文字列生成を検証。実際のエミュレータバイナリは不要 |
| `osascript` が macOS で無効化されている環境 | Path が `osascript` を見つけられなければ自動で次候補へ。最終 manual fallback で exit 0 |
| 子タスク行で cols が足りない | 既存 `truncateVisible` で title を切り詰め、glyph とチェックは残す |
| live badge の点滅で差分レンダラが点滅 | バッジ文字列は固定。`paint()` は行単位差分なので変更がある行だけ更新される |
| リポジトリパスにスペースや特殊文字を含む場合にランチャーが壊れる | `_qs()` (AppleScript) / `_shell_quote()` (printf '%q') ヘルパーで各ブランチを保護。スナップショットでクォーティング構造を検証 |
| `$TERMINAL` が非標準引数のエミュレータを指す場合 | `$TERMINAL` ブランチは `_try_bg` PID probe で失敗検出→フォールバック。個別ブランチが正確にハンドリング (D9/D10) |
| `_try_bg` の 200ms sleep が全ブランチ失敗時に累積する | `command -v` で存在しないエミュレータは事前に除外されるため、`_try_bg` が呼ばれるのは実際にバイナリが存在するブランチのみ。最悪ケース（全検出エミュレータが即死）でも数百 ms 程度 |
| `_try_bg` がエミュレータの遅い初期化を誤判定する | 200ms はプロセス起動の初期失敗（exec 失敗、引数エラー）を捕捉する閾値であり、正常起動中のプロセスが 200ms 以内に終了するケースは実質的にない |
| 既存 `watch-renderer.test.ts` の snapshot がすべて更新必要 | 本 change 対象。golden を更新して `npm test -- -u` で regenerate |

## Ordering / Dependency Notes

実装はセクション単位の純関数から順に。以下がトポロジカル順で、**バンドル単位で並列に進められる** ものは `[parallel]` を付与。

1. **Foundation** (単独・直列):
   - `model.ts` 型定義の拡張（`manual_fix_kind`, `visibility`, `manual_fix_open_count`, `BundleView.tasks`, `ApprovalSummaryView`）
2. **Readers** (`[parallel]`):
   - `artifact-readers.ts::selectActiveAutofixPhase` 拡張
   - `artifact-readers.ts::readApprovalSummary` 新設
3. **Model builders** (Foundation + Readers 完了後):
   - `buildReviewView` に `visibility` + `loop_state` + `manual_fix_open_count`
   - `buildHeader` に `manual_fix_kind` 追加（`deriveManualFixKind(run)` を切り出す）
   - `buildTaskGraphView` に `tasks[]` 射影
   - `buildApprovalSummary` 新設
4. **Renderers** (Model builders 完了後、`[parallel]`):
   - `renderHeader` に `(manual fix)` バッジ
   - `renderReviewSection` に live/completed バッジ + manual fix 行
   - `renderTaskGraphSection` に bundle 下の tree 行
   - `renderApprovalSection` 新設 + `renderFrame` に接続
5. **Watch CLI**:
   - `specflow-watch.ts::buildModel` シグネチャ更新と `watchedPaths` に approval-summary.md を追加（run.last_summary_path 非 null のとき）
6. **Templates** (Watch CLI 完了と独立、`[parallel]`):
   - `assets/commands/specflow.watch.md.tmpl` を cross-platform dispatcher に書き換え
   - `assets/commands/specflow.md.tmpl` Step 3.7 を同レシピに書き換え
7. **Tests**:
   - `src/tests/watch-renderer.test.ts` に `events / review / manual_fix / task tree / approval summary` のユニット + 1 つの snapshot を追加
   - `src/tests/specflow-watch-readers.test.ts` に `readApprovalSummary` / `selectActiveAutofixPhase` の拡張ケース。`readApprovalSummary` テストには `## What Changed` 外に diffstat 風テキストを含む decoy フィクスチャを含め、セクションスコープ抽出の正しさを検証
   - `src/tests/specflow-watch-integration.test.ts` — 既存の `--once` スモークを手動 fix / approval 双方のフィクスチャで拡張
   - 新規 `src/tests/specflow-watch-launcher.test.ts` — 各エミュレータブランチの振る舞いレベルテスト: `PATH` stub で `command -v` 解決を制御し、env 変数 (`$TMUX`, `$STY`, `$TERMINAL`) を設定、bash サブシェルで `launch_watch()` を実行して (a) 生成されるコマンド文字列がエミュレータ固有の引数契約に合致、(b) `WATCH_METHOD` 出力が正しい、(c) スペース・シングルクォート・ダブルクォートを含む target/repo_dir が正しくクォートされている、(d) 検出済みブランチの PID 即死時にフォールバックが発生する（`_try_bg` が失敗を返し次候補に遷移する）、を検証
   - `src/tests/__snapshots__/specflow.{watch,md}.snap` の再生成

## Completion Conditions

各 concern が完了したとみなすための観測可能な条件:

- **C1 Launcher**: `src/tests/__snapshots__/specflow.watch.md.snap` と `specflow.md.snap` が新しい dispatcher レシピを含み、grep で `open -a Terminal` がヒットしないこと。各エミュレータのスナップショット行がエミュレータ固有の引数形式（`gnome-terminal --`、`kitty` 直接、`wezterm start --` 等）になっていること。バックグラウンドブランチが `_try_bg` を使い `if _try_bg ...; then ... fi` 構造であること（`cmd & { return 0; }` パターンが存在しないこと）。同期ブランチ（tmux/screen/osascript）は `&&` で成否を直接チェックしていること。各ブランチの成功時に `WATCH_METHOD=<method>` がレポート出力されていること。スナップショットに `_qs()` / `_shell_quote()` / `_try_bg()` ヘルパー定義と、osascript / tmux / xfce4-terminal ブランチでのクォーティング適用、manual fallback での `_shell_quote` 適用が含まれていること。`specflow-watch-launcher.test.ts` で各エミュレータブランチの振る舞いレベルテスト（`PATH` stub + env 制御 + コマンド文字列検証 + クォーティング検証）が緑であること。さらに、検出済みブランチの PID 即死によるフォールバックを検証するテストケース（`_try_bg` が失敗を返し次候補に遷移する）が含まれること。
- **C2 Events**: `watch-renderer.test.ts` に `phase_entered → "→ apply_review (review_apply)"` など 6 件のフォーマットケースが追加され、`--once` スナップショットに具体文字列が見えること。さらに、未知の `event_kind` で `payload.summary` がフォールバック表示されるケースと、`payload.triggered_event` / `payload.outcome` が欠損時に括弧サフィックスが省略されるケースがテストに含まれること。
- **C3 Review persistence**: `selectActiveAutofixPhase` ユニットテストが 7 フェーズ分（design_draft / design_review / design_ready / apply_draft / apply_review / apply_ready / approved）緑。Integration でも `apply_ready` の `--once` フレームに Round 行が見えること。completed バッジが `completed — <loop_state>` 形式でレンダリングされ、`loop_state` が null の場合は `completed` のみになるテストケースが含まれること。
- **C4 Manual fix**: history 末尾が `revise_apply` のフィクスチャで header に `(manual fix)`、Review に `Manual fix in progress` 行が見え、続く `review_apply` を加えると両方消えるユニットテストが緑。
- **C5 Task tree**: 3 タスク × 3 status のバンドルで snapshot に `├─ [✓] / ├─ [◐] / └─ [ ]` が描画される。bundle done で子が全て `[✓]` になる分岐も snapshot でカバー。
- **C6 Approval summary**: 既存 `archive/2026-04-20-specflow-apply-1/approval-summary.md` をフィクスチャにしたユニットで `Status: ✅ No unresolved high` と `22 files changed, 3049 insertions(+), 13 deletions(-)` の 2 行だけが抽出される。さらに、`## Files Touched` などの別セクションに diffstat 風テキストを含むフィクスチャで、`What Changed` 内の正しい行のみが抽出されることを検証するテストケースが含まれること。

## Migration Plan

- **Rollout**: バグ修正 + 追加表示のみで、既存の watch 呼び出しや run artifact 契約は不変。`/specflow` / `/specflow.apply` / `/specflow.approve` 既存フローは影響を受けない。
- **Rollback**: 追加 commit を revert。`selectActiveAutofixPhase` の拡張により古い watch は新しい active phase でも動作するので forward-compatible。
- **Deploy**: `npm run build` が通ったら merge。`global/commands/*.md` は `specflow-generate-command-assets` 相当で再生成される（既存 CI にスナップショットテストがあるため、書き換え忘れは git diff で検出される）。

## Open Questions

なし — proposal の clarify ラウンドで全ての設計判断を確定済み。
