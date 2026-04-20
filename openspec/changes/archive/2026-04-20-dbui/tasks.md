## 1. Run Readers and Resolution ✓

> Resolve the tracked run and load all read-only watcher inputs from disk with tolerant parsing.

- [x] 1.1 Implement run scanning and resolution order with run_id, change_name active-run lookup, and current-branch fallback
- [x] 1.2 Add read-only loaders for run-state, optional autofix snapshots, and validated task-graph input with graceful degraded states
- [x] 1.3 Add a JSONL tailer that returns the last N events for the tracked run and ignores torn final lines
- [x] 1.4 Cover resolution and reader edge cases with unit tests for missing, malformed, and partially written artifacts

## 2. Filesystem Watch Runtime ✓

> Provide a disposable watch runtime that coalesces file events and polling fallback into a single redraw signal.

- [x] 2.1 Implement watchPaths for explicit file paths, including parent-directory watches when a watched file does not yet exist
- [x] 2.2 Combine fs.watch notifications with an 80 ms redraw debounce and a 2 second mtime and size polling fallback
- [x] 2.3 Expose normalized change callbacks and cleanup semantics that remove watchers and timers cleanly
- [x] 2.4 Add temp-directory tests covering create, update, delete, and atomic-replace scenarios across the watched paths

## 3. ANSI Watch Renderer ✓

> Render the watcher model as a full-screen ANSI TUI with stable sections, bundle progress bars, and degraded-state placeholders.

- [x] 3.1 Define the render model for header, review status, bundle progress, and recent events
- [x] 3.2 Implement 16-color ANSI frame rendering with alt-screen sections, per-section diffing, and resize-safe layout
- [x] 3.3 Render topological bundle bars, placeholder states, parse-error banners, and frozen-run messaging
- [x] 3.4 Add golden tests for startup, degraded artifacts, inactive runs, and width-clamped progress bars

## 4. Watch CLI Adapter ✓

> Ship the specflow-watch binary that wires readers, watcher runtime, and renderer into a clean terminal lifecycle.

> Depends on: watch-run-readers, watch-fs-runtime, watch-renderer

- [x] 4.1 Implement CLI argument parsing, git branch detection, and initial tracked-run resolution
- [x] 4.2 Wire initial reads, redraw pipeline, resize handling, and watch loop updates into the process adapter
- [x] 4.3 Implement read-only terminal lifecycle behavior including alt-screen enter and exit, q and Ctrl+C shutdown, and frozen-run banner handling
- [x] 4.4 Register the binary in package.json and lock the invocation contract consumed by slash-command guides

## 5. Slash Command Guide ✓

> Expose the watcher through the existing command contract pipeline and generate the /specflow.watch guide.

> Depends on: specflow-watch-cli

- [x] 5.1 Add the specflow.watch command contract entry with no phase handoff and no run hook
- [x] 5.2 Register the command body so the template-resolver pipeline emits the new guide
- [x] 5.3 Author the guide template with tmux-first launch, macOS open fallback, and explicit manual launch instructions
- [x] 5.4 Generate and verify the rendered global command artifact for specflow.watch

## 6. Acceptance and Guardrails ✓

> Prove the watcher meets the read-only and real-time acceptance criteria and does not regress existing contracts.

> Depends on: specflow-watch-cli, specflow-watch-command

- [x] 6.1 Add an import-graph or module-boundary test that blocks writer and mutation paths from the watcher binary
- [x] 6.2 Add seeded-run integration coverage for startup render, file-change redraws, inactive-run banner, resize, and clean exit
- [x] 6.3 Validate command guide generation and end-to-end CLI behavior under missing or malformed optional artifacts
- [x] 6.4 Run npm run check and resolve any typecheck, lint, format, test, or contract validation failures
