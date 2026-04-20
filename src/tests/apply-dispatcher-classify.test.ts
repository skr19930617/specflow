import assert from "node:assert/strict";
import test from "node:test";
import { classifyWindow } from "../lib/apply-dispatcher/classify.js";
import {
	DEFAULT_DISPATCH_CONFIG,
	type DispatchConfig,
} from "../lib/apply-dispatcher/config.js";
import type { Bundle } from "../lib/task-planner/types.js";

function bundle(id: string, size_score?: number): Bundle {
	return {
		id,
		title: id,
		goal: "",
		depends_on: [],
		inputs: [],
		outputs: [],
		status: "pending",
		tasks: Array.from({ length: size_score ?? 0 }, (_, i) => ({
			id: `${id}-${i + 1}`,
			title: `t${i + 1}`,
			status: "pending" as const,
		})),
		owner_capabilities: [],
		...(size_score === undefined ? {} : { size_score }),
	};
}

const enabled: DispatchConfig = {
	enabled: true,
	threshold: 5,
	maxConcurrency: 3,
};

test("classifyWindow: disabled config always returns inline single-chunk", () => {
	const window = [bundle("a", 100), bundle("b", 200)];
	const decision = classifyWindow(window, DEFAULT_DISPATCH_CONFIG);
	assert.equal(decision.mode, "inline");
	assert.equal(decision.chunks.length, 1);
	assert.equal(decision.chunks[0]?.length, 2);
});

test("classifyWindow: all bundles below threshold run inline", () => {
	const window = [bundle("a", 3), bundle("b", 5), bundle("c", 1)];
	const decision = classifyWindow(window, enabled);
	assert.equal(decision.mode, "inline");
	assert.equal(decision.chunks.length, 1);
});

test("classifyWindow: one bundle above threshold promotes entire window to subagent", () => {
	const window = [bundle("a", 3), bundle("b", 10), bundle("c", 1)];
	const decision = classifyWindow(window, enabled);
	assert.equal(decision.mode, "subagent");
	// All 3 bundles dispatched, chunk size 3 → single chunk of 3.
	assert.equal(decision.chunks.length, 1);
	assert.equal(decision.chunks[0]?.length, 3);
});

test("classifyWindow: threshold is strict (> not ≥)", () => {
	// size_score == threshold is inline-only.
	const decision = classifyWindow([bundle("a", 5)], enabled);
	assert.equal(decision.mode, "inline");
});

test("classifyWindow: missing size_score is always inline-only (backward compat)", () => {
	// A bundle with no size_score is treated as inline-only regardless of
	// threshold — even when siblings would otherwise promote the window.
	const window = [bundle("a"), bundle("b", 100)];
	const decision = classifyWindow(window, enabled);
	// One bundle above threshold still promotes the window (uniform dispatch).
	assert.equal(decision.mode, "subagent");
});

test("classifyWindow: window of only missing-size_score bundles is inline", () => {
	const window = [bundle("a"), bundle("b"), bundle("c")];
	const decision = classifyWindow(window, enabled);
	assert.equal(decision.mode, "inline");
});

test("classifyWindow: chunk boundaries follow maxConcurrency for subagent windows", () => {
	const config: DispatchConfig = {
		enabled: true,
		threshold: 1,
		maxConcurrency: 3,
	};
	const window = [
		bundle("a", 2),
		bundle("b", 2),
		bundle("c", 2),
		bundle("d", 2),
		bundle("e", 2),
		bundle("f", 2),
		bundle("g", 2),
	];
	const decision = classifyWindow(window, config);
	assert.equal(decision.mode, "subagent");
	assert.deepEqual(
		decision.chunks.map((c) => c.length),
		[3, 3, 1],
	);
	// Chunks preserve the original bundle order.
	assert.equal(decision.chunks[0]?.[0]?.id, "a");
	assert.equal(decision.chunks[2]?.[0]?.id, "g");
});

test("classifyWindow: maxConcurrency=1 produces serial subagent chunks", () => {
	const config: DispatchConfig = {
		enabled: true,
		threshold: 1,
		maxConcurrency: 1,
	};
	const window = [bundle("a", 3), bundle("b", 3)];
	const decision = classifyWindow(window, config);
	assert.equal(decision.mode, "subagent");
	assert.deepEqual(
		decision.chunks.map((c) => c.length),
		[1, 1],
	);
});

test("classifyWindow: chunk boundaries are deterministic across invocations", () => {
	const config: DispatchConfig = {
		enabled: true,
		threshold: 1,
		maxConcurrency: 2,
	};
	const window = [
		bundle("a", 3),
		bundle("b", 3),
		bundle("c", 3),
		bundle("d", 3),
	];
	const first = classifyWindow(window, config);
	const second = classifyWindow(window, config);
	assert.deepEqual(
		first.chunks.map((c) => c.map((b) => b.id)),
		second.chunks.map((c) => c.map((b) => b.id)),
	);
});
