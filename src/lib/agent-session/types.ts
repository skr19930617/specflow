// AgentSessionManager public types.
//
// AgentMessage and AgentResponse are defined by #129 Phase Contract.
// Until #129 merges, these are placeholder types that match the expected
// shape. The follow-up change replaces them with imports from the
// canonical location.

import type { MainAgentName } from "../review-runtime.js";

// --- Phase Contract placeholders (to be replaced by #129 imports) --------

/** Message sent to an agent session. */
export interface AgentMessage {
	readonly prompt: string;
	readonly phase: string;
	readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Response received from an agent session. */
export interface AgentResponse {
	readonly output: string;
	readonly exitCode?: number;
	readonly metadata?: Readonly<Record<string, unknown>>;
}

// --- Session types -------------------------------------------------------

declare const sessionHandleBrand: unique symbol;

/** Opaque handle identifying a live agent session. */
export interface SessionHandle {
	readonly [sessionHandleBrand]: true;
	readonly changeId: string;
	readonly id: string;
}

/** Create a SessionHandle. Internal use only — callers receive handles
 *  from AgentSessionManager.create, never construct them directly. */
export function createSessionHandle(
	changeId: string,
	id: string,
): SessionHandle {
	return { changeId, id } as SessionHandle;
}

/** Configuration for creating an agent session. */
export interface AgentConfig {
	readonly provider: MainAgentName;
	readonly sendTimeoutMs: number;
}

/** Compare two AgentConfigs for structural equality. */
export function agentConfigsEqual(a: AgentConfig, b: AgentConfig): boolean {
	return a.provider === b.provider && a.sendTimeoutMs === b.sendTimeoutMs;
}

// --- AgentSessionManager interface ---------------------------------------

/** Persistent-session lifecycle manager for main agents. */
export interface AgentSessionManager {
	/**
	 * Create or reuse a persistent session for the given change.
	 * - Idempotent: returns the existing handle if config matches.
	 * - Throws ConfigMismatchError if a live session exists with a different config.
	 */
	create(changeId: string, config: AgentConfig): Promise<SessionHandle>;

	/**
	 * Send a message to the live session and await the agent response.
	 * Concurrent sends on the same handle are serialized in FIFO order.
	 * Throws SessionError on fatal session failures.
	 */
	send(handle: SessionHandle, message: AgentMessage): Promise<AgentResponse>;

	/**
	 * Tear down the session and release all resources.
	 * No-op if the handle was already destroyed.
	 */
	destroy(handle: SessionHandle): Promise<void>;
}
