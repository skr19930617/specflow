// Typed errors for the AgentSessionManager.

import type { AgentConfig, SessionHandle } from "./types.js";

/** Discriminated union of session-fatal failure modes. */
export type SessionErrorKind =
	| "ProcessDied"
	| "Timeout"
	| "AuthFailure"
	| "MalformedResponse";

/**
 * Thrown by `send()` when the underlying session encounters a fatal condition.
 * Callers switch on `kind` to decide recovery strategy.
 */
export class SessionError extends Error {
	readonly kind: SessionErrorKind;
	readonly handle: SessionHandle;

	constructor(kind: SessionErrorKind, handle: SessionHandle, message: string) {
		super(message);
		this.name = "SessionError";
		this.kind = kind;
		this.handle = handle;
	}
}

/**
 * Thrown by `create()` when a live session exists for the changeId but with
 * a different config. The caller must `destroy` first, then `create` with the
 * new config.
 */
export class ConfigMismatchError extends Error {
	readonly changeId: string;
	readonly existingConfig: AgentConfig;
	readonly requestedConfig: AgentConfig;

	constructor(
		changeId: string,
		existingConfig: AgentConfig,
		requestedConfig: AgentConfig,
	) {
		super(
			`Config mismatch for change "${changeId}": existing provider=${existingConfig.provider} ` +
				`timeout=${existingConfig.sendTimeoutMs}, requested provider=${requestedConfig.provider} ` +
				`timeout=${requestedConfig.sendTimeoutMs}`,
		);
		this.name = "ConfigMismatchError";
		this.changeId = changeId;
		this.existingConfig = existingConfig;
		this.requestedConfig = requestedConfig;
	}
}
