import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type {
	ProviderAdapter,
	ProviderHandle,
} from "../lib/agent-session/adapters/types.js";
import {
	ConfigMismatchError,
	SessionError,
} from "../lib/agent-session/errors.js";
import {
	DefaultAgentSessionManager,
	SendQueue,
} from "../lib/agent-session/session-manager.js";
import { SessionMetadataStore } from "../lib/agent-session/session-store.js";
import type {
	AgentConfig,
	AgentMessage,
	AgentResponse,
	SessionHandle,
} from "../lib/agent-session/types.js";
import { createSessionHandle } from "../lib/agent-session/types.js";

// ============================================================================
// SendQueue tests
// ============================================================================

test("SendQueue: FIFO ordering of concurrent enqueues", async () => {
	const queue = new SendQueue();
	const order: number[] = [];

	const p1 = queue.enqueue(async () => {
		order.push(1);
		return "a";
	});
	const p2 = queue.enqueue(async () => {
		order.push(2);
		return "b";
	});
	const p3 = queue.enqueue(async () => {
		order.push(3);
		return "c";
	});

	const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
	assert.deepStrictEqual(order, [1, 2, 3]);
	assert.equal(r1, "a");
	assert.equal(r2, "b");
	assert.equal(r3, "c");
});

test("SendQueue: SessionError poisons the queue", async () => {
	const queue = new SendQueue();
	const dummyHandle = createSessionHandle("test", "test-id");

	const p1 = queue.enqueue(async () => {
		throw new SessionError("ProcessDied", dummyHandle, "process died");
	});
	const p2 = queue.enqueue(async () => "should not run");

	await assert.rejects(p1, (err: unknown) => {
		assert.ok(err instanceof SessionError);
		assert.equal(err.kind, "ProcessDied");
		return true;
	});

	assert.ok(queue.poisoned, "Queue should be poisoned");

	await assert.rejects(p2, (err: unknown) => {
		assert.ok(err instanceof SessionError);
		return true;
	});
});

test("SendQueue: non-SessionError does not poison the queue", async () => {
	const queue = new SendQueue();

	const p1 = queue.enqueue(async () => {
		throw new Error("regular error");
	});
	const p2 = queue.enqueue(async () => "ok");

	await assert.rejects(p1);
	const result = await p2;
	assert.equal(result, "ok");
	assert.ok(!queue.poisoned, "Queue should not be poisoned");
});

test("SendQueue: poisoned queue rejects immediately without executing fn", async () => {
	const queue = new SendQueue();
	const dummyHandle = createSessionHandle("test", "test-id");

	// Poison the queue.
	await assert.rejects(
		queue.enqueue(async () => {
			throw new SessionError("Timeout", dummyHandle, "timeout");
		}),
	);

	let fnCalled = false;
	await assert.rejects(
		queue.enqueue(async () => {
			fnCalled = true;
			return "unreachable";
		}),
	);
	assert.ok(!fnCalled, "Function should not have been called");
});

// ============================================================================
// SessionMetadataStore tests
// ============================================================================

function makeTempDir(): string {
	const dir = join(
		tmpdir(),
		`agent-session-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
	);
	mkdirSync(dir, { recursive: true });
	return dir;
}

test("SessionMetadataStore: add/get/remove lifecycle", () => {
	const dir = makeTempDir();
	try {
		const store = new SessionMetadataStore(dir);
		store.add({
			changeId: "change-1",
			provider: "claude",
			pid: 99999,
			sessionId: "specflow-change-1",
			createdAt: "2026-01-01T00:00:00Z",
		});

		const entry = store.get("change-1");
		assert.ok(entry);
		assert.equal(entry.changeId, "change-1");
		assert.equal(entry.provider, "claude");

		store.remove("change-1");
		assert.equal(store.get("change-1"), undefined);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("SessionMetadataStore: persists to disk", () => {
	const dir = makeTempDir();
	try {
		const store1 = new SessionMetadataStore(dir);
		store1.add({
			changeId: "change-2",
			provider: "codex",
			pid: 88888,
			sessionId: "specflow-change-2",
			createdAt: "2026-01-01T00:00:00Z",
		});

		// Create a new store instance reading from the same directory.
		const store2 = new SessionMetadataStore(dir);
		const entry = store2.get("change-2");
		assert.ok(entry);
		assert.equal(entry.provider, "codex");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("SessionMetadataStore: cleanup removes all entries", () => {
	const dir = makeTempDir();
	try {
		const store = new SessionMetadataStore(dir);
		store.add({
			changeId: "stale-1",
			provider: "copilot",
			pid: 1, // PID 1 is init — always alive but cleanup tries to clean anyway.
			sessionId: "specflow-stale-1",
			createdAt: "2026-01-01T00:00:00Z",
		});

		store.cleanup();
		assert.equal(store.all().length, 0);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

// ============================================================================
// Mock ProviderAdapter
// ============================================================================

function createMockAdapter(
	provider: "claude" | "codex" | "copilot" = "claude",
): {
	adapter: ProviderAdapter;
	sendFn: (
		handle: ProviderHandle,
		message: AgentMessage,
		timeoutMs: number,
	) => Promise<AgentResponse>;
	startCalls: Array<{ changeId: string; config: AgentConfig }>;
	stopCalls: ProviderHandle[];
	alive: Set<string>;
} {
	const startCalls: Array<{ changeId: string; config: AgentConfig }> = [];
	const stopCalls: ProviderHandle[] = [];
	const alive = new Set<string>();

	let sendFn: (
		handle: ProviderHandle,
		message: AgentMessage,
		timeoutMs: number,
	) => Promise<AgentResponse> = async (_h, msg) => ({
		output: `echo: ${msg.prompt}`,
	});

	const adapter: ProviderAdapter = {
		provider,
		start(changeId: string, config: AgentConfig): ProviderHandle {
			startCalls.push({ changeId, config });
			const handle: ProviderHandle = {
				provider,
				changeId,
				sessionId: `specflow-${changeId}`,
			};
			alive.add(changeId);
			return handle;
		},
		async send(
			handle: ProviderHandle,
			message: AgentMessage,
			timeoutMs: number,
		): Promise<AgentResponse> {
			return sendFn(handle, message, timeoutMs);
		},
		stop(handle: ProviderHandle): void {
			stopCalls.push(handle);
			alive.delete(handle.changeId);
		},
		isAlive(handle: ProviderHandle): boolean {
			return alive.has(handle.changeId);
		},
	};

	return {
		adapter,
		get sendFn() {
			return sendFn;
		},
		set sendFn(fn: (
			handle: ProviderHandle,
			message: AgentMessage,
			timeoutMs: number,
		) => Promise<AgentResponse>,) {
			sendFn = fn;
		},
		startCalls,
		stopCalls,
		alive,
	};
}

// ============================================================================
// DefaultAgentSessionManager tests
// ============================================================================

function createTestManager(
	mockAdapter?: ReturnType<typeof createMockAdapter>,
): {
	manager: DefaultAgentSessionManager;
	mock: ReturnType<typeof createMockAdapter>;
	dir: string;
} {
	const dir = makeTempDir();
	const mock = mockAdapter ?? createMockAdapter();
	const store = new SessionMetadataStore(dir);
	const adapters = new Map([
		["claude" as const, mock.adapter],
		["codex" as const, mock.adapter],
		["copilot" as const, mock.adapter],
	]);
	const manager = new DefaultAgentSessionManager({
		adapters,
		store,
		repoRoot: dir,
	});
	return { manager, mock, dir };
}

const defaultConfig: AgentConfig = { provider: "claude", sendTimeoutMs: 30000 };
const defaultMessage: AgentMessage = { prompt: "hello", phase: "apply_draft" };

test("DefaultAgentSessionManager: create returns a session handle", async () => {
	const { manager, dir } = createTestManager();
	try {
		const handle = await manager.create("change-a", defaultConfig);
		assert.ok(handle);
		assert.equal(handle.changeId, "change-a");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("DefaultAgentSessionManager: idempotent create returns same handle", async () => {
	const { manager, mock, dir } = createTestManager();
	try {
		const h1 = await manager.create("change-b", defaultConfig);
		const h2 = await manager.create("change-b", defaultConfig);
		assert.equal(h1.id, h2.id);
		assert.equal(mock.startCalls.length, 1, "adapter.start called only once");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("DefaultAgentSessionManager: config mismatch throws", async () => {
	const { manager, dir } = createTestManager();
	try {
		await manager.create("change-c", defaultConfig);
		await assert.rejects(
			manager.create("change-c", { provider: "codex", sendTimeoutMs: 60000 }),
			(err: unknown) => {
				assert.ok(err instanceof ConfigMismatchError);
				assert.equal(err.changeId, "change-c");
				return true;
			},
		);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("DefaultAgentSessionManager: send returns agent response", async () => {
	const { manager, dir } = createTestManager();
	try {
		const handle = await manager.create("change-d", defaultConfig);
		const response = await manager.send(handle, defaultMessage);
		assert.equal(response.output, "echo: hello");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("DefaultAgentSessionManager: send on dead handle throws SessionError", async () => {
	const { manager, mock, dir } = createTestManager();
	try {
		const handle = await manager.create("change-e", defaultConfig);
		// Kill the session externally.
		mock.alive.delete("change-e");
		await assert.rejects(
			manager.send(handle, defaultMessage),
			(err: unknown) => {
				assert.ok(err instanceof SessionError);
				assert.equal(err.kind, "ProcessDied");
				return true;
			},
		);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("DefaultAgentSessionManager: destroy tears down session", async () => {
	const { manager, mock, dir } = createTestManager();
	try {
		const handle = await manager.create("change-f", defaultConfig);
		await manager.destroy(handle);
		assert.equal(mock.stopCalls.length, 1);

		// Send after destroy should fail.
		await assert.rejects(
			manager.send(handle, defaultMessage),
			(err: unknown) => {
				assert.ok(err instanceof SessionError);
				return true;
			},
		);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("DefaultAgentSessionManager: destroy on already-destroyed is no-op", async () => {
	const { manager, mock, dir } = createTestManager();
	try {
		const handle = await manager.create("change-g", defaultConfig);
		await manager.destroy(handle);
		await manager.destroy(handle); // No-op, should not throw.
		assert.equal(mock.stopCalls.length, 1, "stop called only once");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("DefaultAgentSessionManager: send serializes concurrent calls", async () => {
	const { manager, dir } = createTestManager();
	try {
		const order: number[] = [];
		const mock = createMockAdapter();
		const origSend = mock.adapter.send.bind(mock.adapter);
		// Override sendFn to track order.
		mock.sendFn = async (h, msg, t) => {
			const idx = Number(msg.prompt);
			order.push(idx);
			return { output: String(idx) };
		};

		const store = new SessionMetadataStore(dir);
		const mgr = new DefaultAgentSessionManager({
			adapters: new Map([["claude" as const, mock.adapter]]),
			store,
			repoRoot: dir,
		});

		const handle = await mgr.create("change-h", defaultConfig);
		const p1 = mgr.send(handle, { prompt: "1", phase: "test" });
		const p2 = mgr.send(handle, { prompt: "2", phase: "test" });
		const p3 = mgr.send(handle, { prompt: "3", phase: "test" });

		await Promise.all([p1, p2, p3]);
		assert.deepStrictEqual(order, [1, 2, 3]);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("DefaultAgentSessionManager: startup cleanup runs on first create", async () => {
	const dir = makeTempDir();
	try {
		// Pre-populate stale metadata.
		const staleStore = new SessionMetadataStore(dir);
		staleStore.add({
			changeId: "stale-change",
			provider: "claude",
			pid: 999999, // Non-existent PID.
			sessionId: "specflow-stale-change",
			createdAt: "2026-01-01T00:00:00Z",
		});

		const mock = createMockAdapter();
		const store = new SessionMetadataStore(dir);
		const mgr = new DefaultAgentSessionManager({
			adapters: new Map([["claude" as const, mock.adapter]]),
			store,
			repoRoot: dir,
		});

		// Creating a session triggers init which runs cleanup.
		await mgr.create("new-change", defaultConfig);

		// The stale entry should be cleaned up.
		const freshStore = new SessionMetadataStore(dir);
		assert.equal(
			freshStore.get("stale-change"),
			undefined,
			"Stale entry should be cleaned up",
		);
		// The new entry should exist.
		assert.ok(freshStore.get("new-change"), "New entry should be persisted");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
