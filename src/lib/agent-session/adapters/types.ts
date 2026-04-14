// ProviderAdapter interface — decouples the session manager from CLI details.
// Each adapter (Claude, Codex, Copilot) implements this interface.

import type { MainAgentName } from "../../review-runtime.js";
import type { AgentConfig, AgentMessage, AgentResponse } from "../types.js";

/** Opaque provider-level handle. Each adapter defines its own internal shape. */
export interface ProviderHandle {
	readonly provider: MainAgentName;
	readonly changeId: string;
	readonly sessionId: string;
}

/** Adapter interface that each agent provider implements. */
export interface ProviderAdapter {
	readonly provider: MainAgentName;

	/** Initialize a session for the given change. */
	start(changeId: string, config: AgentConfig): ProviderHandle;

	/** Send a message and await the response. */
	send(
		handle: ProviderHandle,
		message: AgentMessage,
		timeoutMs: number,
	): Promise<AgentResponse>;

	/** Tear down the session. */
	stop(handle: ProviderHandle): void;

	/** Check whether the session is still usable. */
	isAlive(handle: ProviderHandle): boolean;
}
