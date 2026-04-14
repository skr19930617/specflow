## Why

The current specflow runtime invokes main agents via `callMainAgent()` and review
agents via `callReviewAgent()`, each of which spawns a brand-new agent process
per invocation. In the upcoming server-mode orchestration (Epic #127), a single
change needs to drive many agent turns (proposal → clarify → challenge → design →
apply), and each turn discards the context built up by the previous one. Server
needs **1 change = 1 persistent session per main agent** so that context (prior
messages, cached reasoning) accumulates across phases, and explicit lifecycle
control so sessions are reclaimed on terminal states.

## What Changes

- Introduce a new **`agent-session-manager`** capability that defines an
  `AgentSessionManager` interface with three operations:
  - `create(changeId, config) → SessionHandle` — opens a persistent session for
    a given change and agent configuration.
  - `send(handle, message) → Promise<AgentResponse>` — sends one message to the
    live session and awaits the response.
  - `destroy(handle) → void` — tears down the session and releases resources.
- Map the interface onto provider-specific persistence mechanisms:
  - **Claude** — use `--session-id` to resume a named session across turns.
  - **Codex** — use the equivalent resume/session mechanism.
  - **Copilot** — use an **in-process shim**: keep the Copilot CLI alive as a
    long-running child process and write each message to its stdin, reading
    responses from stdout. Copilot lacks a native `--session-id`, so the
    "persistent session" externally looks identical to Claude/Codex even though
    the adapter's internal strategy is process-resident rather than session-id
    resume.
- Wire the session lifecycle to run state: a session is created when the main
  agent first runs for a change, reused for every subsequent main-agent turn in
  that change, and destroyed on **any** terminal transition — `approve`,
  `reject`, `suspend`, or `decompose` — so that no agent process or
  accumulated context leaks past the change boundary.
- Enforce **one main session per change** with idempotent `create`:
  - `create(changeId, config)` where a live session already exists for that
    changeId with the **same** config SHALL return the existing `SessionHandle`
    (idempotent reuse).
  - `create(changeId, configB)` where the live session was created with
    `configA ≠ configB` SHALL throw `ConfigMismatchError`. The caller must
    `destroy` first and then `create` with the new config.
  - The manager MUST NOT hold two concurrent sessions for the same change.
- **Recovery is the caller's responsibility.** If a send fails because the
  underlying session has died (process crash, stdin closed, timeout), `send`
  SHALL surface the failure as a typed `SessionError`; the caller (router /
  orchestrator) is expected to `destroy` the dead handle and `create` a fresh
  one. The manager itself does not buffer history or auto-replay.
- **`SessionError` is a discriminated union** covering all session-fatal
  failure modes: `ProcessDied | Timeout | AuthFailure | MalformedResponse`.
  `AgentConfig` includes a `sendTimeoutMs` field so the caller controls the
  timeout budget per agent provider.
- **Concurrent `send()` calls are serialized by the manager.** The manager
  holds an internal serial queue per handle so that callers may issue `send`
  concurrently without corrupting session state; the queue guarantees FIFO
  ordering.
- **Startup cleanup for orphaned sessions.** On initialization the manager
  SHALL scan for stale sessions from a previous host-process lifecycle (e.g.,
  leftover Copilot child PIDs, abandoned Claude session IDs) and destroy them
  before accepting new `create` calls, preventing resource leaks from host
  crashes.
- **Keep review agents on the existing fresh-process model.** Review is an
  independent judgment step; reusing accumulated context would bias reviews
  toward the main agent's prior reasoning. This is an explicit non-change.

## Capabilities

### New Capabilities

- `agent-session-manager`: Persistent-session lifecycle for main agents — defines
  the `AgentSessionManager` interface, its `create`/`send`/`destroy` contract,
  idempotent create semantics, `SessionError` discriminated union, internal
  send serialization, startup orphan cleanup, the provider-specific session-id
  mappings (Claude, Codex, Copilot), and the binding of session lifetime to
  change run state (create on first main-agent turn, destroy on all terminal
  transitions: approve/reject/suspend/decompose).

### Modified Capabilities

- `review-orchestration`: Clarify that review agents SHALL continue to run in a
  fresh process per invocation and SHALL NOT share sessions with main agents,
  to preserve independent judgment. Main-agent invocations move to the
  `agent-session-manager` contract; review invocations remain on the existing
  per-call process model.

## Impact

- **Adoption scope**: **server-mode only** in this change. The local runtime's
  `callMainAgent()` stays on the existing fresh-process model; migration to
  `AgentSessionManager` in local mode is deferred to a follow-up change.
  `callReviewAgent()` remains untouched everywhere.
- **Dependencies** (must land or align with):
  - #129 **Phase Contract** — **hard block.** This change MUST NOT merge until
    #129 is merged. `send(handle, message)` SHALL import the phase-contract
    `AgentMessage` / `AgentResponse` types directly rather than define
    placeholder types. If #129 slips, this change waits.
  - **Deterministic Phase Router** (already merged on this branch's parent) —
    the Router decides *when* a session should be invoked; the session manager
    provides *how*.
- **Lifecycle coupling**: the run-state machine (`workflow-run-state`) gains an
  implicit obligation to invoke `destroy()` on **every** terminal transition
  — `approve`, `reject`, `suspend`, and `decompose` — to prevent agent
  processes or session IDs from leaking past a change. This is a behavioral
  coupling rather than a new state-machine state.
- **Non-goals**: no change to review judgment flow, no change to the phase
  router's decision logic, no new transport (sessions still run locally or via
  the existing agent CLIs), and **no automatic recovery / history-replay**
  inside the manager — callers handle crash recovery by `destroy` + `create`.

## Acceptance Criteria (expanded from issue #133)

- `AgentSessionManager` interface is defined.
- Claude, Codex, and Copilot are all supported (Copilot via in-process shim).
- Session lifecycle `create → send* → destroy` is managed.
- Sessions are destroyed on **all** terminal transitions: approve, reject,
  suspend, and decompose (expanded from issue AC which listed approve/reject
  only).
- `create()` is idempotent for same config, throws `ConfigMismatchError` for
  different config.
- `SessionError` is a discriminated union: `ProcessDied | Timeout |
  AuthFailure | MalformedResponse`.
- Concurrent `send()` calls on the same handle are serialized by the manager.
- Startup cleanup destroys orphaned sessions from prior host-process crashes.
- `AgentMessage` / `AgentResponse` types are imported from #129 Phase Contract
  (hard dependency).
- Local runtime is not migrated; adoption is server-mode only.
