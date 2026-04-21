# Design — Fix TUI Auto-Launch Bug (`tui`)

## Context

**The bug.** When `/specflow` reaches Step 3 (or `/specflow.watch` reaches Step 2), the generated command body includes an inline Bash `launch_watch()` function that opens a separate terminal running `specflow-watch <target>`. The function is ~80 lines, covers 12 dispatcher branches (tmux → screen → osascript → `$TERMINAL` → 9 Linux emulators → manual), and references the positional argument `$1` in three places:

- `local target="$1"` — to capture the caller's argument.
- `_qs() { printf '%s' "$1" | sed "..."; }` — AppleScript single-quote escaper.
- `_shell_quote() { printf '%q' "$1"; }` — `printf '%q'` wrapper for shell quoting.

All three are substituted to empty strings by Claude Code's slash-command renderer before the LLM executes the bash. On macOS, osascript therefore runs `cd '' && specflow-watch ''`, which fails with `cd: Empty directory '' does not exist`. Other branches are also broken; they are just less likely to be exercised. The template files on disk (`assets/commands/*.md.tmpl`) have the correct `$1`; the corruption happens only when Claude Code feeds the rendered markdown into the LLM prompt.

**Current code layout relevant to the fix.**

- `src/bin/specflow-*.ts` — all standalone CLIs are TypeScript (shebang via `tsx` or `node` through the compiled `bin/*` output). [`package.json`](package.json) declares each under the `bin` map. New CLIs follow the same pattern.
- `src/lib/git.ts` exports `projectRoot(cwd)` and `tryGit(args, cwd)` — exactly what the launcher needs for cwd resolution with fallback.
- `src/lib/process.ts` exports `resolveCommand` / `tryExec` / `exec` — building blocks for locating and spawning child processes with env overrides.
- `src/contracts/template-resolver.ts` is the only module that traverses `assets/commands/*.md.tmpl` during build. It already hard-fails the build on `validateContracts` errors and on unknown insertion tags. This is where the authoring-guard lint belongs.
- `assets/commands/specflow.md.tmpl` line 119–201 and `assets/commands/specflow.watch.md.tmpl` line 61–148 are the two sites with the inline `launch_watch()` helper.

**Why this bug is easy to miss.** The transcript looks correct on successful invocations of `/specflow.watch <run-id>` because Claude Code *does* pass positional args through when the user supplies them. The bug only triggers when the command is invoked without args (the `/specflow` auto-launch path always hits this, because the user never types `/specflow <run-id>` — they type `/specflow <issue-url>` and the slash-command renderer sees no positional arg to forward to the embedded bash).

## Goals / Non-Goals

**Goals.**

- Restore working Watch TUI auto-launch from `/specflow` Step 3 on every platform the existing inline dispatcher claimed to support (tmux, screen, osascript, `$TERMINAL`, `x-terminal-emulator`, `gnome-terminal`, `konsole`, `xfce4-terminal`, `alacritty`, `kitty`, `wezterm`, `xterm`, manual).
- Preserve the existing stdout contract (`WATCH_METHOD=<method>` on the selected branch, always exit 0, Japanese hint line on manual fallback) so the calling guide keeps reporting the same way.
- Prevent the same class of bug from recurring: forbid `$1`…`$9` / `$ARGUMENTS` inside fenced `bash`/`sh` blocks of `assets/commands/*.md.tmpl` at build time.
- Keep the rollout footprint narrow: one new binary, two template edits, one build-lint, targeted tests.

**Non-Goals.**

- No changes to the TUI itself (`src/bin/specflow-watch.ts` and `src/lib/specflow-watch/*`). The bug is in how the TUI is *launched*, not in the TUI.
- No change to run-state / workflow state machine. `specflow-run` semantics are unaffected.
- No new dispatcher branches (e.g., Warp, Hyper, Windows Terminal). The precedence list stays as-is.
- No cross-shell rewrite (e.g., to PowerShell or fish). The existing inline helper targets POSIX shells; the replacement binary uses `child_process.spawn` so it runs from any invoking shell, but the dispatched emulator invocations themselves are whatever the emulator expects.

## Decisions

### D1 — Extract the dispatcher to a standalone TS binary

**Decision.** Create `src/bin/specflow-launch-watch.ts`, registered in `package.json` `bin`, and replace the inline `launch_watch()` in both templates with a one-line invocation. The binary encapsulates the entire 12-branch dispatcher.

**Why over alternatives.**

- *Escape `$1` as `\$1` in the template.* The "minimal diff" option. Rejected because (a) Claude Code's escape semantics are undocumented and could change, (b) the inline helper still lives in the prompt consuming LLM context on every `/specflow` invocation, (c) it does nothing about the root cause (authoring in Bash inside a slash-command template).
- *Convert the dispatcher to pure JSON passed to a built-in helper.* Requires inventing a new launcher primitive. Rejected because the `specflow-*` binary pattern is already the project's answer to this.
- *Hybrid (binary + inline fallback).* Rejected because if the binary is missing, installation is broken and the run should fail loudly, not silently paper over it.

### D2 — Spawn via Node `child_process`, not shell-eval, with per-branch cwd and liveness probe

**Decision.** The binary uses `node:child_process.spawn` and `spawnSync` from `src/lib/process.ts` to invoke each dispatcher. No `exec`-style shell-string composition for any branch that takes argv directly (tmux, screen, `gnome-terminal --`, `kitty`, `wezterm start --`, `konsole -e`, `alacritty -e`, `xterm -e`, `x-terminal-emulator -e`, `$TERMINAL -e`). Branches that legitimately require a shell string — `xfce4-terminal -e "<cmd>"` and the `osascript` AppleScript body — construct the string from a narrow whitelist: `specflow-watch` as the command, the repo root path, and the target argument, all shell-quoted with a dedicated helper.

**Per-branch cwd handling.** Each branch must ensure the spawned terminal starts in the git root:

- **tmux**: `tmux split-window -h -c <root> "specflow-watch <target>"` — the `-c` flag sets the pane's starting directory.
- **screen**: `screen -X eval "chdir <root>" 'screen specflow-watch <target>'` — `chdir` sets cwd for the next `screen` command, then the nested `screen` invocation opens a new window.
- **osascript**: `cd '<root>' && specflow-watch '<target>'` — string-composed inside the `do script` body.
- **All other emulators** (gnome-terminal, konsole, alacritty, kitty, wezterm, xterm, xfce4-terminal, x-terminal-emulator, `$TERMINAL`): pass `{ cwd: root }` as the `spawn` option so the child process inherits the correct working directory.

**Failed-branch fallthrough and 200ms liveness probe.** When a dispatcher branch spawns a child process, the binary waits 200ms and then checks whether the child is still alive (PID still exists, not zombie). If the child exited non-zero or is not running after the probe window, the branch is considered failed: no `WATCH_METHOD` line is emitted, and the dispatcher falls through to the next branch in precedence order. Only the branch that passes the liveness probe (or the manual fallback, which always succeeds) emits `WATCH_METHOD=<method>`. This preserves the existing inline helper's semantics. The probe function is exposed as a named, testable function (`probeChild(pid: number, timeoutMs: number): Promise<boolean>`) so tests can assert fallthrough behavior without real emulators.

**Why.** Shell-string composition is what made the original helper fragile. Argv-based spawn eliminates all quoting bugs on the argv-accepting branches. The two legitimate string-composition branches (`xfce4-terminal`, `osascript`) remain string-based because the emulators themselves require it, so we centralize their quoting in one function and test both. Per-branch cwd handling is necessary because `spawn({ cwd })` only sets the Node child's cwd — multiplexers like tmux and screen spawn panes/windows in their own cwd context, requiring multiplexer-specific flags.

### D3 — tmux branch uses `split-window` with `-c` for repo-root cwd

**Decision.** `tmux split-window -h -c <root> "specflow-watch <target>"` — split the current pane horizontally, set the new pane's starting directory to the git root via `-c`, and run the watcher. The current inline helper does `split-window -h` already; the binary adds the explicit `-c <root>` to guarantee repo-root cwd regardless of where the tmux session's default directory points.

**Why.** Users running inside tmux expect in-session placement; opening a detached window would be surprising. Split-pane is also the one branch where "foreground control stays with the user" is most important. The `-c` flag is required because tmux panes inherit the session's default directory, not necessarily the invoking process's cwd.

### D4 — osascript branch opens a new Terminal.app tab, not a new window

**Decision.** `osascript -e 'tell application "Terminal" to do script "cd \'<root>\' && specflow-watch \'<target>\'"' -e 'tell application "Terminal" to activate'`. `do script` opens a new tab when Terminal is frontmost, or a new window with a tab when not. The subsequent `activate` brings Terminal to the foreground. This matches the current inline helper's behavior. The `open -a Terminal --args bash -lc "..."` form (a known-broken alternative) is explicitly not used.

**Why.** The `--args`-based form silently drops arguments because Terminal.app ignores them. Already documented in the template; preserved here.

### D5 — Working directory resolution: git root → process.cwd() fallback

**Decision.** The binary calls `projectRoot(process.cwd())` from `src/lib/git.ts` inside a `try`/`catch`. On success the resolved path is used as the `cd` target (for osascript) or the `spawn` option (for everything else). On failure it uses `process.cwd()`. Never throws.

**Why over alternatives.** Most specflow commands run from the repo root already, but `/specflow.watch` is explicitly allowed to run from anywhere. The git-root resolution matches the "Use the git repository root" rule from every slash-command template. `process.cwd()` fallback keeps the helper usable outside a git repo (e.g., for future ad-hoc testing).

### D6 — Empty target is not an error; invoke `specflow-watch` with no positional arg

**Decision.** When `specflow-launch-watch` is called with zero args or with an empty string (`specflow-launch-watch ""`), the helper invokes the downstream `specflow-watch` **with no positional argument** (i.e., the argv array contains only `specflow-watch`, not `specflow-watch ""`). The command argv is built conditionally: the target is appended to the argv array only when it is a non-empty string. The helper does NOT print usage or exit non-zero on empty input.

**Why.** The proposal requires invoking `specflow-watch` with no argument when the target is omitted or empty, inheriting the existing "resolve from current git branch" behavior. Passing an empty string (`""`) as a positional argument is not equivalent to omitting the argument — it changes downstream resolution and quoting behavior (e.g., `specflow-watch ""` may fail to resolve a run-id from an explicitly empty string rather than falling back to branch detection). `/specflow.watch` already accepts an empty target at the template level; the launcher must faithfully translate that to "no arg" at the process level.

### D7 — `WATCH_METHOD=<method>` is always emitted exactly once

**Decision.** The helper emits `WATCH_METHOD=<method>` to stdout on the selected branch, including `WATCH_METHOD=manual` on the fallback. No branch emits more than one such line; no branch emits zero. The method string is drawn from the fixed enumeration in the utility-cli-suite spec.

**Why.** The calling guide (`/specflow` Step 3 line `(watch: $WATCH_METHOD)`) captures this line and reports to the user. A single stable line keeps caller logic trivial (shell capture + grep), preserves exactly the current reporting format, and makes the binary fully testable by asserting stdout.

### D8 — Build-time lint for positional-arg placeholders

**Decision.** Add a linter invoked from `src/build.ts` that reads each `assets/commands/*.md.tmpl`, walks the markdown line-by-line, tracks fenced-block state (entering on ` ``` `-plus-language-tag, leaving on closing fence), and for each line *inside a `bash` or `sh` block* checks for unescaped positional-arg placeholders. The check explicitly excludes backslash-escaped forms (`\$1`, `\$ARGUMENTS`) which the spec permits — this is implemented either via a negative-lookbehind regex (`(?<!\\)\$[0-9]\b|(?<!\\)\$ARGUMENTS\b`) or by first stripping `\$`-escaped tokens from the line before applying the raw match. On match, the build fails with `assets/commands/<name>.md.tmpl:<line>: forbidden positional-arg placeholder <token> in fenced bash/sh block`. The linter runs BEFORE `resolveAllTemplates(contracts.commands)` so the error points at the raw template.

**Why over alternatives.**

- *AST / shell-parser-based check.* Correct in edge cases but adds a dependency and complexity far beyond the bug's blast radius. The regex is specific enough — the only known false-positive is a `$1` inside a bash-block comment, and literally zero templates currently have that.
- *Regex over the whole file (no fence tracking).* Would false-positive on the canonical `\`\`\`text\n$ARGUMENTS\n\`\`\`` that every command uses for the user-input placeholder.
- *CI-only lint (outside the build).* Rejected because local `bun run build` should fail fast; developers should see the error on `npm run build`, not only in CI.

### D9 — Helper binary language is TypeScript, consistent with all siblings

**Decision.** `src/bin/specflow-launch-watch.ts`, compiled to `bin/specflow-launch-watch` via the existing `tsx` / build path. No shell-script siblings allowed.

**Why.** Every `specflow-*` binary is TS. Reviewers get the same toolchain (biome, tsconfig, tests). Shelling-out logic is native to Node (`child_process`) and easier to test via mocked `PATH` + `bun:test` than a POSIX shell script.

## Risks / Trade-offs

- **[R1] Per-emulator launch semantics drift from tests to reality.** The binary is unit-tested by stubbing `$PATH` (via `env.PATH = <tmp-dir>` containing fake binaries that print their argv to a file), but on a real Linux system with an actual `gnome-terminal` installed, quirks (e.g., `gnome-terminal` forking to a session daemon and returning 0 even when the command fails) may make the `_try_bg` 200ms PID-probe flaky. **Mitigation:** preserve the exact probe logic from the current inline helper — it is known to be acceptable in the field — and expose it as a single named function that can be swapped in tests.
- **[R2] `child_process.spawn` for `osascript` on M-series macOS may prompt for Terminal-automation permissions on first run.** Same as the current inline helper (the bug is orthogonal). **Mitigation:** none needed; document in the manual-fallback hint if the first-run UX is bad.
- **[R3] New binary needs `specflow-install` re-run.** Users who upgraded via `npm update` will get the new `bin/` entry automatically. Users who pinned a local install may need a re-run of `specflow-install`. **Mitigation:** document in the proposal/release notes that the `tui` change bumps the required binary set. Per resolved OQ1, no template-side fallback is added — a missing binary is a broken installation, and the template's `$()` capture returning empty is the correct degradation. The installer is responsible for placing all binaries on PATH.
- **[R4] Lint false-negative on escaped forms we didn't anticipate.** The negative-lookbehind regex (or strip-then-match approach) matches the exact substitution tokens Claude Code uses while correctly excluding backslash-escaped forms the spec permits. If Claude Code later expands to `$TEN` or similar, the lint won't catch it. **Mitigation:** acceptable — this is a defense-in-depth lint, not a formal proof. We can tighten the regex when the substitution contract changes.
- **[R5] Lint false-positive in a comment.** A line like `# example: $1` inside `\`\`\`bash` will error. **Mitigation:** document the workaround (`# example: \$1`). No template currently has such a comment, so the cost is theoretical. Note that `\$1` and `\$ARGUMENTS` (backslash-escaped forms) are explicitly excluded from the lint and will NOT false-positive.

## Migration Plan

1. Land the binary and the template edits together in one commit.
2. Regenerate `.claude/commands/specflow.md` and `.claude/commands/specflow.watch.md` via `bun run build`.
3. CI runs the new lint. If any other `.md.tmpl` turns out to have a hidden `$N` reference, fix it in the same change.
4. Add the unit + regression tests described in the proposal.
5. No rollback strategy is required beyond `git revert`; the change is additive (new CLI + additive lint rule) and the old inline helper never worked.

## Open Questions

**OQ1 — Graceful fallback when `specflow-launch-watch` is not on PATH.** ~~RESOLVED.~~ The template SHALL NOT add a missing-binary fallback path. The proposal and the slash-command-guides acceptance criteria require the non-skip branch to call `specflow-launch-watch` directly as a single-line delegation. Adding an `if command -v … else manual-hint fi` wrapper would (a) violate the direct-delegation contract, (b) silently paper over a broken installation that should fail loudly, and (c) reintroduce template-side shell logic in the surface this change is designed to simplify. If the binary is missing, the `$()` capture returns empty and the calling guide reports no watch method — this is the correct behavior for a broken installation, and is consistent with D1's rejection of the hybrid alternative. The installer (`specflow-install`) is responsible for placing all `specflow-*` binaries on PATH.

**OQ2 — `$TERMINAL(<name>)` token format.** The utility-cli-suite spec says the token encodes the emulator basename (e.g., `$TERMINAL(alacritty)`). The current inline helper emits `$TERMINAL(<actual $TERMINAL value>)` with the full path. **Proposed resolution:** use `path.basename($TERMINAL)` to match the spec literally. Update the test to assert the basename form.

---

## Concerns

The change has three independent concerns, any one of which could be a standalone commit if we wanted, but together they fix one bug class:

- **C1 — Extract-and-delegate.** Move the 80-line inline `launch_watch()` out of the slash-command template and into a testable `src/bin/specflow-launch-watch.ts`. This resolves the template-render substitution bug by removing the `$1` references from the rendered prompt entirely.
- **C2 — Authoring guard.** Add a build-time lint that rejects positional-arg placeholders in fenced `bash`/`sh` blocks of `.md.tmpl` files. This prevents the same class of bug from being reintroduced by a future template author who doesn't know about the slash-command renderer's behavior.
- **C3 — Contract preservation.** Match the current stdout output (`WATCH_METHOD=<method>` on every path, Japanese hint on manual fallback) exactly so the calling guide's reporting line doesn't change, and so existing telemetry (if any) continues to parse the output.

## State / Lifecycle

The helper is stateless and one-shot: each invocation computes (cwd, target, env), evaluates dispatcher branches in order, spawns at most one child process, emits one `WATCH_METHOD=<method>` line, and exits 0. No persisted state, no sockets, no filesystem writes.

The build-time lint runs once per `bun run build`; it reads files, holds line-by-line state (in-fence yes/no, current fence language tag), emits zero or more errors, returns.

The templates, once regenerated, are static markdown consumed by Claude Code's slash-command loader. No runtime state from the templates themselves.

## Contracts / Interfaces

- **CLI signature.** `specflow-launch-watch [<target>]`. Exit code always 0. Stdout contains exactly one `WATCH_METHOD=<method>` line, optionally followed by the Japanese hint on manual fallback. Stderr is reserved for genuine diagnostic output (e.g., `child_process` errors that escape the per-branch try/catch) but should be empty in the happy path.
- **Downstream CLI.** `specflow-watch [<target>]` — unchanged. The helper invokes it via each dispatcher.
- **Template contract.** Two single-line invocations:
  - `/specflow.md.tmpl` Step 3: `specflow-launch-watch "$RUN_ID"` (inside a fenced bash block — allowed, because no positional-arg placeholder is used).
  - `/specflow.watch.md.tmpl` Step 2: `specflow-launch-watch "$WATCH_TARGET"` — same structure.
- **Build-lint interface.** A function `lintCommandTemplates(templatePaths: readonly string[]): LintError[]` exported from a new module (or a new function in `src/contracts/template-resolver.ts`), called by `src/build.ts` alongside `validateContracts`. Returns errors in the same shape so `main()` can print and exit 1 uniformly.

## Persistence / Ownership

No artifacts are owned by the new binary — it writes nothing to disk. The templates are owned by the build pipeline (resolution happens at build time; runtime reads the resolved `.md` in `.claude/commands/`). The lint is owned by `src/build.ts`.

`package.json`'s `bin` map gains one entry: `"specflow-launch-watch": "bin/specflow-launch-watch"`. The file is produced by the existing build step (tsc / tsx compilation of `src/bin/`) and shipped in the `bin/` directory already listed under `files`.

## Integration Points

- **`specflow-watch`** — the helper spawns this binary. Zero contract changes required.
- **`/specflow` Step 3 auto-launch** — the calling guide captures the `WATCH_METHOD=<method>` stdout line and reports it to the user. Contract preserved.
- **`/specflow.watch` user-invoked command** — same as above.
- **`src/build.ts`** — linter invocation added; existing flow unchanged otherwise.
- **Test harness** — new `src/tests/specflow-launch-watch.test.ts` uses `bun:test` (the repository's existing test runner; see any `src/tests/*.test.ts`), stubs `PATH`, stubs `process.env`, asserts stdout.

## Ordering / Dependency Notes

1. **Foundation first.** Land `src/bin/specflow-launch-watch.ts` with its unit tests. The binary must exist before the template can reference it.
2. **Then the lint.** Add the lint to `src/build.ts`. This would fail the current build (the templates still contain `$1` inside bash blocks), so the very next step must be —
3. **Template edits.** Replace the inline `launch_watch` in `assets/commands/specflow.md.tmpl` and `assets/commands/specflow.watch.md.tmpl` with the one-line delegation. After this step, `bun run build` succeeds again.
4. **Integration regression test.** Add an assertion that the regenerated `.claude/commands/specflow.md` and `.claude/commands/specflow.watch.md` do NOT contain `launch_watch()` definitions.
5. Steps 1 and 2 can be parallel if the lint is authored without the assumption that templates are already clean (it just has to be committed AFTER step 3 so CI stays green).

## Completion Conditions

- `specflow-launch-watch` exists on PATH after `bun run build && bun run install` (via the existing `specflow-install` flow).
- `bun run test` passes, including the new `specflow-launch-watch.test.ts` covering: empty target (no argv passed to `specflow-watch`), non-empty target, git-root cwd resolution, process.cwd() fallback, per-branch cwd handling (tmux `-c`, screen `chdir`, spawn `{ cwd }`), each dispatcher branch (via stubbed PATH), 200ms liveness probe pass and fail, failed-branch fallthrough (no `WATCH_METHOD` emitted on failed branch, next branch tried), manual fallback, `WATCH_METHOD=<method>` stdout format, always-exit-0.
- `bun run build` passes, and the generated `.claude/commands/specflow.md` / `.claude/commands/specflow.watch.md` contain `specflow-launch-watch "$RUN_ID"` / `specflow-launch-watch "$WATCH_TARGET"` and no `launch_watch()` function definition.
- The rendered `.claude/commands/specflow.md` and `.claude/commands/specflow.watch.md` contain no fenced `bash`/`sh` references to `$1`..`$9` or `$ARGUMENTS`.
- The rendered `/specflow` command preserves the `SPECFLOW_NO_WATCH` branch that sets `WATCH_METHOD=skipped`, while the non-skip branch directly delegates to `specflow-launch-watch`.
- `bun run build` fails fast if any `.md.tmpl` adds back an unescaped `$N` or `$ARGUMENTS` reference inside a `bash`/`sh` fenced block (backslash-escaped forms like `\$1` and `\$ARGUMENTS` are permitted and do not trigger the lint).
- Manual smoke test: from `/specflow <some-issue-url>` on macOS with Terminal.app available, a new Terminal tab opens running `specflow-watch <run-id>` in the repo root. The calling guide reports `(watch: osascript)`.
