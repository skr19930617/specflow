## ADDED Requirements

### Requirement: Watch TUI launch guides delegate to `specflow-launch-watch`

The generated `/specflow` and `/specflow.watch` guide files SHALL delegate
the Watch TUI launch to the `specflow-launch-watch` CLI. They SHALL NOT
embed an inline Bash dispatcher function in a fenced `bash` or `sh` code
block, because Claude Code's slash-command renderer substitutes positional
argument placeholders (`$1`, `$2`, ..., `$9`, `$ARGUMENTS`) at invocation
time, which silently corrupts any inline shell helper that references
those placeholders.

Concretely:

- The generated `specflow.md` (rendered from `assets/commands/specflow.md.tmpl`)
  SHALL launch the Watch TUI via a single-line invocation of the form
  `specflow-launch-watch "$RUN_ID"` (Step 3, auto-launch block).
- The generated `specflow.watch.md` (rendered from
  `assets/commands/specflow.watch.md.tmpl`) SHALL launch the Watch TUI via
  a single-line invocation of the form `specflow-launch-watch "$WATCH_TARGET"`
  (Step 2, dispatcher block).
- Neither file SHALL contain a fenced `bash` or `sh` block that defines a
  local `launch_watch()` function or that references `$1`, `$2`, ..., `$9`,
  or `$ARGUMENTS` inline.

#### Scenario: /specflow delegates TUI launch to specflow-launch-watch

- **WHEN** the generated `.claude/commands/specflow.md` is read
- **THEN** Step 3's Watch TUI launch SHALL invoke `specflow-launch-watch "$RUN_ID"`
- **AND** the file SHALL NOT contain a fenced `bash`/`sh` block that defines
  an inline `launch_watch()` function
- **AND** the file SHALL NOT contain any fenced `bash`/`sh` block that
  references `$1`, `$2`, ..., `$9`, or `$ARGUMENTS`

#### Scenario: /specflow.watch delegates TUI launch to specflow-launch-watch

- **WHEN** the generated `.claude/commands/specflow.watch.md` is read
- **THEN** Step 2's dispatcher block SHALL invoke
  `specflow-launch-watch "$WATCH_TARGET"`
- **AND** the file SHALL NOT contain a fenced `bash`/`sh` block that defines
  an inline `launch_watch()` function
- **AND** the file SHALL NOT contain any fenced `bash`/`sh` block that
  references `$1`, `$2`, ..., `$9`, or `$ARGUMENTS`

#### Scenario: SPECFLOW_NO_WATCH skip still delegates rather than inlines

- **WHEN** the generated `specflow.md` is read and the `SPECFLOW_NO_WATCH`
  skip branch is inspected
- **THEN** the skip branch SHALL set `WATCH_METHOD=skipped` without invoking
  any inline shell helper
- **AND** the non-skip branch SHALL call `specflow-launch-watch` directly
