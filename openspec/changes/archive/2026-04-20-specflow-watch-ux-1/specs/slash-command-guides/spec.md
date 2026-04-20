## MODIFIED Requirements

### Requirement: Watch guide documents invocation forms, default run resolution, and terminal-launch fallback

The generated `specflow.watch.md` slash-command guide SHALL document three things: the accepted invocation forms, the default-run resolution rule when no argument is given, and the **cross-platform terminal-launch dispatcher** (tmux → screen → macOS Terminal via `osascript` → Linux terminal emulator → manual-command fallback). The guide SHALL NOT document any auto-launch branch that requires a server, a daemon, or a database, and SHALL NOT document the legacy `open -a Terminal -n --args bash -lc` invocation (which is unreliable because Terminal.app ignores `--args` and opens an empty window).

Specifically, the guide SHALL:

- list the invocation forms `/specflow.watch <run_id>`, `/specflow.watch <change_name>`, and `/specflow.watch` (no argument);
- document that the CLI treats the positional argument first as a `run_id`, and if not found, as a `change_name`;
- document the default-run resolution rule used when no argument is given: match `run.change_name == <current git branch>`, `status == active`, ordered by `updated_at DESC` and then `created_at DESC`, picking the first;
- document the dispatcher order as:
  1. tmux — when `$TMUX` is set, launch `specflow-watch <run>` via `tmux split-window`;
  2. screen — when `$STY` is set, attach a new window to the screen session;
  3. macOS — when `uname -s == Darwin`, open a new Terminal window via `osascript -e 'tell application "Terminal" to do script "cd <repo> && specflow-watch <run>"'`;
  4. Linux — when `$TERMINAL` is set and executable, use it; otherwise try, in order, `x-terminal-emulator`, `gnome-terminal`, `konsole`, `xfce4-terminal`, `alacritty`, `kitty`, `wezterm`, and `xterm`;
  5. manual fallback — when no dispatcher branch applies, print a single-line hint `💡 別ターミナルで specflow-watch <run> を実行すると進捗をリアルタイムで確認できます` and exit with status 0 (watch is optional; a launch failure SHALL NOT propagate as an error);
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

#### Scenario: Watch guide documents the cross-platform dispatcher order

- **WHEN** generated `specflow.watch.md` is read
- **THEN** it SHALL document the dispatcher order as tmux (gated on `$TMUX`) → screen (gated on `$STY`) → macOS (`osascript -e 'tell application "Terminal" to do script "…"'`) → Linux (`$TERMINAL` first, then the named fallback list) → manual-command fallback
- **AND** it SHALL NOT document any auto-launch path that requires a server, daemon, or database

#### Scenario: Watch guide uses osascript on macOS

- **WHEN** generated `specflow.watch.md` is read
- **THEN** the macOS branch SHALL invoke `osascript -e 'tell application "Terminal" to do script "…"'`
- **AND** it SHALL NOT include `open -a Terminal -n --args bash -lc`

#### Scenario: Watch guide names $TERMINAL as the first Linux dispatcher candidate

- **WHEN** generated `specflow.watch.md` is read
- **THEN** the Linux branch SHALL document `$TERMINAL` as the first candidate
- **AND** it SHALL document `x-terminal-emulator`, `gnome-terminal`, `konsole`, `xfce4-terminal`, `alacritty`, `kitty`, `wezterm`, and `xterm` as the subsequent fallback chain in that order

#### Scenario: Watch guide exits success on all-fail manual fallback

- **WHEN** generated `specflow.watch.md` is read
- **THEN** the manual-fallback branch SHALL document exit status 0 (watch is optional)
- **AND** it SHALL document printing a one-line manual-command hint for the user

#### Scenario: Watch guide declares the read-only artifact contract

- **WHEN** generated `specflow.watch.md` is read
- **THEN** it SHALL document that `specflow-watch` consumes run-state, autofix progress snapshot, observation events, and `task-graph.json`
- **AND** it SHALL document that `specflow-watch` does NOT consume or parse `tasks.md`
- **AND** it SHALL document that `specflow-watch` does NOT mutate any run artifact and does NOT call `specflow-run advance`

## ADDED Requirements

### Requirement: `/specflow` Step 3.7 auto-launches watch via the cross-platform dispatcher

The generated `specflow.md` slash-command guide SHALL, in the Proposal Creation step immediately after `specflow-run advance "<RUN_ID>" propose`, document an **auto-launch of `specflow-watch`** that uses the same cross-platform dispatcher defined for `/specflow.watch`. The auto-launch SHALL be skippable via the `SPECFLOW_NO_WATCH=1` environment variable and SHALL NOT block the main proposal flow.

Specifically, the auto-launch section SHALL:

- document reading `SPECFLOW_NO_WATCH` from the environment; when `SPECFLOW_NO_WATCH == "1"`, skip the launch entirely;
- document the same dispatcher order as `/specflow.watch`: tmux → screen → macOS (`osascript` do-script) → Linux (`$TERMINAL` → `x-terminal-emulator` → named emulator list → `xterm`) → manual-command hint;
- document that any launch-command failure is logged silently and SHALL NOT propagate as an error to the calling `/specflow` flow (watch is optional);
- include a final report line indicating the chosen `WATCH_METHOD` (for example `tmux`, `terminal`, `linux:gnome-terminal`, or `manual`).

The guide SHALL NOT document the legacy `open -a Terminal -n --args bash -lc` invocation.

#### Scenario: Proposal guide auto-launches watch after run enters proposal_draft

- **WHEN** generated `specflow.md` is read
- **THEN** the section that follows `specflow-run advance "<RUN_ID>" propose` SHALL contain an auto-launch block for `specflow-watch <RUN_ID>`
- **AND** the block SHALL honor `SPECFLOW_NO_WATCH=1` as a skip flag

#### Scenario: Proposal guide uses the same dispatcher as /specflow.watch

- **WHEN** generated `specflow.md` is read
- **THEN** the auto-launch block SHALL document the dispatcher order tmux → screen → macOS (`osascript` do-script) → Linux (`$TERMINAL` first, then the named fallback chain) → manual-command hint
- **AND** the macOS branch SHALL NOT document `open -a Terminal -n --args bash -lc`

#### Scenario: Proposal guide treats watch launch failure as non-fatal

- **WHEN** generated `specflow.md` is read
- **THEN** the auto-launch block SHALL document that any launch-command failure is logged silently and SHALL NOT propagate as an error to the main proposal flow
