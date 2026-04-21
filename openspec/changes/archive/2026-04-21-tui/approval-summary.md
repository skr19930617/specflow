# Approval Summary: tui

**Generated**: 2026-04-21T10:24:32Z
**Branch**: tui
**Status**: ✅ No unresolved high

## What Changed

```
 assets/commands/specflow.md.tmpl               |  88 +-----
 assets/commands/specflow.watch.md.tmpl         | 132 ++------
 bin/specflow-launch-watch                      |   2 +
 package.json                                   |   1 +
 src/bin/specflow-launch-watch.ts               | 405 +++++++++++++++++++++++++
 src/build.ts                                   |  19 +-
 src/contracts/orchestrators.ts                 |   9 +
 src/contracts/template-resolver.ts             |  88 ++++++
 src/tests/__snapshots__/specflow.md.snap       |  88 +-----
 src/tests/__snapshots__/specflow.watch.md.snap | 132 ++------
 src/tests/command-template-lint.test.ts        | 164 ++++++++++
 src/tests/specflow-launch-watch.test.ts        | 344 +++++++++++++++++++++
 src/tests/specflow-template-regression.test.ts | 123 ++++++++
 src/tests/specflow-watch-launcher.test.ts      | 224 --------------
 14 files changed, 1202 insertions(+), 617 deletions(-)
```

## Files Touched

```
assets/commands/specflow.md.tmpl
assets/commands/specflow.watch.md.tmpl
bin/specflow-launch-watch
package.json
src/bin/specflow-launch-watch.ts
src/build.ts
src/contracts/orchestrators.ts
src/contracts/template-resolver.ts
src/tests/__snapshots__/specflow.md.snap
src/tests/__snapshots__/specflow.watch.md.snap
src/tests/command-template-lint.test.ts
src/tests/specflow-launch-watch.test.ts
src/tests/specflow-template-regression.test.ts
src/tests/specflow-watch-launcher.test.ts
```

## Review Loop Summary

### Design Review

| Metric             | Count |
|--------------------|-------|
| Initial high       | 1     |
| Resolved high      | 1     |
| Unresolved high    | 0     |
| New high (later)   | 0     |
| Total rounds       | 3     |

### Impl Review

| Metric             | Count |
|--------------------|-------|
| Initial high       | 1     |
| Resolved high      | 2     |
| Unresolved high    | 0     |
| New high (later)   | 1     |
| Total rounds       | 3     |

## Proposal Coverage

| # | Criterion (summary) | Covered? | Mapped Files |
|---|---------------------|----------|--------------|
| 1 | NEW CLI `specflow-launch-watch` — all sub-contracts (optional target, git-root cwd with process.cwd fallback, 12-branch dispatcher, `WATCH_METHOD=<method>` stdout, Japanese hint on manual fallback, always exit 0) | Yes | src/bin/specflow-launch-watch.ts, bin/specflow-launch-watch, package.json, src/contracts/orchestrators.ts |
| 2 | Template fix: replace 80-line inline `launch_watch` with single-line `specflow-launch-watch "$RUN_ID"` / `"$WATCH_TARGET"` delegation | Yes | assets/commands/specflow.md.tmpl, assets/commands/specflow.watch.md.tmpl, src/tests/__snapshots__/specflow.md.snap, src/tests/__snapshots__/specflow.watch.md.snap |
| 3 | Build-time authoring guard rejecting `$1`..`$9` / `$ARGUMENTS` in fenced `bash`/`sh` blocks | Yes | src/contracts/template-resolver.ts (`lintCommandTemplates`), src/build.ts |
| 4 | Unit tests for dispatcher precedence, empty-target, manual fallback | Yes | src/tests/specflow-launch-watch.test.ts |
| 5 | Regression tests that the rendered `.claude/commands/specflow.md` / `specflow.watch.md` do not embed inline `launch_watch` and contain no `$N`/`$ARGUMENTS` in bash/sh fences | Yes | src/tests/specflow-template-regression.test.ts, src/tests/command-template-lint.test.ts |

**Coverage Rate**: 5/5 (100%)

## Remaining Risks

- R2-F01: Manual fallback breaks the empty-target contract (severity: medium)
- R3-F01: Launcher coverage misses required dispatcher and cwd scenarios (severity: medium)
- R3-F02: Template lint only scans registered command templates, not every assets/commands (severity: medium)
- R3-F06 (design): Template delegation steps leave WATCH_METHOD reporting underspecified (severity: medium)
- R3-F07 (design): Dispatcher execution model is still ambiguous for tmux/screen and sync launches (severity: medium)

## Human Checkpoints

- [ ] Run the full suite (`npm run test`) on a clean clone to confirm the 832 tests pass end-to-end on your machine (not only in this working tree).
- [ ] Manually trigger `/specflow` with a throwaway GitHub issue on each target platform you care about (macOS Terminal.app, Linux with gnome-terminal, tmux, xterm) and verify the Watch TUI auto-launches and `WATCH_METHOD=<method>` reflects the actual branch taken.
- [ ] Confirm the `specflow-launch-watch` binary is on PATH for users upgrading via `npm update` vs. a manual `specflow-install`, and document any upgrade step in release notes if the binary set has changed.
- [ ] Decide whether the three MEDIUM findings (manual-fallback empty-target token, lint scope restricted to registered templates, missing tmux/screen/osascript/x-terminal-emulator/alacritty/cwd tests) should be tracked as follow-up issues or deferred as accepted risks.
- [ ] Review the two design-ledger MEDIUMs (WATCH_METHOD reporting spec detail, tmux/screen sync-launch execution model) and decide whether to tighten the `utility-cli-suite` spec language in a follow-up.
