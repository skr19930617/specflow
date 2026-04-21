# utility-cli-suite Specification

## Purpose

Describe the supporting CLI tools that provide project analysis, GitHub issue
lookup, local proposal entry orchestration, diff filtering, OpenSpec artifact
discovery, and sub-issue creation.
## Requirements
### Requirement: `specflow-analyze` reports structured project metadata

`specflow-analyze` SHALL inspect a target path and SHALL emit structured project
metadata derived from the repository and common build files.

#### Scenario: Analyze reports basic project identity

- **WHEN** `specflow-analyze <path>` succeeds
- **THEN** the result SHALL include `project_name`, detected languages, and the
  detected package manager

#### Scenario: Analyze includes OpenSpec and repository context

- **WHEN** the target contains `openspec/config.yaml` or git metadata
- **THEN** the result SHALL include available OpenSpec specs and changes, plus
  repository metadata such as origin-derived owner and repo when available

### Requirement: `specflow-fetch-issue` validates issue URLs and returns schema-valid metadata

`specflow-fetch-issue` SHALL accept exactly one GitHub issue URL, resolve the
issue through `gh`, and return the validated issue payload.

#### Scenario: Missing issue URL prints usage

- **WHEN** `specflow-fetch-issue` is invoked without an argument
- **THEN** it SHALL print `Usage: specflow-fetch-issue <issue-url>` and exit
  non-zero

#### Scenario: Non-matching URLs are rejected

- **WHEN** the argument does not match `https://<host>/<owner>/<repo>/issues/<number>`
- **THEN** the CLI SHALL print `Invalid GitHub issue URL: <url>` and exit
  non-zero

#### Scenario: Non-GitHub.com hosts set `GH_HOST`

- **WHEN** the URL host is not `github.com`
- **THEN** the CLI SHALL set `GH_HOST` before calling `gh issue view`

### Requirement: `specflow-prepare-change` creates local proposal artifacts from normalized source input

`specflow-prepare-change` SHALL accept raw input as a positional argument,
auto-detect the input mode, normalize the source internally, create or reuse
the target OpenSpec change, materialize `proposal.md`, and enter
`proposal_draft`.

#### Scenario: Issue URL input triggers internal fetch and normalization

- **WHEN** `specflow-prepare-change <CHANGE_ID> <issue-url>` is invoked
- **AND** `<issue-url>` matches `https://<host>/<owner>/<repo>/issues/<number>`
- **THEN** the CLI SHALL internally invoke `specflow-fetch-issue` to resolve
  the issue
- **AND** it SHALL normalize the fetched issue into the standard source shape
- **AND** it SHALL write `openspec/changes/<CHANGE_ID>/proposal.md`
- **AND** it SHALL return a run state in `proposal_draft`

#### Scenario: Inline text input is normalized directly

- **WHEN** `specflow-prepare-change <CHANGE_ID> <inline-text>` is invoked
- **AND** `<inline-text>` does not match the issue URL pattern
- **THEN** the CLI SHALL normalize the inline text into the standard source
  shape with `kind: "inline"` and `provider: "generic"`
- **AND** it SHALL write `openspec/changes/<CHANGE_ID>/proposal.md`
- **AND** it SHALL return a run state in `proposal_draft`

#### Scenario: Missing change ids are derived from raw input

- **WHEN** `specflow-prepare-change <raw-input>` is invoked with exactly one
  positional argument and no `--source-file` flag
- **THEN** the CLI SHALL derive `CHANGE_ID` from the raw input (issue title
  for URL mode, or sanitized text for inline mode)
- **AND** it SHALL call `openspec new change <CHANGE_ID>` when the change does
  not yet exist

#### Scenario: Existing scaffold-only changes receive a seeded proposal draft

- **WHEN** `openspec/changes/<CHANGE_ID>/` exists with `.openspec.yaml` but no
  `proposal.md`
- **AND** `specflow-prepare-change <CHANGE_ID> <raw-input>` succeeds
- **THEN** it SHALL write `openspec/changes/<CHANGE_ID>/proposal.md`
- **AND** it SHALL return a run state in `proposal_draft`

#### Scenario: Run creation preserves reduced source metadata

- **WHEN** `specflow-prepare-change` starts a new run
- **THEN** it SHALL call `specflow-run start <CHANGE_ID>` with the normalized
  source metadata
- **AND** the resulting run state SHALL persist `source`

#### Scenario: Deprecated --source-file flag emits warning and functions

- **WHEN** `specflow-prepare-change <CHANGE_ID> --source-file <path>` is
  invoked
- **THEN** the CLI SHALL emit a deprecation warning to stderr:
  `"Warning: --source-file is deprecated. Pass raw input as a positional argument instead."`
- **AND** it SHALL read the pre-normalized JSON file and proceed identically
  to the current behavior

#### Scenario: Conflicting inputs are rejected

- **WHEN** both a positional `<raw-input>` argument and `--source-file` flag
  are provided
- **THEN** the CLI SHALL exit non-zero with error:
  `"Conflicting inputs: provide either a raw input argument or --source-file, not both"`

#### Scenario: Missing input is rejected

- **WHEN** no positional arguments and no `--source-file` flag are provided
- **THEN** the CLI SHALL exit non-zero with error:
  `"Missing required input: provide a raw input argument or --source-file"`

#### Scenario: Too many positional arguments are rejected

- **WHEN** more than 2 positional arguments are provided
- **THEN** the CLI SHALL exit non-zero with error:
  `"Too many arguments: expected [CHANGE_ID] <raw-input>"`

#### Scenario: Issue URL fetch failure reports the underlying error

- **WHEN** `specflow-prepare-change` detects an issue URL but
  `specflow-fetch-issue` fails
- **THEN** the CLI SHALL exit non-zero with error:
  `"Issue fetch failed: <specflow-fetch-issue error>. Verify the URL and try again."`

### Requirement: `specflow-filter-diff` emits filtered review diffs and a summary contract

`specflow-filter-diff` SHALL write the filtered diff to stdout and a JSON
summary to stderr.

#### Scenario: Deleted and rename-only changes are excluded

- **WHEN** `git diff --name-status -M100` reports a deleted file or an `R100`
  rename-only file
- **THEN** the path SHALL be excluded from the emitted diff
- **AND** the summary SHALL record the exclusion reason

#### Scenario: Built-in and environment patterns are excluded

- **WHEN** a changed file matches a built-in review-artifact pattern or a
  `DIFF_EXCLUDE_PATTERNS` glob
- **THEN** the file SHALL be excluded from the diff

#### Scenario: Empty diffs still emit a summary

- **WHEN** no files remain after filtering
- **THEN** stdout SHALL be empty
- **AND** stderr SHALL still emit a summary with zero counts

### Requirement: `specflow-design-artifacts` wraps OpenSpec status and validation

`specflow-design-artifacts` SHALL expose the `next` and `validate` helper
subcommands around OpenSpec artifact resolution.

#### Scenario: `next` returns the first ready artifact

- **WHEN** `openspec status --change <CHANGE_ID> --json` reports a ready artifact
- **THEN** `specflow-design-artifacts next <CHANGE_ID>` SHALL return `status:
  "ready"` together with the artifact id, output path, template, instruction,
  and dependencies

#### Scenario: `next` reports blocked or complete states

- **WHEN** no artifact is ready
- **THEN** the wrapper SHALL return either `status: "blocked"` with blocked ids
  or `status: "complete"` when OpenSpec reports completion

#### Scenario: `validate` normalizes OpenSpec validation output

- **WHEN** `openspec validate <CHANGE_ID> --type change --json` succeeds
- **THEN** the wrapper SHALL return `status: "valid"` when the first item is
  valid
- **AND** it SHALL return `status: "invalid"` with the parsed payload otherwise

### Requirement: `specflow-create-sub-issues` creates decomposition issues from validated stdin JSON

`specflow-create-sub-issues` SHALL read a JSON payload from stdin, validate it
against the create-sub-issues input schema, and create or reuse GitHub issues.

#### Scenario: Invalid stdin is rejected

- **WHEN** stdin is empty, malformed JSON, or fails schema validation
- **THEN** the CLI SHALL exit non-zero and print a JSON error to stderr

#### Scenario: Phase labels are ensured before issue creation

- **WHEN** valid input is processed
- **THEN** the CLI SHALL ensure `phase-<N>` labels exist for the requested
  phases before creating issues

#### Scenario: Existing decomposition ids are reused

- **WHEN** an issue already exists for the derived decomposition id
- **THEN** the CLI SHALL reuse that issue instead of creating a duplicate

#### Scenario: Summary comments remain optional

- **WHEN** `skip_comment` is true
- **THEN** the CLI SHALL skip posting the parent-issue summary comment
- **AND** it SHALL report `summary_comment_posted: false`

#### Scenario: Partial failures return exit code 2

- **WHEN** some sub-issues are created and some fail
- **THEN** the CLI SHALL exit with code `2`
- **AND** stdout SHALL still report the `created` and `failed` arrays

### Requirement: `specflow-advance-bundle` advances a single bundle status with normalization and atomic persistence

`specflow-advance-bundle` SHALL be a first-class CLI in the distribution. It SHALL advance a single bundle's status within `openspec/changes/<CHANGE_ID>/task-graph.json`, normalize child-task statuses when transitioning to a terminal status per the `task-planner` specification, re-render `openspec/changes/<CHANGE_ID>/tasks.md`, and persist both files atomically.

The CLI SHALL accept exactly three positional arguments in order:

1. `<CHANGE_ID>` — the OpenSpec change identifier
2. `<BUNDLE_ID>` — the bundle id within that change's `task-graph.json`
3. `<NEW_STATUS>` — one of `pending`, `in_progress`, `done`, or `skipped`

No flags or environment variables SHALL be required for baseline operation.

#### Scenario: Usage error on missing arguments

- **WHEN** `specflow-advance-bundle` is invoked with fewer than 3 positional arguments
- **THEN** it SHALL exit with code `1`
- **AND** stdout SHALL contain a JSON error envelope whose `error` field documents the expected usage and the allowed `NEW_STATUS` values (`pending | in_progress | done | skipped`)

#### Scenario: Invalid NEW_STATUS is rejected

- **WHEN** `specflow-advance-bundle <CHANGE_ID> <BUNDLE_ID> <invalid-status>` is invoked with any `<invalid-status>` outside `{pending, in_progress, done, skipped}`
- **THEN** it SHALL exit with code `1`
- **AND** stdout SHALL contain a JSON error envelope reporting the invalid status

### Requirement: `specflow-advance-bundle` emits a stable stdout JSON envelope

`specflow-advance-bundle` SHALL emit exactly one JSON document to stdout per invocation, so that a programmatic caller SHALL be able to `JSON.parse` the full stdout without branching on pre- vs post-argument-parse shape.

On success, the stdout document SHALL contain the fields:

- `status`: the string `"success"`
- `change_id`: the change identifier argument
- `bundle_id`: the bundle identifier argument
- `new_status`: the status that was applied
- `coercions`: the number of child-task coercions performed during the transition (zero for non-terminal transitions; zero or more for terminal transitions)

On error, the stdout document SHALL contain the fields:

- `status`: the string `"error"`
- `error`: a human-readable error message
- `change_id`, `bundle_id`, `new_status`: present when the corresponding argument was successfully parsed; omitted when the argument could not be determined (e.g., failure before argument parsing)

#### Scenario: Successful transition emits the success envelope

- **WHEN** `specflow-advance-bundle <valid-change> <valid-bundle> done` succeeds against a task-graph with a matching bundle whose transition is valid
- **THEN** the CLI SHALL exit with code `0`
- **AND** stdout SHALL contain exactly one JSON document with `status: "success"`, `change_id`, `bundle_id`, `new_status: "done"`, and a non-negative integer `coercions`

#### Scenario: Failure emits the error envelope

- **WHEN** `specflow-advance-bundle` encounters any error (missing task-graph, schema-invalid task-graph, unknown bundle id, invalid status transition, filesystem error)
- **THEN** the CLI SHALL exit with code `1`
- **AND** stdout SHALL contain exactly one JSON document with `status: "error"` and a populated `error` field

### Requirement: `specflow-advance-bundle` emits one `task_status_coercion` line per changed child task on stderr

For each child task whose status is actually changed by normalization during a terminal bundle transition, `specflow-advance-bundle` SHALL emit exactly one JSON line to stderr. No stderr line SHALL be emitted for a child task whose prior status already matches the new bundle terminal status.

Each emitted stderr line SHALL be a single-line JSON object containing at minimum:

- `event`: the literal string `"task_status_coercion"`
- `change_id`: the change identifier
- `bundle_id`: the bundle identifier
- `task_id`: the coerced child task's id
- `from_status`: the child task's prior status
- `to_status`: the terminal status the child task was coerced to

Stdout SHALL remain reserved for the result envelope; coercion audit lines SHALL NOT be written to stdout.

#### Scenario: Coercion audit line format

- **WHEN** a terminal transition coerces a child task whose prior status differs from the new bundle terminal status
- **THEN** exactly one single-line JSON object with `event: "task_status_coercion"`, `change_id`, `bundle_id`, `task_id`, `from_status`, and `to_status` SHALL be emitted to stderr for that child task

#### Scenario: No audit line when child status already matches

- **WHEN** a terminal transition's child task already holds the new terminal status
- **THEN** NO `task_status_coercion` stderr line SHALL be emitted for that child task

### Requirement: `specflow-advance-bundle` uses exit code `0` for success and `1` for any error

`specflow-advance-bundle` SHALL use a two-valued exit code contract:

- Exit code `0`: the transition completed and both `task-graph.json` and `tasks.md` were persisted atomically.
- Exit code `1`: any error condition. The stdout envelope SHALL indicate the specific error via its `error` field.

No other exit codes SHALL be used by `specflow-advance-bundle`.

#### Scenario: Success uses exit code 0

- **WHEN** `specflow-advance-bundle` completes a valid transition and persists the files
- **THEN** it SHALL exit with code `0`

#### Scenario: Every error uses exit code 1

- **WHEN** `specflow-advance-bundle` encounters any error (argument error, schema error, unknown bundle, invalid transition, filesystem error)
- **THEN** it SHALL exit with code `1`
- **AND** it SHALL NOT use any other non-zero exit code

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

