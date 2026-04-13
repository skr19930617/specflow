## Why

Today `specflow-run` conflates four concerns in a single CLI entrypoint
(`src/bin/specflow-run.ts`): CLI arg parsing, filesystem discovery (workflow
JSON lookup, artifact stores), git-derived workspace context, and the core
runtime logic that advances the workflow state machine. This prevents the
workflow core from being reused outside the local CLI — e.g. from tests, from
an alternative runtime, or from a server adapter — even though
`openspec/specs/repo-responsibility/spec.md` already declares workflow core
and the bundled local reference implementation as separate responsibilities.

Splitting them now makes the core runtime callable with injected
`RunArtifactStore`, `ChangeArtifactStore`, and `WorkspaceContext` dependencies,
while keeping `specflow-run` as a thin local wiring layer. This aligns the
code shape with the already-specified repo boundary and unblocks future
alternative runtimes without changing user-visible behavior.

## What Changes

- Introduce a new `src/core/` directory that houses the core runtime module.
  It exposes the seven workflow-advancing commands currently implemented in
  `src/bin/specflow-run.ts`:
  - `start` — create a run for a change or a synthetic run
  - `advance` — apply an event and transition the run state
  - `suspend` — mark a run suspended
  - `resume` — mark a suspended run active
  - `status` — return current run state
  - `update-field` — patch a single field on run state
  - `get-field` — read a single field from run state

  Each core function takes `(RunArtifactStore, ChangeArtifactStore | null,
  WorkspaceContext | null, WorkflowDefinition | null, input)` — only the
  collaborators each command actually needs. No `process.argv`, no
  filesystem discovery, no git calls inside core.
- The core runtime SHALL accept a **pre-parsed `WorkflowDefinition`** as a
  plain JSON object (matching the existing `state-machine.json` shape); the
  state-machine.json discovery (project local / dist / installed) stays in
  the local wiring layer. No discovery-derived metadata is injected beyond
  the parsed definition itself.
- The core runtime SHALL NOT call `process.exit`, `process.stderr`, or
  `process.stdout`. Instead, every command returns a **discriminated
  `Result<Ok, CoreRuntimeError>`**, where `CoreRuntimeError` is a union
  shaped as `{ kind, message, details? }` with `kind` drawn from a closed
  set (e.g. `not_in_git_repo`, `run_not_found`, `invalid_event`,
  `invalid_arguments`, `change_proposal_missing`, `schema_mismatch`).
  Success payloads carry the JSON object that the CLI currently prints to
  stdout.
- Because the current CLI emits output only terminally per command
  (no mid-run progress), the core runtime does **not** need a logger or
  event sink injected — the returned success payload contains everything
  the wiring layer needs to print.
- Move CLI parsing, workflow-JSON discovery, process I/O mapping, artifact
  store construction (`createLocalFsRunArtifactStore`,
  `createLocalFsChangeArtifactStore`), and workspace-context creation
  (`createLocalWorkspaceContext`) into a `local wiring` layer that remains
  the binary at `src/bin/specflow-run.ts`. The wiring layer maps each
  `CoreRuntimeError.kind` to the existing stderr message format and exits
  with code 1 (matching today's uniform exit behavior); success payloads
  are written to stdout as JSON.
- Inject `RunArtifactStore`, `ChangeArtifactStore`, and `WorkspaceContext`
  through the core runtime entry signatures instead of resolving them inside
  the CLI body. These three interfaces already cover every filesystem and
  git touchpoint in today's `specflow-run.ts`, except the `state-machine.json`
  read and the `process.env.HOME` lookup used during discovery — both of
  which stay in the wiring layer by design.
- Preserve the existing CLI surface: flags, exit codes, JSON output shapes,
  and run-state semantics described in `workflow-run-state` and
  `utility-cli-suite` SHALL NOT change.
- Migrate the behavioral coverage currently in CLI tests to core-runtime
  tests that exercise the runtime with an in-memory `RunArtifactStore` /
  `ChangeArtifactStore` and a fake `WorkspaceContext`. The CLI layer retains
  only **smoke tests** covering argv parsing and error/exit mapping.

## Capabilities

### New Capabilities

_None._ This change is a structural refactor; no new user-visible capability
is introduced. The core runtime already exists conceptually inside
`workflow-run-state`; this proposal only makes its injection contract
explicit.

### Modified Capabilities

- `workflow-run-state`: introduce requirements that the workflow commands are
  exposed as a CLI-independent core runtime callable with injected
  `RunArtifactStore`, `ChangeArtifactStore`, `WorkspaceContext`, and a
  pre-parsed `WorkflowDefinition`; that the core returns typed
  `Result<Ok, CoreRuntimeError>`; and that `specflow-run` is the local
  wiring layer mapping those Results to stderr/stdout/exit. Existing
  observable CLI behavior is preserved.

## Impact

- Code: new `src/core/` directory hosts the core runtime module(s);
  `src/bin/specflow-run.ts` shrinks to argv parsing + workflow JSON
  discovery + store construction + `Result → process I/O` mapping.
- Tests: `src/tests/` gains core-runtime tests driven by in-memory stores
  and a fake `WorkspaceContext` test helper. Behavioral assertions are
  migrated from the CLI tests to the core tests; the CLI test layer keeps
  only smoke tests for argv parsing and stderr/exit mapping.
- Public surface: none. CLI flags, exit codes, stderr wording, and JSON
  output are preserved.
- Dependencies: no new runtime dependencies.
- Systems: none outside this repo.
