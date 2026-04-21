## ADDED Requirements

### Requirement: `specflow-launch-watch` dispatches the Watch TUI across platforms

The system SHALL provide a standalone CLI `specflow-launch-watch [<target>]`
that launches the `specflow-watch` TUI in a separate terminal session across
all supported platforms. The CLI SHALL be distributed as a TypeScript binary
under `src/bin/specflow-launch-watch.ts`, installed on PATH via the same
mechanism used for other `specflow-*` binaries.

The `<target>` positional argument is optional. When omitted or empty, the
CLI SHALL invoke `specflow-watch` with no argument (so that `specflow-watch`
applies its documented "resolve from current git branch" fallback); it SHALL
NOT reject the empty case as an error.

The CLI SHALL resolve the spawned terminal's working directory as follows:

1. Run `git rev-parse --show-toplevel` and, on success, use the resolved path.
2. If step 1 fails (not a git repository or `git` missing), fall back to
   the current `process.cwd()`.

The CLI SHALL always exit with status 0, even when no dispatcher can launch
the terminal. Launch failure SHALL NOT propagate as a non-zero exit.

#### Scenario: Empty target invokes specflow-watch with no argument

- **WHEN** `specflow-launch-watch` is invoked with no argument
- **OR WHEN** `specflow-launch-watch ""` is invoked
- **THEN** the CLI SHALL spawn `specflow-watch` without a positional argument
- **AND** the CLI SHALL NOT print any usage or error message
- **AND** the CLI SHALL exit with status 0

#### Scenario: Working directory resolves to git repo root

- **WHEN** `specflow-launch-watch <target>` is invoked inside a git repository
- **THEN** the spawned terminal's initial working directory SHALL be the
  output of `git rev-parse --show-toplevel`

#### Scenario: Working directory falls back to process.cwd outside a git repo

- **WHEN** `specflow-launch-watch <target>` is invoked from a directory that
  is not inside a git repository
- **THEN** the spawned terminal's initial working directory SHALL be the
  current `process.cwd()`
- **AND** the CLI SHALL NOT fail with a non-zero exit

#### Scenario: Launch failure is non-fatal

- **WHEN** every dispatcher branch fails to launch a terminal
- **THEN** the CLI SHALL exit with status 0
- **AND** the CLI SHALL NOT raise an unhandled exception

### Requirement: `specflow-launch-watch` applies a fixed dispatcher precedence

The CLI SHALL evaluate the following dispatcher branches in order and use
the first branch whose prerequisites are met and whose launch attempt
succeeds:

1. `TMUX` environment variable is non-empty — launch via `tmux split-window -h`.
2. `STY` environment variable is non-empty — launch via `screen -X screen`.
3. Platform is Darwin and `osascript` is on PATH — launch via Terminal.app
   `do script`.
4. `$TERMINAL` is non-empty and the referenced binary is on PATH — launch via
   `<TERMINAL> -e specflow-watch <target>`.
5. `x-terminal-emulator` is on PATH — launch via `-e specflow-watch <target>`.
6. `gnome-terminal` is on PATH — launch via `gnome-terminal -- specflow-watch <target>`.
7. `konsole` is on PATH — launch via `konsole -e specflow-watch <target>`.
8. `xfce4-terminal` is on PATH — launch via `xfce4-terminal -e "specflow-watch <target>"`.
9. `alacritty` is on PATH — launch via `alacritty -e specflow-watch <target>`.
10. `kitty` is on PATH — launch via `kitty specflow-watch <target>`.
11. `wezterm` is on PATH — launch via `wezterm start -- specflow-watch <target>`.
12. `xterm` is on PATH — launch via `xterm -e specflow-watch <target>`.
13. Manual fallback — no launch is performed.

The launch-unit semantics SHALL be:

- `tmux` — split a pane horizontally in the current window.
- `screen` — create a new window inside the existing screen session.
- `osascript` — open a new Terminal.app tab via `do script "cd '<repo-root>' && specflow-watch '<target>'"` and activate Terminal.
- `gnome-terminal`, `konsole`, `xfce4-terminal`, `alacritty`, `kitty`,
  `wezterm`, `xterm`, `$TERMINAL`, `x-terminal-emulator` — open a new
  terminal window in the user's current session.

The CLI SHALL NOT attempt to use `open -a Terminal --args bash -lc ...` on
macOS, because Terminal.app ignores `--args` and produces an empty window.

#### Scenario: tmux branch wins when $TMUX is set

- **WHEN** the CLI is invoked with `$TMUX` set to a non-empty value
- **THEN** the CLI SHALL launch via `tmux split-window -h` regardless of
  what later dispatcher branches would match

#### Scenario: osascript branch opens a new Terminal.app tab

- **WHEN** the CLI is invoked on Darwin with `osascript` on PATH and no
  earlier branch matched
- **THEN** the CLI SHALL open a new Terminal.app tab via `do script`
- **AND** the AppleScript SHALL `cd '<repo-root>'` before running
  `specflow-watch '<target>'`
- **AND** the AppleScript SHALL activate Terminal

#### Scenario: Dispatcher falls through when a branch fails

- **WHEN** a dispatcher branch's prerequisites are met but its launch
  attempt fails (non-zero exit or PID does not survive the 200ms liveness
  probe)
- **THEN** the CLI SHALL continue to the next branch in the precedence list
- **AND** the CLI SHALL NOT emit `WATCH_METHOD=<method>` for the failed
  branch

### Requirement: `specflow-launch-watch` emits a stable stdout contract

The CLI SHALL emit exactly one `WATCH_METHOD=<method>` line to stdout per
invocation, produced on the final selected branch (including the manual
fallback). The `<method>` token SHALL be drawn from the following enumerated
set and SHALL NOT be renamed or normalized:

`tmux`, `screen`, `osascript`, `$TERMINAL(<name>)`, `x-terminal-emulator`,
`gnome-terminal`, `konsole`, `xfce4-terminal`, `alacritty`, `kitty`,
`wezterm`, `xterm`, `manual`.

When the selected branch is `$TERMINAL`, the `<name>` placeholder SHALL be
the basename of the `$TERMINAL` environment variable value (for example,
`$TERMINAL(alacritty)`).

When the manual fallback branch is taken, the CLI SHALL emit both:

1. `WATCH_METHOD=manual`
2. A Japanese hint line: `💡 別ターミナルで specflow-watch <target> を実行すると進捗をリアルタイムで確認できます` — where `<target>` is shell-quoted using the same quoting used for that branch (empty when the target argument is empty).

#### Scenario: WATCH_METHOD is emitted exactly once on success

- **WHEN** any non-manual dispatcher branch succeeds
- **THEN** the CLI SHALL emit exactly one `WATCH_METHOD=<method>` line to
  stdout
- **AND** `<method>` SHALL match the branch taken (for example, `osascript`
  when the Darwin branch succeeds)

#### Scenario: Manual fallback emits both WATCH_METHOD and the hint

- **WHEN** every dispatcher branch's prerequisites fail and the CLI reaches
  the manual fallback
- **THEN** the CLI SHALL emit `WATCH_METHOD=manual` to stdout
- **AND** the CLI SHALL emit the Japanese hint line to stdout
- **AND** the CLI SHALL exit with status 0

#### Scenario: $TERMINAL branch reports the emulator basename

- **WHEN** the `$TERMINAL` branch is selected with `$TERMINAL=/usr/bin/alacritty`
- **THEN** the CLI SHALL emit `WATCH_METHOD=$TERMINAL(alacritty)` to stdout
