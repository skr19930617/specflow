## ADDED Requirements

### Requirement: AgentSessionManager interface defines create/send/destroy lifecycle

The `AgentSessionManager` interface SHALL expose three operations that together
manage the lifecycle of a persistent main-agent session:

- `create(changeId: string, config: AgentConfig): SessionHandle`
- `send(handle: SessionHandle, message: AgentMessage): Promise<AgentResponse>`
- `destroy(handle: SessionHandle): void`

`AgentMessage` and `AgentResponse` types SHALL be imported from the Phase
Contract (#129) rather than redefined.

#### Scenario: Create returns a new session handle

- **WHEN** `create(changeId, config)` is called for a changeId that has no live
  session
- **THEN** the manager SHALL create a new agent session using the provider
  specified in `config`
- **AND** it SHALL return a `SessionHandle` that uniquely identifies the session

#### Scenario: Send delivers a message and returns the agent response

- **WHEN** `send(handle, message)` is called with a valid live handle
- **THEN** the manager SHALL forward `message` to the underlying agent session
- **AND** it SHALL return a `Promise<AgentResponse>` that resolves when the
  agent has replied

#### Scenario: Destroy tears down the session and releases resources

- **WHEN** `destroy(handle)` is called with a valid handle
- **THEN** the manager SHALL terminate the underlying agent process or session ID
- **AND** the handle SHALL become invalid for subsequent `send` or `destroy`
  calls

#### Scenario: Destroy on an already-destroyed handle is a no-op

- **WHEN** `destroy(handle)` is called with a handle that was previously
  destroyed
- **THEN** the manager SHALL not throw an error
- **AND** no side effects SHALL occur

### Requirement: One main session per change with idempotent create

The manager SHALL enforce at most one live session per changeId. `create` SHALL
be idempotent when called with the same config, and SHALL reject config
mismatches.

#### Scenario: Idempotent create returns existing handle for same config

- **WHEN** `create(changeId, configA)` is called
- **AND** a live session already exists for `changeId` with `configA`
- **THEN** the manager SHALL return the existing `SessionHandle` without
  creating a new session

#### Scenario: Config mismatch throws ConfigMismatchError

- **WHEN** `create(changeId, configB)` is called
- **AND** a live session already exists for `changeId` with `configA` where
  `configA !== configB`
- **THEN** the manager SHALL throw `ConfigMismatchError`
- **AND** the existing session SHALL remain unaffected

### Requirement: Session lifecycle is bound to run-state terminal transitions

Sessions SHALL be created on the first main-agent turn for a change and SHALL be
destroyed on any terminal transition of the run state machine.

#### Scenario: Session is destroyed on approve

- **WHEN** the run transitions to `approved`
- **THEN** the orchestrator SHALL call `destroy(handle)` for the change's live session

#### Scenario: Session is destroyed on reject

- **WHEN** the run transitions to `rejected`
- **THEN** the orchestrator SHALL call `destroy(handle)` for the change's live session

#### Scenario: Session is destroyed on suspend

- **WHEN** the run transitions to `suspended`
- **THEN** the orchestrator SHALL call `destroy(handle)` for the change's live session

#### Scenario: Session is destroyed on decompose

- **WHEN** the run transitions to `decomposed`
- **THEN** the orchestrator SHALL call `destroy(handle)` for the change's live session

### Requirement: SessionError is a discriminated union covering session-fatal failures

`send()` SHALL throw a `SessionError` when the underlying session encounters a
fatal condition. `SessionError` SHALL be a discriminated union with the following
variants: `ProcessDied`, `Timeout`, `AuthFailure`, `MalformedResponse`.

#### Scenario: Process death surfaces as SessionError ProcessDied

- **WHEN** the underlying agent process exits unexpectedly during a `send` call
- **THEN** `send` SHALL throw `SessionError` with `kind: "ProcessDied"`
- **AND** the handle SHALL be considered dead

#### Scenario: Timeout surfaces as SessionError Timeout

- **WHEN** the agent does not respond within `config.sendTimeoutMs` milliseconds
- **THEN** `send` SHALL throw `SessionError` with `kind: "Timeout"`

#### Scenario: Auth failure surfaces as SessionError AuthFailure

- **WHEN** the agent provider rejects the session due to authentication or
  authorization errors
- **THEN** `send` SHALL throw `SessionError` with `kind: "AuthFailure"`

#### Scenario: Malformed response surfaces as SessionError MalformedResponse

- **WHEN** the agent returns a response that cannot be parsed as a valid
  `AgentResponse`
- **THEN** `send` SHALL throw `SessionError` with `kind: "MalformedResponse"`

### Requirement: AgentConfig includes sendTimeoutMs for per-provider timeout control

`AgentConfig` SHALL include a `sendTimeoutMs` field that controls how long
`send()` waits for a response before raising a `Timeout` SessionError.

#### Scenario: Send respects sendTimeoutMs

- **WHEN** `send(handle, message)` is called
- **AND** the agent does not respond within `config.sendTimeoutMs` milliseconds
- **THEN** the manager SHALL throw `SessionError` with `kind: "Timeout"`

#### Scenario: sendTimeoutMs is required in AgentConfig

- **WHEN** `create(changeId, config)` is called without `sendTimeoutMs`
- **THEN** TypeScript compilation SHALL fail (the field is non-optional)

### Requirement: Concurrent send calls on the same handle are serialized

The manager SHALL hold an internal serial queue per handle. When multiple `send`
calls arrive concurrently for the same handle, they SHALL be executed in FIFO
order; no two messages SHALL be in-flight simultaneously on the same session.

#### Scenario: Two concurrent sends execute in FIFO order

- **WHEN** `send(handle, msgA)` and `send(handle, msgB)` are called
  concurrently (both Promises are created before either resolves)
- **THEN** the manager SHALL send `msgA` first and `msgB` after `msgA` completes
- **AND** both Promises SHALL resolve with their respective `AgentResponse`

#### Scenario: A failing send does not block the queue

- **WHEN** `send(handle, msgA)` throws a `SessionError`
- **AND** `send(handle, msgB)` is queued behind it
- **THEN** `msgB`'s Promise SHALL reject with the same or subsequent
  `SessionError` (because the session is now dead)

### Requirement: Provider adapters map the interface to Claude, Codex, and Copilot

Three provider adapters SHALL implement the `AgentSessionManager` interface:

- **Claude adapter**: uses `--session-id` for session resumption across turns.
- **Codex adapter**: uses the equivalent session/resume mechanism.
- **Copilot adapter**: uses an in-process shim — keeps the Copilot CLI as a
  long-running child process with stdin/stdout communication. Framing protocol
  and liveness detection details are deferred to the design phase.

#### Scenario: Claude adapter resumes via session-id

- **WHEN** `create(changeId, config)` is called with `config.provider = "claude"`
- **THEN** the adapter SHALL generate or derive a session-id from the changeId
- **AND** subsequent `send` calls SHALL pass `--session-id` to resume the
  session

#### Scenario: Codex adapter resumes via equivalent mechanism

- **WHEN** `create(changeId, config)` is called with `config.provider = "codex"`
- **THEN** the adapter SHALL use Codex's session/resume mechanism

#### Scenario: Copilot adapter keeps a long-running child process

- **WHEN** `create(changeId, config)` is called with `config.provider = "copilot"`
- **THEN** the adapter SHALL spawn a Copilot CLI child process
- **AND** `send` calls SHALL write to the child's stdin and read from stdout

#### Scenario: Copilot adapter destroy kills the child process

- **WHEN** `destroy(handle)` is called for a Copilot session
- **THEN** the adapter SHALL terminate the child process
- **AND** release stdin/stdout resources

### Requirement: Startup cleanup destroys orphaned sessions

On initialization, the manager SHALL scan for and destroy stale sessions left by
a prior host-process crash. This prevents resource leaks (zombie child processes,
abandoned session IDs).

#### Scenario: Orphaned Copilot child processes are cleaned up on startup

- **WHEN** the `AgentSessionManager` initializes
- **AND** stale Copilot child process PIDs are found from a prior lifecycle
- **THEN** the manager SHALL terminate those processes before accepting new
  `create` calls

#### Scenario: Orphaned Claude/Codex session IDs are cleaned up on startup

- **WHEN** the `AgentSessionManager` initializes
- **AND** stale session metadata files exist from a prior lifecycle
- **THEN** the manager SHALL remove or invalidate those session records

#### Scenario: Clean startup with no orphans proceeds normally

- **WHEN** the `AgentSessionManager` initializes
- **AND** no stale sessions are detected
- **THEN** initialization SHALL complete without errors or delays

### Requirement: Adoption is scoped to server-mode only

In this change, the `AgentSessionManager` SHALL only be wired into the
server-mode orchestration path. The local runtime's `callMainAgent()` SHALL
continue to use the existing fresh-process model.

#### Scenario: Local runtime callMainAgent is unchanged

- **WHEN** a local-mode run invokes the main agent
- **THEN** `callMainAgent()` SHALL spawn a new process per invocation as before
- **AND** it SHALL NOT use `AgentSessionManager`

#### Scenario: Server-mode orchestration uses AgentSessionManager

- **WHEN** a server-mode run needs to invoke the main agent
- **THEN** the orchestrator SHALL use `AgentSessionManager.create` /
  `AgentSessionManager.send` instead of `callMainAgent()`
