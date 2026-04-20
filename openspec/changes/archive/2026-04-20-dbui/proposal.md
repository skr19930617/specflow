## Why

Specflow runs produce rich progress signals (run-state transitions, review rounds, auto-fix iterations, task-graph bundle status, observation events) that are already persisted to the local filesystem under `.specflow/` and `openspec/changes/<change-id>/`. Today a user has to tail logs, re-run `specflow.dashboard`, or open multiple files to understand "where is my run right now?" There is no lightweight, always-on view of in-flight progress.

We want a real-time progress UI that:

- requires **no server and no database** (pure local filesystem + terminal)
- is invoked through a **slash command** (consistent with the rest of specflow)
- reflects updates **in real time** as phases, rounds, task-graph bundles, and observation events land

This unblocks faster iteration by surfacing what's happening without interrupting the main chat thread.

Source: GitHub issue #176 — "サーバーやdbを使わずにスラッシュコマンドで進捗状況をリアルタイムで見れるuiを作りたい".

## What Changes

### Command & process model

- Add a new slash command `/specflow.watch` plus a long-lived CLI binary (working name `specflow-watch`) that renders a real-time progress TUI for a single specflow run.
- **Render mode**: standalone terminal process. The binary writes a full-screen ANSI TUI to stdout, redraws on changes, and exits on `q` or Ctrl+C.
- **Invocation forms**:
  - `/specflow.watch <run-id>` — exact run.
  - `/specflow.watch <change_name>` — resolves to the latest active run of that change (same rule as the default case below).
  - `/specflow.watch` (no arg) — resolves to the latest active run for the current git branch. Resolution rule: `run.change_name == <branch>` AND `status == active`, ordered by `updated_at DESC` then `created_at DESC`; pick the first. Error clearly if no match.
- **Launch flow from the slash command**:
  1. If `$TMUX` is set → `tmux split-window` (or new-window) running `specflow-watch <run>`.
  2. Else on macOS with `open` available → spawn a new Terminal window running the same command.
  3. Else (bare Linux, VSCode integrated terminal, etc.) → print the ready-to-paste command line for the user to run manually in a separate terminal, and exit.
- Read-only consumer; never writes to run artifacts. Multiple watchers may run concurrently on the same run.

### Data sources (filesystem only; no server / no DB)

- **run-state JSON** — via `run-artifact-store-conformance`; provides run-id, change_name, current_phase, status, branch, allowed_events.
- **autofix progress snapshot** — via `review-autofix-progress-observability`; provides round N/M, unresolved high/medium, score for the active review gate (design or apply).
- **task-graph.json** — `openspec/changes/<change_name>/task-graph.json`; provides `bundles[]` with `id`, `title`, `status`, `depends_on`, and `tasks[]` (each with its own `status`). Parent bundle grouping is taken directly from this structure — no inference from `tasks.md`. **`tasks.md` is not watched** by this feature.
- **observation events log** — via `workflow-observation-events`; tailed for the most recent events belonging to this run.

### Update mechanism

- Primary: filesystem watch (chokidar-style) on the artifact paths above.
- Fallback: slow periodic poll (≈2s) to cover watcher misses and to force redraw when only mtimes change.
- Redraw is diff-based where possible to avoid flicker.

### Required display sections

1. **Run header** — run-id, change name, current phase, run status, git branch.
2. **Review round progress** — round N/M, unresolved high/medium, score; sourced from autofix-progress-snapshot.
3. **Task-graph bundled progress** — per-bundle horizontal bar (e.g., `[█████─────] 5/10`) with bundle title and status. Bundles are listed in **topological order** derived from `depends_on`; an overall "X of Y bundles done" total is shown at the top of the section.
4. **Recent observation events** — last ~5–10 events from the observation log (timestamp, event kind, short summary).

### Degraded-state behavior (per section)

- Section-level graceful degradation with placeholders:
  - No `task-graph.json` yet → "No task graph yet (generated in design phase)".
  - No active review / no autofix snapshot → "No active review".
  - No observation events recorded → "No events recorded".
  - Malformed / unparseable source → red inline warning on that section; other sections keep rendering.
- **Run-state is mandatory**: if run-state itself is missing or unreadable for the resolved run, the process exits with an error (nothing meaningful to show).

### Terminal-state lifecycle

- When `run.status` leaves `active` (completed / failed / canceled / suspended / archived), the watcher:
  - keeps the window open,
  - displays a banner such as "Run completed — press q to quit",
  - renders the final snapshot of all sections (last autofix snapshot, last task-graph, last events),
  - stops expecting further updates but still honors filesystem watches in case the run re-activates.
- Exit on `q` or Ctrl+C.

## Capabilities

### New Capabilities
- `realtime-progress-ui`: Terminal-rendered real-time view of a single specflow run, driven by read-only tailing of run-state, autofix-progress-snapshot, task-graph.json, and observation events, invoked through a slash command that auto-launches a separate terminal process.

### Modified Capabilities
- `slash-command-guides`: Add the `/specflow.watch` guide — invocation forms (run-id / change_name / no-arg), default-run resolution rule, terminal-launch flow (tmux → open → manual-fallback), and the read-only artifact contract it consumes.

## Impact

- **New code**:
  - `src/bin/specflow-watch.ts` — the long-lived TUI reader/renderer CLI.
  - A rendering helper module (e.g., `src/lib/watch-renderer/`) for layout, ANSI output, diff-based redraw, and the bundle topological-ordering logic.
  - A task-graph.json reader/typer if not already reusable from `src/lib/artifact-types.ts`.
- **New assets**:
  - `assets/commands/specflow.watch.md.tmpl` — the slash command template implementing the tmux / open / manual-fallback launch flow.
- **Consumes existing contracts (read-only, unchanged)**:
  - `run-artifact-store-conformance` (run-state reads)
  - `review-autofix-progress-observability` (autofix snapshot reads)
  - `workflow-observation-events` (event log reads)
  - task-graph.json as already emitted by the design/apply phases.
- **Dependencies**: a filesystem watcher library (reuse an existing dependency if present; otherwise a minimal `fs.watch` wrapper — decided during design). No new network / daemon / database components.
- **Concurrency**: read-only; multiple watchers on the same run are safe.
- **Platform**:
  - Primary target: macOS + Linux terminals with ANSI support.
  - Auto-launch works inside tmux and on macOS (`open`); other environments fall back to printing the command for manual execution.
