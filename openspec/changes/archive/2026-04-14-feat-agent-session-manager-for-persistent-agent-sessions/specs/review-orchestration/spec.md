## ADDED Requirements

### Requirement: Review agents SHALL NOT share sessions with main agents

Review agents SHALL continue to run in a fresh process per invocation and SHALL
NOT use `AgentSessionManager`. Main-agent invocations in server-mode move to the
`agent-session-manager` contract; review invocations remain on the existing
per-call process model to preserve independent judgment.

#### Scenario: Review agent spawns a new process per invocation

- **WHEN** a review phase (design review or apply review) invokes the review agent
- **THEN** the runtime SHALL spawn a fresh agent process via the existing
  `callReviewAgent()` path
- **AND** it SHALL NOT call `AgentSessionManager.create` or
  `AgentSessionManager.send`

#### Scenario: Review agent does not inherit main-agent session context

- **WHEN** a review agent runs after a main-agent session has accumulated context
  for the same change
- **THEN** the review agent SHALL have no access to the main-agent session's
  prior messages or reasoning
- **AND** it SHALL evaluate artifacts independently
