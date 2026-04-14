## 1. Types and Errors

- [x] 1.1 Create `src/lib/agent-session/types.ts` — define `AgentConfig` (with `provider: MainAgentName`, `sendTimeoutMs: number`), `SessionHandle` (opaque branded type with `changeId` and internal `id`), `AgentSessionManager` interface (`create`, `send`, `destroy`), and re-export `AgentMessage` / `AgentResponse` from #129
- [x] 1.2 Create `src/lib/agent-session/errors.ts` — define `SessionErrorKind` discriminated union (`ProcessDied | Timeout | AuthFailure | MalformedResponse`), `SessionError extends Error` with `kind` and `handle` fields, and `ConfigMismatchError extends Error` with `changeId`, `existingConfig`, `requestedConfig`
- [x] 1.3 Create `src/lib/agent-session/adapters/types.ts` — define `ProviderAdapter` interface (`provider`, `start`, `send`, `stop`, `isAlive`) and `ProviderHandle` type

## 2. Send Queue

- [x] 2.1 Create `src/lib/agent-session/send-queue.ts` — implement `SendQueue` class with Promise-chain FIFO serializer, `enqueue<T>(fn) → Promise<T>` method, and poisoned-state tracking: when a `SessionError` occurs, store it and reject all subsequent enqueues immediately without executing their functions
- [x] 2.2 Write unit tests for `SendQueue` — verify FIFO ordering of concurrent enqueues, verify failing task poisons the queue so subsequent enqueues reject immediately with `SessionError`

## 3. Session Metadata Store

- [x] 3.1 Create `src/lib/agent-session/session-store.ts` — implement `SessionMetadataStore` that reads/writes `.specflow/sessions/sessions.json` with `SessionMetadata` entries (changeId, provider, pid, sessionId, createdAt); use atomic write (write to temp file + rename) per design risk R3
- [x] 3.2 Implement orphan cleanup in `SessionMetadataStore.cleanup()` — on init, read stored entries, check PID liveness, kill stale processes, remove stale entries
- [x] 3.3 Write unit tests for `SessionMetadataStore` — verify add/remove/cleanup lifecycle, verify stale PID detection

## 4. Provider Adapters

- [x] 4.1 Create `src/lib/agent-session/adapters/claude-adapter.ts` — implement `ProviderAdapter` using per-send spawns of `claude -p --session-id specflow-${changeId}` (no long-running process; each `send` spawns, waits, parses stdout); `isAlive` tracks handle-level liveness (not process liveness)
- [x] 4.2 Create `src/lib/agent-session/adapters/codex-adapter.ts` — implement `ProviderAdapter` using per-send spawns of `codex exec --session specflow-${changeId}` with equivalent pattern to Claude adapter; no long-running process
- [x] 4.3 Create `src/lib/agent-session/adapters/copilot-adapter.ts` — implement `ProviderAdapter` using `copilot -p --allow-all-tools -s` as persistent child process with stdin/stdout shim
- [x] 4.4 Write integration tests for each adapter — verify start/send/stop lifecycle, verify `isAlive` reports correctly after stop, verify error mapping to `SessionErrorKind`

## 5. Session Manager Implementation

- [x] 5.1 Create `src/lib/agent-session/session-manager.ts` — implement `DefaultAgentSessionManager` with internal `Map<changeId, SessionEntry>`, `SendQueue` per handle, and `SessionMetadataStore` integration
- [x] 5.2 Implement idempotent `create` — return existing handle for same config, throw `ConfigMismatchError` for different config
- [x] 5.3 Implement `send` with queue serialization — check `adapter.isAlive(handle)` before enqueuing (fast-path rejection for dead handles), enqueue onto per-handle `SendQueue`, delegate to `ProviderAdapter.send`, catch errors and wrap as `SessionError`; the queue's poison state ensures subsequent sends on a dead session reject without attempting the adapter call
- [x] 5.4 Implement `destroy` — stop adapter, remove from internal map, remove from metadata store, no-op on already-destroyed handle
- [x] 5.5 Implement startup cleanup in constructor/init — call `SessionMetadataStore.cleanup()` before accepting `create` calls
- [x] 5.6 Write unit tests for `DefaultAgentSessionManager` — test idempotent create, config mismatch error, send serialization, destroy lifecycle, destroy-on-already-destroyed no-op, startup cleanup

## 6. Public Module Exports

- [x] 6.1 Create `src/lib/agent-session/index.ts` — re-export public types (`AgentSessionManager`, `AgentConfig`, `SessionHandle`, `SessionError`, `ConfigMismatchError`) and `DefaultAgentSessionManager` factory

## 7. Server-Mode Orchestration Wiring

- [x] 7.1 Wire `AgentSessionManager` into the server-mode orchestrator — inject `DefaultAgentSessionManager` instance, call `create` when `PhaseRouter` returns `invoke_agent`, call `send` with the phase-contract message, call `destroy` on terminal transitions (approve, reject, suspend, decompose)
- [x] 7.2 Verify local runtime is unchanged — confirm `callMainAgent()` and `callReviewAgent()` paths are untouched in local-mode code

## 8. Review-Orchestration Spec Compliance

- [x] 8.1 Verify `callReviewAgent()` continues to spawn a fresh process — no session reuse for review agents in any mode
