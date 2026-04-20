## ADDED Requirements

### Requirement: Watch guide documents invocation forms, default run resolution, and terminal-launch fallback

The generated `specflow.watch.md` slash-command guide SHALL document three things: the accepted invocation forms, the default-run resolution rule when no argument is given, and the terminal-launch sequence (tmux first, macOS `open` second, manual-command fallback last). The guide SHALL NOT document any auto-launch branch that requires a server, a daemon, or a database.

Specifically, the guide SHALL:

- list the invocation forms `/specflow.watch <run_id>`, `/specflow.watch <change_name>`, and `/specflow.watch` (no argument);
- document that the CLI treats the positional argument first as a `run_id`, and if not found, as a `change_name`;
- document the default-run resolution rule used when no argument is given: match `run.change_name == <current git branch>`, `status == active`, ordered by `updated_at DESC` and then `created_at DESC`, picking the first;
- document the tmux branch first: when `$TMUX` is set, launch `specflow-watch <run>` in a new tmux pane or window;
- document the macOS branch second: when `$TMUX` is not set and `open` is available on `PATH`, open a new Terminal window running `specflow-watch <run>`;
- document the manual fallback last: when neither tmux nor `open` applies, print the exact command line for the user to run manually in a separate terminal and exit;
- document that the watcher is read-only: it consumes run-state, autofix progress snapshot, observation events, and `task-graph.json` only, and never mutates run artifacts.

#### Scenario: Watch guide lists the three invocation forms

- **WHEN** generated `specflow.watch.md` is read
- **THEN** it SHALL document `/specflow.watch <run_id>`, `/specflow.watch <change_name>`, and argument-less `/specflow.watch`
- **AND** it SHALL document that the positional argument is interpreted first as a `run_id` and then as a `change_name`

#### Scenario: Watch guide documents the default-run resolution rule

- **WHEN** generated `specflow.watch.md` is read
- **THEN** it SHALL document that the argument-less form resolves to the run whose `change_name` matches the current git branch and whose `status == active`
- **AND** it SHALL document the tie-break ordering as `updated_at DESC` then `created_at DESC`, picking the first match
- **AND** it SHALL document that a clear error is produced when no run matches

#### Scenario: Watch guide documents the tmux-then-open-then-manual launch sequence

- **WHEN** generated `specflow.watch.md` is read
- **THEN** it SHALL document the tmux branch as the first attempt (gated on `$TMUX` being set)
- **AND** it SHALL document the macOS `open` branch as the second attempt
- **AND** it SHALL document the manual-command fallback as the last branch, printing the ready-to-paste `specflow-watch <run>` command
- **AND** it SHALL NOT document any auto-launch path that requires a server, daemon, or database

#### Scenario: Watch guide declares the read-only artifact contract

- **WHEN** generated `specflow.watch.md` is read
- **THEN** it SHALL document that `specflow-watch` consumes run-state, autofix progress snapshot, observation events, and `task-graph.json`
- **AND** it SHALL document that `specflow-watch` does NOT consume or parse `tasks.md`
- **AND** it SHALL document that `specflow-watch` does NOT mutate any run artifact and does NOT call `specflow-run advance`

### Requirement: Watch command is registered in the slash-command registry

The slash-command registry SHALL include a `specflow.watch` entry alongside the other support commands, with a template path pointing to `assets/commands/specflow.watch.md.tmpl` and an output path under `global/commands/specflow.watch.md`.

#### Scenario: Watch command appears in the registry

- **WHEN** the command registry is inspected
- **THEN** it SHALL include `specflow.watch`
- **AND** `specflow.watch` SHALL render to `global/commands/specflow.watch.md`
- **AND** `specflow.watch` SHALL declare a `templatePath` pointing to `assets/commands/specflow.watch.md.tmpl`
