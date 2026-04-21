## Why

The Watch TUI auto-launch (added for `/specflow` Step 3 and `/specflow.watch` Step 2) silently fails on every platform: when Claude Code renders the slash-command template into the LLM prompt, it substitutes `$1` (and other positional arg placeholders) in fenced bash blocks. The inline `launch_watch` helper references `$1` inside three function bodies (`local target="$1"`, `_qs`, `_shell_quote`), so those references collapse to empty strings before the LLM ever executes the bash.

End result reported in [#180](https://github.com/skr19930617/specflow/issues/180): on macOS the osascript branch opens a Terminal tab that runs `cd '' && specflow-watch ''` — both the repo path and the target run-id are empty, and `cd` fails with `cd: Empty directory '' does not exist`. The TUI never starts.

The bug is **not** in the `.md.tmpl` source (the files on disk contain the correct `$1` references) — it is in the decision to embed an inline bash helper that uses positional-arg `$` placeholders inside a slash-command template that Claude Code renders with shell-style `$N` substitution.

## What Changes

- **NEW CLI**: Add `specflow-launch-watch [<run-or-change-target>]` as a standalone TypeScript binary under `src/bin/specflow-launch-watch.ts` (consistent with every other `specflow-*` binary in the suite). Contract:
  - **Target argument**: optional. When absent or empty, the helper SHALL invoke the downstream `specflow-watch` with no argument, inheriting the existing "resolve from current git branch" behavior of `specflow-watch` itself (no additional argument validation in the launcher).
  - **Working directory**: the spawned terminal SHALL start in the repo root resolved via `git rev-parse --show-toplevel`. If the helper is invoked outside a git repo, it SHALL fall back to `process.cwd()`.
  - **Dispatcher precedence**: `TMUX` → `STY` (screen) → macOS `osascript` → `$TERMINAL` → `x-terminal-emulator` → `gnome-terminal` → `konsole` → `xfce4-terminal` → `alacritty` → `kitty` → `wezterm` → `xterm` → manual fallback. Launch-unit semantics SHALL match the current inline template exactly: `tmux`=split a pane in the current window, `screen`=create a new window inside the existing screen session, `osascript`=open a new Terminal.app tab via `do script`, all other emulators=open a new window with `specflow-watch <target>` as the spawned command.
  - **stdout contract**: the helper SHALL emit `WATCH_METHOD=<method>` to stdout exactly once per invocation on the final selected branch, including the manual-fallback branch (`WATCH_METHOD=manual`). The method string SHALL match the current inline template's set: `tmux`, `screen`, `osascript`, `$TERMINAL(<name>)`, `x-terminal-emulator`, `gnome-terminal`, `konsole`, `xfce4-terminal`, `alacritty`, `kitty`, `wezterm`, `xterm`, `manual`.
  - **Manual fallback**: in addition to `WATCH_METHOD=manual`, emit the existing Japanese hint line (`💡 別ターミナルで specflow-watch <target> を実行すると進捗をリアルタイムで確認できます`).
  - **Exit code**: always 0 (launch failure is non-fatal to the main workflow).
- **Template fix**: Replace the 80+ line inline `launch_watch` bash block in `assets/commands/specflow.md.tmpl` (Step 3 item 7) and `assets/commands/specflow.watch.md.tmpl` (Step 2) with a single-line delegation:
  ```bash
  specflow-launch-watch "$RUN_ID"    # or "$WATCH_TARGET" for /specflow.watch
  ```
  No more `$1`/`$2`/`$ARGUMENTS` inside fenced bash — positional-arg substitution can no longer collapse the helpers.
- **Authoring guard**: Add a build-time lint rule (integrated into `src/build.ts` so it fails the build, consistent with the existing "unresolved insertion tag" hard-error behavior) that rejects unescaped positional-arg placeholders inside **fenced `bash` or `sh` code blocks** of `assets/commands/*.md.tmpl`. The rule is a strict literal match: any line inside a `bash`/`sh` fenced block that matches the regex `\$[0-9]\b|\$ARGUMENTS\b` SHALL fail the build. Explicitly allowed forms (because Claude Code's renderer does not substitute them, or they are documentation): `\$1` (backslash-escaped), `${1}` (brace-delimited), `$10` (two-digit, not a positional arg), any occurrence inside `text`-fenced blocks (used by every command for the user input placeholder `\`\`\`text\n$ARGUMENTS\n\`\`\``), and any occurrence in plain prose outside fenced code.
- **Tests**:
  - Unit-test `specflow-launch-watch` against a stubbed `PATH` that injects fake `tmux`/`osascript`/etc. to cover each dispatcher branch, the empty-target case, and the manual fallback.
  - Regression test: assert that the rendered `.claude/commands/specflow.md` and `.claude/commands/specflow.watch.md` do NOT contain fenced bash with `"$1"`, `"$2"`, or `"$ARGUMENTS"` — exercising both the lint and the template fix.

## Capabilities

### New Capabilities

(none — the new CLI fits under the existing `utility-cli-suite` capability.)

### Modified Capabilities

- `utility-cli-suite`: Add a requirement for `specflow-launch-watch` — the cross-platform Terminal dispatcher for the Watch TUI, with the emulator precedence order, the `WATCH_METHOD=<method>` stdout contract, and the always-exit-0 guarantee.
- `slash-command-guides`: Strengthen the `/specflow` and `/specflow.watch` guide contracts so they delegate Watch TUI launch to `specflow-launch-watch` and do NOT embed inline bash using positional-arg placeholders.
- `command-template-authoring`: Add a requirement that `.md.tmpl` files SHALL NOT contain unescaped `$1`, `$2`, ..., or `$ARGUMENTS` inside fenced code blocks, because Claude Code's slash-command renderer substitutes them at invocation time.

## Impact

- **Code**:
  - New `src/bin/specflow-launch-watch.ts` (or shell script under `scripts/`), wired into the package binary export list.
  - `src/build.ts` — add the template-body lint for positional-arg placeholders, or add a dedicated validator invoked from the existing build pipeline.
  - Template edits in `assets/commands/specflow.md.tmpl` and `assets/commands/specflow.watch.md.tmpl`.
- **Tests**: new unit tests under `src/tests/specflow-launch-watch.test.ts` plus an assertion inside the existing slash-command-render / integration suites.
- **Distribution**: package manifest (`package.json` `bin` entries or equivalent installer) updated to ship the new binary. `specflow-install` / `specflow-init` paths unaffected.
- **Docs**: brief note in the template-authoring reference that positional `$N` / `$ARGUMENTS` are forbidden inside fenced bash.
- **Backward compatibility**: none required — the inline `launch_watch` currently never works. Removing it is a pure bug fix.
