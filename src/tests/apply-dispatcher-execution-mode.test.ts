import assert from "node:assert/strict";
import test from "node:test";
import type { DispatchConfig } from "../lib/apply-dispatcher/config.js";
import { assignExecutionMode } from "../lib/apply-dispatcher/execution-mode.js";
import type { Bundle } from "../lib/task-planner/types.js";

function bundle(overrides: Partial<Bundle>): Bundle {
	return {
		id: "b",
		title: "Bundle",
		goal: "do the thing",
		depends_on: [],
		inputs: [],
		outputs: [],
		status: "pending",
		tasks: [],
		owner_capabilities: ["some-cap"],
		...overrides,
	};
}

function cfg(overrides: Partial<DispatchConfig> = {}): DispatchConfig {
	return {
		enabled: true,
		threshold: 5,
		maxConcurrency: 3,
		...overrides,
	};
}

// --- enabled: false ---

test("assignExecutionMode: inline-main when dispatch is disabled regardless of size_score", () => {
	for (const size of [0, 1, 5, 6, 10, 100]) {
		assert.equal(
			assignExecutionMode(
				bundle({ size_score: size }),
				cfg({ enabled: false }),
			),
			"inline-main",
			`size_score=${size} should be inline-main when disabled`,
		);
	}
});

// --- size_score above / at / below threshold ---

test("assignExecutionMode: subagent-worktree when size_score > threshold and enabled", () => {
	assert.equal(
		assignExecutionMode(bundle({ size_score: 6 }), cfg({ threshold: 5 })),
		"subagent-worktree",
	);
	assert.equal(
		assignExecutionMode(bundle({ size_score: 100 }), cfg({ threshold: 5 })),
		"subagent-worktree",
	);
});

test("assignExecutionMode: inline-main when size_score == threshold (strict greater-than)", () => {
	assert.equal(
		assignExecutionMode(bundle({ size_score: 5 }), cfg({ threshold: 5 })),
		"inline-main",
	);
});

test("assignExecutionMode: inline-main when size_score < threshold", () => {
	assert.equal(
		assignExecutionMode(bundle({ size_score: 0 }), cfg({ threshold: 5 })),
		"inline-main",
	);
	assert.equal(
		assignExecutionMode(bundle({ size_score: 4 }), cfg({ threshold: 5 })),
		"inline-main",
	);
});

// --- missing size_score (pre-feature graph) ---

test("assignExecutionMode: inline-main when size_score is undefined regardless of threshold", () => {
	assert.equal(
		assignExecutionMode(
			bundle({ size_score: undefined }),
			cfg({ threshold: 0 }),
		),
		"inline-main",
	);
	assert.equal(
		assignExecutionMode(
			bundle({ size_score: undefined }),
			cfg({ threshold: 100 }),
		),
		"inline-main",
	);
});

// --- threshold = 0 ---

test("assignExecutionMode: threshold 0 routes every bundle with size_score > 0 to subagent-worktree", () => {
	assert.equal(
		assignExecutionMode(bundle({ size_score: 1 }), cfg({ threshold: 0 })),
		"subagent-worktree",
	);
	assert.equal(
		assignExecutionMode(bundle({ size_score: 0 }), cfg({ threshold: 0 })),
		"inline-main",
	);
});

// --- determinism ---

test("assignExecutionMode: same inputs yield same output on repeated calls (deterministic)", () => {
	const b = bundle({ size_score: 7 });
	const c = cfg({ threshold: 5 });
	const a1 = assignExecutionMode(b, c);
	const a2 = assignExecutionMode(b, c);
	const a3 = assignExecutionMode(b, c);
	assert.equal(a1, "subagent-worktree");
	assert.equal(a1, a2);
	assert.equal(a2, a3);
});

// --- boundary: size_score = threshold + 1 is the smallest subagent-worktree ---

test("assignExecutionMode: boundary — threshold=5 promotes bundle at size_score=6 only", () => {
	for (let s = 0; s <= 5; s++) {
		assert.equal(
			assignExecutionMode(bundle({ size_score: s }), cfg({ threshold: 5 })),
			"inline-main",
			`size_score=${s} should be inline-main`,
		);
	}
	assert.equal(
		assignExecutionMode(bundle({ size_score: 6 }), cfg({ threshold: 5 })),
		"subagent-worktree",
	);
});
