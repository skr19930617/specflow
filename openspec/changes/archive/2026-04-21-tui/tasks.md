## 1. Extract Watch Launcher CLI ✓

> Introduce a standalone specflow-launch-watch CLI that preserves the existing launch contract while removing fragile inline shell dispatch from templates.

- [x] 1.1 Implement the CLI entrypoint, empty-target pass-through, git-root cwd resolution, and always-exit-0 behavior.
- [x] 1.2 Port the 12-branch launcher dispatcher to child_process spawn and spawnSync, using argv-based invocation everywhere except the osascript and xfce4-terminal string branches.
- [x] 1.3 Centralize quoting for osascript and xfce4-terminal, preserve the Japanese manual hint, and emit exactly one WATCH_METHOD line using the basename form for TERMINAL.
- [x] 1.4 Register the new binary in the package bin map and add unit coverage for dispatcher selection, cwd fallback, and stdout contract preservation.

## 2. Add Template Positional-Arg Lint ✓

> Fail builds before template resolution when command templates embed forbidden positional placeholders inside fenced bash or sh blocks.

- [x] 2.1 Implement line-by-line fenced-block scanning for bash and sh sections and detect $1 through $9 plus $ARGUMENTS against raw template line numbers.
- [x] 2.2 Wire lint execution into src/build.ts before resolveAllTemplates so failures use the existing build error path and point at raw template locations.
- [x] 2.3 Add targeted tests for valid text fences, rejected bash placeholders, and escaped examples that should still build.

## 3. Delegate Watch Launch From Templates ✓

> Replace inline launch_watch helpers in both slash-command templates with CLI delegation while preserving runtime fallback behavior.

> Depends on: launch-watch-cli, template-positional-arg-lint

- [x] 3.1 Replace the Step 3 inline launcher in specflow.md.tmpl with a specflow-launch-watch RUN_ID call and a missing-binary manual fallback.
- [x] 3.2 Replace the Step 2 inline launcher in specflow.watch.md.tmpl with the matching specflow-launch-watch WATCH_TARGET delegation and fallback.
- [x] 3.3 Regenerate the resolved Claude command files so the shipped command bodies no longer contain launch_watch definitions.

## 4. Lock In Regression Coverage ✓

> Add regression checks and verification steps that prove the auto-launch fix and template-authoring guard remain intact.

> Depends on: watch-command-template-delegation

- [x] 4.1 Add regression assertions that regenerated specflow command bodies invoke specflow-launch-watch and never embed a launch_watch function.
- [x] 4.2 Run build and test verification for the launcher contract, template regeneration, and positional-arg lint enforcement.
- [x] 4.3 Complete the macOS Terminal.app smoke check for auto-launch from specflow and record any follow-up fixes if the reported watch method diverges.
