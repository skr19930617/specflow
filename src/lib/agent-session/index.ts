// Public surface of the AgentSessionManager module.
//
// NOTE: No existing CLI command imports this module. The session manager
// ships dormant by design (like the PhaseRouter). A follow-up change
// wires it into the server-mode orchestrator.

export { ClaudeAdapter } from "./adapters/claude-adapter.js";
export { CodexAdapter } from "./adapters/codex-adapter.js";
export { CopilotAdapter } from "./adapters/copilot-adapter.js";
export type { ProviderAdapter, ProviderHandle } from "./adapters/types.js";
export { ConfigMismatchError, SessionError } from "./errors.js";
export type { SessionErrorKind } from "./errors.js";
export { SendQueue } from "./send-queue.js";
export { SessionMetadataStore } from "./session-store.js";
export type { SessionMetadata } from "./session-store.js";
export type { SessionManagerDeps } from "./session-manager.js";
export { DefaultAgentSessionManager } from "./session-manager.js";
export type {
	AgentConfig,
	AgentMessage,
	AgentResponse,
	AgentSessionManager,
	SessionHandle,
} from "./types.js";
export { agentConfigsEqual, createSessionHandle } from "./types.js";
