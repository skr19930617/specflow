## Context

The specflow runtime currently invokes agents through two synchronous functions
in `src/lib/review-runtime.ts`:

- `callMainAgent(agent, cwd, prompt)` — spawns a new CLI process per call
  (Claude via `claude -p`, Codex via `codex exec`, Copilot via `copilot -p`).
- `callReviewAgent(agent, cwd, prompt)` — same fresh-process pattern for
  reviews.

Both use `tryExec` (synchronous `spawnSync`) and discard all inter-turn context.
For server-mode orchestration (Epic #127), main agents need persistent sessions
so that context accumulates across phases within a single change.

**Existing integration points:**

- `PhaseRouter` (merged) returns `PhaseAction` with `kind: "invoke_agent"` and
  an `agent` string — this is the trigger point where the orchestrator decides
  to call the agent.
- `RunState.agents` (in `src/types/contracts.ts`) carries per-run `{ main, review }`
  agent identifiers.
- `MainAgentName = "claude" | "codex" | "copilot"` and `ReviewAgentName` unions
  exist in `review-runtime.ts`.

**Hard dependency:** `AgentMessage` / `AgentResponse` types from #129 Phase
Contract. This design assumes those types exist at implementation time.

## Goals / Non-Goals

**Goals:**

- Define an `AgentSessionManager` interface with `create` / `send` / `destroy`.
- Implement three provider adapters: Claude (session-id resume), Codex (session
  resume), Copilot (in-process child-process shim).
- Bind session lifecycle to run-state terminal transitions (approve, reject,
  suspend, decompose).
- Serialize concurrent `send` calls per handle via an internal FIFO queue.
- Clean up orphaned sessions on manager startup.
- Wire into server-mode orchestration only.

**Non-Goals:**

- Migrating the local runtime's `callMainAgent()` to use sessions.
- Automatic recovery / history-replay on session crash (caller does `destroy` +
  `create`).
- Changing review agents — they stay on fresh-process `callReviewAgent()`.
- Defining a new transport layer (agents still run via CLI / child process).
- Copilot stdio framing protocol details — deferred to implementation; this
  design covers the adapter boundary, not the wire format.

## Decisions

### D1: New module at `src/lib/agent-session/`

**Decision:** Create a new module directory `src/lib/agent-session/` alongside
the existing `phase-router/` module, following the same file organization.

**Files:**

| File | Responsibility |
|---|---|
| `types.ts` | `AgentSessionManager`, `SessionHandle`, `AgentConfig`, `SessionError`, `ConfigMismatchError` |
| `adapters/claude-adapter.ts` | Claude `--session-id` adapter |
| `adapters/codex-adapter.ts` | Codex session adapter |
| `adapters/copilot-adapter.ts` | Copilot in-process child-process shim |
| `adapters/types.ts` | `ProviderAdapter` interface shared by all adapters |
| `session-manager.ts` | Default `AgentSessionManager` implementation |
| `send-queue.ts` | Per-handle FIFO send serializer |
| `session-store.ts` | Disk-backed session metadata for orphan cleanup |
| `index.ts` | Public re-exports |

**Rationale:** Keeps session management isolated from review-runtime. The
phase-router module set the precedent for this structure. Each adapter is a
separate file for testability and to keep files under 400 lines.

**Alternatives considered:**

- Extending `review-runtime.ts` — rejected because it would bloat a 300+ line
  file and mix session lifecycle with one-shot review logic.
- Single `agent-session.ts` file — rejected because three adapters + manager +
  queue + store would exceed 800 lines.

### D2: ProviderAdapter interface decouples manager from CLI details

**Decision:** The `AgentSessionManager` delegates all CLI-specific behavior to
a `ProviderAdapter` interface:

```typescript
interface ProviderAdapter {
  readonly provider: MainAgentName;
  start(changeId: string, config: AgentConfig): ProviderHandle;
  send(handle: ProviderHandle, message: AgentMessage): Promise<AgentResponse>;
  stop(handle: ProviderHandle): void;
  isAlive(handle: ProviderHandle): boolean;
}
```

The manager owns lifecycle (idempotent create, destroy-on-terminal, orphan
cleanup, send serialization). Each adapter owns only the CLI-specific start/
send/stop mechanics.

**Rationale:** Adapter isolation means the manager's send-queue and lifecycle
logic are tested once, not per-provider. New providers (e.g., a future Gemini
adapter) only implement `ProviderAdapter`.

**Alternatives considered:**

- Each adapter implements the full `AgentSessionManager` — rejected because it
  duplicates the serial queue, idempotent-create, and orphan-cleanup logic three
  times.

### D3: Claude adapter uses per-send spawns with `--session-id` for context continuity

**Decision:** The Claude adapter derives a session ID from the changeId:

```
session-id = `specflow-${changeId}`
```

The adapter does **not** maintain a long-running child process. Instead, each
`send` call spawns a new `claude -p --session-id specflow-${changeId}
--dangerously-skip-permissions` process with the message as the prompt argument,
waits for the process to exit, and parses stdout as the response. The
`--session-id` flag causes Claude to persist and resume conversation context
across these per-send invocations.

`start` records the session ID and validates the provider is reachable (no
long-running process to spawn). `isAlive` returns `true` as long as the handle
has not been explicitly stopped (there is no persistent process to health-check;
liveness is determined by whether the most recent `send` succeeded). `stop`
marks the handle as dead and optionally asks Claude to discard the session.

**Rationale:** The current `callMainAgent` uses synchronous `spawnSync` with
`claude -p` — Claude's `-p` flag is a single-shot prompt mode, not an
interactive stdin/stdout mode. `--session-id` resumes context across separate
invocations without requiring a persistent process. This aligns the adapter with
the actual CLI behavior.

### D4: Codex adapter uses per-send spawns with `--session` for context continuity

**Decision:** Follows the same per-send spawn pattern as Claude: each `send`
invokes `codex exec --session specflow-${changeId}` with the message as the
prompt argument, waits for the process to exit, and parses the output. The
`--session` flag provides context continuity across invocations. No long-running
child process is maintained.

`isAlive` and `stop` behave identically to the Claude adapter (handle-level
liveness tracking, no persistent process).

### D5: Copilot adapter keeps a long-running child process (in-process shim)

**Decision:** The Copilot adapter spawns `copilot -p --allow-all-tools -s` as
a persistent child process. Unlike Claude/Codex which have native session IDs,
Copilot's "session" is simply the fact that the child process stays alive and
retains its conversation context in memory.

`isAlive` checks whether the child process PID is still running. `stop` sends
SIGTERM. If the child exits unexpectedly, the next `send` detects the dead
process and throws `SessionError { kind: "ProcessDied" }`.

**Framing:** The adapter will need a delimiter protocol for stdin/stdout message
boundaries. The exact framing (NDJSON, length-prefix, or sentinel markers) is
an implementation detail resolved during coding — the design only mandates that
the adapter implements the `ProviderAdapter` interface.

### D6: Send serialization via a per-handle Promise chain

**Decision:** Each `SessionHandle` gets a `SendQueue` — a simple Promise-chain
serializer. When `send` is called, it chains onto the previous Promise:

```typescript
class SendQueue {
  private tail: Promise<void> = Promise.resolve();
  private poisonError: SessionError | null = null;

  enqueue<T>(fn: () => Promise<T>): Promise<T> {
    if (this.poisonError) {
      return Promise.reject(this.poisonError);
    }
    const result = this.tail.then(fn);
    this.tail = result.then(
      () => {},
      (err) => { if (err instanceof SessionError) this.poisonError = err; }
    );
    return result;
  }
}
```

This guarantees FIFO without needing a mutex library.

**Dead-handle poisoning:** When a send fails with a `SessionError`, the queue
enters a "poisoned" state. Subsequent enqueued functions are not executed;
instead their Promises reject immediately with a `SessionError { kind:
"ProcessDied" }` indicating the session is dead. This prevents the queue from
attempting to send on a dead session. The manager's `send` method also checks
`adapter.isAlive(handle)` before delegating to the adapter, providing a
synchronous fast-path rejection for handles that are already known to be dead.

**Alternatives considered:**

- External queue library (e.g., p-queue) — rejected; a 10-line Promise chain
  is simpler and has no dependency.
- No serialization (caller responsibility) — rejected per clarification C6.

### D7: Disk-backed session metadata for orphan cleanup

**Decision:** The manager persists a `sessions.json` file in
`.specflow/sessions/` that maps `changeId → { provider, pid, sessionId, createdAt }`.
On startup, the manager reads this file, checks liveness of each entry, and
destroys any stale sessions before accepting new `create` calls.

```typescript
interface SessionMetadata {
  readonly changeId: string;
  readonly provider: MainAgentName;
  readonly pid: number;
  readonly sessionId: string;
  readonly createdAt: string;
}
```

On `create`, the entry is written. On `destroy`, the entry is removed.
On startup, any entry whose PID is not running is cleaned up (kill if zombie,
then remove entry).

**Rationale:** File-based metadata is consistent with the existing
`.specflow/runs/` persistence pattern. No external database needed.

**Alternatives considered:**

- PID-file per session — rejected; a single JSON file is simpler to read/write
  atomically and easier to iterate during cleanup.

### D8: SessionError as a discriminated union with four variants

**Decision:**

```typescript
type SessionErrorKind =
  | "ProcessDied"
  | "Timeout"
  | "AuthFailure"
  | "MalformedResponse";

class SessionError extends Error {
  readonly kind: SessionErrorKind;
  readonly handle: SessionHandle;
}
```

The manager catches provider-level errors and wraps them in `SessionError` with
the appropriate `kind`. Callers switch on `kind` to decide recovery strategy.

### D9: ConfigMismatchError for create-with-different-config

**Decision:**

```typescript
class ConfigMismatchError extends Error {
  readonly changeId: string;
  readonly existingConfig: AgentConfig;
  readonly requestedConfig: AgentConfig;
}
```

Thrown by `create` when a live session exists for the changeId but with a
different config. Caller must `destroy` first.

### D10: Wiring into server-mode orchestration

**Decision:** The server-mode orchestrator (not yet fully built — Epic #127)
will receive an `AgentSessionManager` instance via dependency injection.
When the `PhaseRouter` returns `{ kind: "invoke_agent", agent }`, the
orchestrator:

1. Calls `manager.create(changeId, { provider: agent, sendTimeoutMs })` —
   idempotent, returns existing or new handle.
2. Calls `manager.send(handle, agentMessage)` — serialized by the queue.
3. On terminal transitions, calls `manager.destroy(handle)`.

The local runtime continues to use `callMainAgent()` directly. The
`AgentSessionManager` is not injected into local-mode code paths.

## Risks / Trade-offs

**[R1] Copilot stdin/stdout framing is underspecified** → The design does not
prescribe a wire protocol for the Copilot adapter. If Copilot's CLI does not
support a clean message-boundary protocol, the adapter may need a wrapper
script. Mitigation: prototype the Copilot adapter early in the implementation
to validate feasibility.

**[R2] #129 Phase Contract is a hard block** → If #129 slips, this change
cannot merge. Mitigation: implementation can proceed in parallel on a feature
branch; only the final merge is blocked.

**[R3] Session metadata file is not crash-atomic** → A host crash during
`sessions.json` write could corrupt the metadata. Mitigation: write to a
temp file and rename (atomic on most filesystems). Worst case: orphan cleanup
misses one entry, which leaks a child process until the next restart.

**[R4] Copilot child process memory growth** → A long-lived Copilot child
accumulates conversation context in memory. For large changes with many turns,
this could grow unbounded. Mitigation: monitor memory in production; if needed,
a future change can add a "context window rotation" strategy that destroys and
recreates the Copilot session after N turns.

**[R5] Deterministic session IDs are guessable** → `specflow-${changeId}` is
predictable. In a multi-tenant server environment, one tenant could potentially
reference another's session name. Mitigation: acceptable for the current
single-user local + single-tenant server model. For multi-tenant deployment, add
a random nonce to the session ID in a follow-up change.
