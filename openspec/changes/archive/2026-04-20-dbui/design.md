## Context

Specflow is a CLI-first tool with a strict contract between a slash command (claude-side prose) and a set of TypeScript binaries under `src/bin/`. Runs produce artifacts on the local filesystem:

- `.specflow/runs/<run_id>/run.json` — run-state (phase, status, change_name, branch, timestamps, allowed_events).
- `.specflow/runs/<run_id>/autofix-progress-<phase>.json` — per-phase autofix snapshot.
- `.specflow/runs/<run_id>/events.jsonl` — observation events log (JSONL, append-only).
- `openspec/changes/<change_name>/task-graph.json` — task-planner graph (bundles, dependencies, per-task status).

Today a user observing progress must either re-run `/specflow.dashboard` or tail multiple files by hand. Issue #176 asks for a "no server, no DB" slash-command UI that reflects progress in real time. The tool already persists everything needed; what is missing is a lightweight reader + TUI renderer + a slash command to launch it.

The project has strict dependency hygiene (zero production deps beyond `xstate`; only node built-ins for filesystem) and a contract-first style (`src/contracts/commands.ts`, template-resolved bodies). This design preserves both.

## Goals / Non-Goals

**Goals:**
- Ship a `specflow-watch` CLI that renders a single run's progress as a full-screen ANSI TUI using only node built-ins.
- Resolve the tracked run from `run_id`, `change_name`, or the current git branch name.
- Redraw on filesystem changes to the run's artifacts; fall back to a ≈2s poll.
- Gracefully degrade when optional sources are missing / unparseable; keep the process read-only.
- Expose the CLI through a new `/specflow.watch` slash command that auto-launches a separate terminal via tmux → `open` → manual-fallback.
- Register the new command in `commandContracts` / `commandBodies` and generate the guide through the existing template-resolver pipeline.

**Non-Goals:**
- No multi-run dashboard (delegated to `/specflow.dashboard`).
- No mutation of run artifacts; no `specflow-run advance` calls from the watcher.
- No remote / network transport; no database; no daemon / supervisor.
- No parsing of `tasks.md`; the canonical task source is `task-graph.json`.
- No new runtime dependency (no chokidar, no blessed/ink); stdout ANSI only.
- No interactive navigation beyond `q` / `Ctrl+C`; no drill-down, no scroll control in v1.

## Decisions

### D1 — Full-screen ANSI TUI via stdout, no external TUI library
Render using the alt-screen buffer (`\x1b[?1049h` / `\x1b[?1049l`), cursor hide/show, and absolute-position cursor moves. Layout is a fixed vertical stack of four sections; redraw uses per-section diff so unchanged sections are not rewritten.
- **Alternative considered**: `blessed` / `ink` — rejected; both are heavy, and `ink` requires React. Project has zero prod deps other than `xstate`; keeping that invariant is more valuable than the ergonomic win.

### D2 — `fs.watch` primary, 2s mtime/size poll fallback
Use `node:fs.watch()` on the artifact directory + individual file watches for each of the four watched paths. Add a 2-second `setInterval` that stats each watched path; if mtime or size changed since last observation, trigger the same redraw pipeline. This covers macOS FSEvents quirks, editor atomic writes, and NFS / container mounts where `fs.watch` is unreliable.
- **Alternative considered**: chokidar — rejected; adds a production dependency and does not solve anything our poll fallback doesn't already solve.

### D3 — Run resolution: `run_id` first, then `change_name`, then branch fallback
```
resolveRun(arg, branch, runs):
  if arg != null:
    if runs[arg] exists: return runs[arg]                     // exact run_id
    active = runs.filter(r => r.change_name == arg && r.status == 'active')
    if active.length > 0: return first(sort(active, updated_at DESC, created_at DESC))
    error: "no active run for change '<arg>'"
  // no arg
  active = runs.filter(r => r.change_name == branch && r.status == 'active')
  if active.length > 0: return first(sort(active, updated_at DESC, created_at DESC))
  error: "no active run for current branch '<branch>'"
```
Runs are listed by scanning `.specflow/runs/*/run.json` (same pattern as `src/lib/gate-runtime.ts:434`). Git branch is resolved via `git rev-parse --abbrev-ref HEAD`.
- **Alternative considered**: accept only `run_id` — rejected; the user flow almost always starts on a branch named after the change.

### D4 — Watch set is fixed to four paths per run
The watcher registers exactly:
1. `.specflow/runs/<run_id>/run.json`
2. `.specflow/runs/<run_id>/autofix-progress-design_review.json` and `autofix-progress-apply_review.json` (both phases watched)
3. `.specflow/runs/<run_id>/events.jsonl`
4. `openspec/changes/<change_name>/task-graph.json`

**Autofix snapshot selection rule**: The renderer selects which snapshot to display deterministically based on `current_phase` from `run.json`:
- If `current_phase` is `design_review` → render `autofix-progress-design_review.json`.
- If `current_phase` is `apply_review` → render `autofix-progress-apply_review.json`.
- If `current_phase` is any other value (or neither file exists) → render "No active review".
- If both files exist but `current_phase` does not match either review gate → render "No active review" (the stale files are ignored).

This ensures the review section always reflects the active gate and never shows stale data from the wrong phase. Both files remain watched so that the watcher detects creation of either file without restart.

When a file does not yet exist, the watcher registers a watch on the parent directory for that specific filename, so creation is detected without restart.

### D5 — Launch is a claude-side skill decision, not CLI logic
`/specflow.watch` (the claude-rendered slash-command guide) owns the tmux → `open` → manual-fallback decision tree. The `specflow-watch` binary itself is agnostic: it assumes it is running in the terminal it was launched in and does nothing platform-specific. This keeps the CLI deterministic and testable, and keeps platform branching in the prose where it belongs.
- **Alternative considered**: CLI-owned launch (`specflow-watch --launch`) — rejected; would hide branching logic inside a binary that is otherwise a pure reader, and would make testing harder.

### D6 — Read-only contract, enforced by construction
The binary imports only readers: `createLocalFsRunArtifactStore` reader paths, a new observation-events tailer (read-only helper), and `task-planner` JSON parsing. It never imports `specflow-run advance`, gate writers, or any `atomicWriteText` path. A test asserts the import graph to prevent regressions.

### D7 — Terminal-state behavior: stay open with banner, resume on re-activation
On `run.status != active`, the render function treats the run as frozen: banner says `"Run <status> — press q to quit"`, sections show last-known values. Filesystem watches remain installed and the poll fallback continues running. If a subsequent write to `run.json` sets `status` back to `active`, the watcher detects the change through the normal watch/poll pipeline, clears the frozen banner, and resumes live section updates — no special reconnection logic is needed because watches were never torn down. This active → terminal → active lifecycle path must be covered by an integration test.
- **Alternative considered**: auto-exit with a 30s delay — rejected; users typically want to see the final snapshot, and manual exit costs a single keystroke.

### D8 — Bundle progress display: topological bars
Render bundles in a topological order derived from `depends_on`. Per bundle, show `[████─────] N/M` where N = tasks with `status == 'done'`, M = total tasks; overall total at the top shows `K/N bundles done` where K = bundles with `status == 'done'`. Bars are sized to fit terminal width minus label, clamped to 10–30 cells.

### D9 — Events section: tail the last 10 lines for this run
Read `events.jsonl` line by line from the end (reverse-seek; simple implementation = read all, keep last 10 matching `run_id == tracked`). At observed scales (hundreds to low-thousands of events) this is fine; if it becomes a bottleneck we can switch to a rolling window later.

### D10 — New slash command registered through existing contract pipeline
Add `specflow.watch` to `commandContracts` (`src/contracts/commands.ts`) and to `commandBodies` (`src/contracts/command-bodies.ts`). Author `assets/commands/specflow.watch.md.tmpl`. `references` is empty (no phase handoff). No run hook — the watcher does not advance the run.

## Concerns

- **C1 — Real-time run visibility**: user wants to see current phase, review round, task-graph progress, and recent events without leaving the terminal and without interrupting the main chat thread. Resolves issue #176.
- **C2 — No-server / no-DB invariant**: keep the entire feature on the local filesystem, using node built-ins only. No runtime dependency growth, no long-running auxiliary process.
- **C3 — Launch UX across environments**: choose tmux split first, then macOS `open`, then graceful manual-command fallback; never fail opaquely when auto-launch is impossible.
- **C4 — Degraded artifact states**: autofix snapshot and task-graph appear only after specific phases; events.jsonl may be empty early; task-graph.json is regenerated during design. The UI must treat "not yet" as first-class, not as error.
- **C5 — Safe coexistence with the main workflow**: the watcher runs concurrently with the writers (specflow-run, review-design, task-planner). Reads must not block or interfere with writes; a torn final line in `events.jsonl` must not crash the renderer.

## State / Lifecycle

- **Canonical source of truth**: existing artifact files on disk (`run.json`, `autofix-progress-*.json`, `events.jsonl`, `task-graph.json`). The watcher holds no durable state.
- **Derived in-memory state**: current render model (header + review + tasks + events), last-seen mtime/size per watched path, last-rendered frame (for diffing).
- **Lifecycle boundaries**:
  - start → resolve run → initial render (possibly with placeholders) → enter watch loop
  - watch loop → redraw on change → continue until `q` / `Ctrl+C` / process signal
  - on terminal-state transition: continue rendering but stop expecting further updates (logical, not physical — watchers remain installed)
  - on exit: restore the terminal (leave alt-screen, show cursor), flush stdout, exit 0
- **Persistence-sensitive state**: none in the watcher. All persisted state is owned by the existing writers; the watcher is a pure function of the disk at a point in time.

## Contracts / Interfaces

- **Artifact readers (existing, reused)**:
  - run-state: `.specflow/runs/<run_id>/run.json` (shape owned by `workflow-run-state` / `run-artifact-store-conformance`)
  - autofix snapshot: `AutofixProgressSnapshot` from `src/types/autofix-progress.ts`, validated via `validateAutofixSnapshot`
  - task-graph: `TaskGraph` from `src/lib/task-planner/types.ts`, validated via `validateTaskGraph`
- **Observation-events tailer (new, read-only helper)**: `src/lib/observation-event-reader.ts` exports `tailEventsForRun(logPath, runId, n)` returning the last `n` JSONL entries whose parsed `run_id` matches. Tolerates torn final lines.
- **Watcher abstraction (new)**: `src/lib/watch-fs.ts` exports `watchPaths(paths, { onChange, pollIntervalMs }): Disposable` — wraps `fs.watch` + `setInterval` polling behind a single event stream.
- **Renderer (new)**: `src/lib/watch-renderer/` exports a pure function `renderFrame(model, cols, rows): string` returning ANSI. `src/bin/specflow-watch.ts` is the thin process adapter that wires reader → renderer → stdout.
- **Slash-command contract (existing pipeline, new entry)**:
  - `src/contracts/commands.ts` adds a `command("specflow.watch", ...)` entry.
  - `src/contracts/command-bodies.ts` adds a `commandBodies["specflow.watch"]` entry.
  - `assets/commands/specflow.watch.md.tmpl` supplies the guide prose.

## Persistence / Ownership

- **Read-only**: run-state, autofix snapshot, observation events, task-graph. Owned by the existing producers (`specflow-run`, `specflow-review-design`, `specflow-review-apply`, `specflow-generate-task-graph`).
- **No new on-disk state**: the watcher writes nothing.
- **Artifact ownership unchanged**: we do not move or rename any existing file.
- **Command assets**: the new template (`specflow.watch.md.tmpl`) is owned by this change and built into `global/commands/specflow.watch.md` through the existing template resolver.

## Integration Points

- `run-artifact-store-conformance` — consumes run-state and autofix-progress shapes; no schema change.
- `workflow-observation-events` — consumes the JSONL log; no schema change. We add a **reader** next to the existing `local-fs-observation-event-publisher.ts` writer; the reader lives in its own file (`observation-event-reader.ts`) to avoid bloating the publisher.
- `task-planner` — imports `TaskGraph`, `Bundle`, `Task` types and the `validateTaskGraph` function from `src/lib/task-planner/index.ts`.
- `slash-command-guides` — `specflow.watch` enters via `commandContracts`; the generation pipeline produces `global/commands/specflow.watch.md` at build time.
- `tmux` / `open` — used only from the guide prose (claude-side logic); no binary dependency.

## Ordering / Dependency Notes

- **Foundational** (must land first): reader + watcher + renderer building blocks.
  - `src/lib/observation-event-reader.ts` (pure function, unit-testable)
  - `src/lib/watch-fs.ts` (pure wrapper, unit-testable with temp dirs)
  - `src/lib/watch-renderer/` — pure layout / ANSI, unit-testable with golden frames
- **CLI glue**: `src/bin/specflow-watch.ts` depends on all three foundational modules + existing run-state / autofix snapshot readers.
- **Contract / template**: `commandContracts` + `commandBodies` entry and the `.md.tmpl` can land in parallel with the CLI glue; they only influence the generated slash-command prose.
- **Tests**: unit tests for each foundational module and the run-resolution function are written alongside (TDD); an integration test drives `specflow-watch` against a seeded `.specflow/runs/` tree.

## Completion Conditions

- `specflow-watch` binary exists under `src/bin/`, is declared in `package.json` `bin`, and runs end-to-end against a seeded run directory.
- The binary renders the four required sections (or their placeholders) within one render cycle of startup.
- Modifying any of the four watched paths in a seeded run causes a redraw within ≈2 seconds.
- `run.status != active` triggers the "press q to quit" banner; `q` and `Ctrl+C` both exit cleanly and restore the terminal.
- `/specflow.watch` appears in `global/commands/` after `npm run build`, matching the slash-command-guides spec delta.
- `npm run check` passes (typecheck, lint, format, tests, contract validation).

## Risks / Trade-offs

- **[R1] `fs.watch` reliability varies across platforms** → Mitigation: 2s polling fallback (D2); tests exercise both paths.
- **[R2] Large `events.jsonl` read-all tail cost** → Mitigation: at expected scales (hundreds of events per run) this is negligible; if it becomes a problem, swap to rolling-window tail. Not a blocker.
- **[R3] Terminal resize** → Mitigation: handle `process.stdout.on('resize', ...)`, force a full redraw; layout is a vertical stack so reflow is cheap.
- **[R4] tmux/open auto-launch failures across environments** → Mitigation: D5 places launch logic in the claude prose with an explicit manual-command fallback documented in the spec delta; the CLI never fails because of launch mode.
- **[R5] Watcher lag vs. writer atomic-renames** → Mitigation: poll fallback catches writes the watcher misses; torn JSONL lines are tolerated by the reader.
- **[R6] Accidentally introducing a mutation path** → Mitigation: D6 import-graph test asserts no writer modules are reachable from `src/bin/specflow-watch.ts`.

## Migration Plan

No data migration; this is purely additive.

- Ship: land modules + tests + contract entry + template in a single PR.
- Rollback: revert the commit; no persistent state was written, so no cleanup is required. Users still on the old tree see no difference.

## Open Questions

- **OQ1 — Default refresh debounce**: should rapid consecutive filesystem events coalesce into a single redraw within a short window (e.g., 80 ms)? Default answer: yes, coalesce at 80 ms; revisit if the perceived latency is too high.
- **OQ2 — Color theme**: use 16-color ANSI only (maximum terminal compatibility) or detect truecolor for severity badges? Default answer: 16-color only in v1; revisit if users ask for richer output.
