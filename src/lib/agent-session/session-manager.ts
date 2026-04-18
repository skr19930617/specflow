// DefaultAgentSessionManager — the primary implementation of AgentSessionManager.
// Coordinates provider adapters, send queues, and session metadata persistence.

import type { MainAgentName } from "../review-runtime.js";
import type { ProviderAdapter, ProviderHandle } from "./adapters/types.js";
import { ConfigMismatchError, SessionError } from "./errors.js";
import type { SessionMetadataStore } from "./session-store.js";
import {
	type AgentConfig,
	type AgentMessage,
	type AgentResponse,
	type AgentSessionManager,
	agentConfigsEqual,
	createSessionHandle,
	type SessionHandle,
} from "./types.js";

// Per-handle FIFO send serializer with poison-state tracking.
// When a SessionError occurs, the queue enters a "poisoned" state and
// rejects all subsequent enqueues immediately.
export class SendQueue {
	private tail: Promise<void> = Promise.resolve();
	private poisonError: SessionError | null = null;

	/** Returns true if the queue has been poisoned by a SessionError. */
	get poisoned(): boolean {
		return this.poisonError !== null;
	}

	/**
	 * Enqueue a function for serial execution.
	 * If the queue is poisoned, rejects immediately without executing `fn`.
	 */
	enqueue<T>(fn: () => Promise<T>): Promise<T> {
		if (this.poisonError) {
			return Promise.reject(this.poisonError);
		}
		// Wrap fn so that tasks queued before the poison was set still check
		// the poisoned state when their turn arrives.
		const guardedFn = (): Promise<T> => {
			if (this.poisonError) {
				return Promise.reject(this.poisonError);
			}
			return fn();
		};
		const result: Promise<T> = this.tail.then(guardedFn);
		this.tail = result.then(
			() => {},
			(err: unknown) => {
				if (err instanceof SessionError) {
					this.poisonError = err;
				}
			},
		);
		return result;
	}
}

/** Internal entry tracking a single live session. */
interface SessionEntry {
	readonly handle: SessionHandle;
	readonly config: AgentConfig;
	readonly providerHandle: ProviderHandle;
	readonly adapter: ProviderAdapter;
	readonly queue: SendQueue;
}

/** Dependencies injected into the session manager. */
export interface SessionManagerDeps {
	readonly adapters: ReadonlyMap<MainAgentName, ProviderAdapter>;
	readonly store: SessionMetadataStore;
	readonly repoRoot: string;
}

export class DefaultAgentSessionManager implements AgentSessionManager {
	private sessions: Map<string, SessionEntry> = new Map();
	private readonly adapters: ReadonlyMap<MainAgentName, ProviderAdapter>;
	private readonly store: SessionMetadataStore;
	private initialized = false;

	constructor(private readonly deps: SessionManagerDeps) {
		this.adapters = deps.adapters;
		this.store = deps.store;
	}

	/** Run startup cleanup. Must be called before the first create(). */
	async init(): Promise<void> {
		this.store.cleanup();
		this.initialized = true;
	}

	async create(changeId: string, config: AgentConfig): Promise<SessionHandle> {
		if (!this.initialized) {
			await this.init();
		}

		const existing = this.sessions.get(changeId);
		if (existing) {
			if (agentConfigsEqual(existing.config, config)) {
				return existing.handle;
			}
			throw new ConfigMismatchError(changeId, existing.config, config);
		}

		const adapter = this.adapters.get(config.provider);
		if (!adapter) {
			throw new Error(`No adapter registered for provider: ${config.provider}`);
		}

		const providerHandle = adapter.start(changeId, config);
		const handle = createSessionHandle(changeId, providerHandle.sessionId);
		const queue = new SendQueue();

		const entry: SessionEntry = {
			handle,
			config,
			providerHandle,
			adapter,
			queue,
		};

		this.sessions = new Map(this.sessions).set(changeId, entry);

		// Persist metadata for orphan cleanup.
		this.store.add({
			changeId,
			provider: config.provider,
			pid: process.pid,
			sessionId: providerHandle.sessionId,
			createdAt: new Date().toISOString(),
		});

		return handle;
	}

	async send(
		handle: SessionHandle,
		message: AgentMessage,
	): Promise<AgentResponse> {
		const entry = this.sessions.get(handle.changeId);
		if (!entry || entry.handle.id !== handle.id) {
			throw new SessionError(
				"ProcessDied",
				handle,
				`No live session for change: ${handle.changeId}`,
			);
		}

		// Fast-path rejection for dead handles.
		if (!entry.adapter.isAlive(entry.providerHandle)) {
			const err = new SessionError(
				"ProcessDied",
				handle,
				`Session for change "${handle.changeId}" is dead`,
			);
			throw err;
		}

		return entry.queue.enqueue(async () => {
			try {
				return await entry.adapter.send(
					entry.providerHandle,
					message,
					entry.config.sendTimeoutMs,
				);
			} catch (rawErr: unknown) {
				// Wrap raw adapter errors into SessionError.
				if (rawErr instanceof SessionError) {
					throw rawErr;
				}
				const adapterErr = rawErr as {
					kind?: string;
					message?: string;
				};
				const kind = isSessionErrorKind(adapterErr.kind)
					? adapterErr.kind
					: "ProcessDied";
				throw new SessionError(
					kind,
					handle,
					adapterErr.message ?? "Unknown adapter error",
				);
			}
		});
	}

	async destroy(handle: SessionHandle): Promise<void> {
		const entry = this.sessions.get(handle.changeId);
		if (!entry || entry.handle.id !== handle.id) {
			// No-op on already-destroyed handle.
			return;
		}

		entry.adapter.stop(entry.providerHandle);

		const next = new Map(this.sessions);
		next.delete(handle.changeId);
		this.sessions = next;

		this.store.remove(handle.changeId);
	}
}

function isSessionErrorKind(
	value: unknown,
): value is "ProcessDied" | "Timeout" | "AuthFailure" | "MalformedResponse" {
	return (
		value === "ProcessDied" ||
		value === "Timeout" ||
		value === "AuthFailure" ||
		value === "MalformedResponse"
	);
}
