// Barrel-equivalence smoke test.
//
// This test pins the runtime export surface of three library barrels that the
// `librefactoring` change consolidates. Any file merge or rename inside these
// modules MUST preserve every runtime export name. Types are erased at runtime
// and are validated separately by the TypeScript compiler (`npm run typecheck`).

import assert from "node:assert/strict";
import test from "node:test";
import * as agentSessionBarrel from "../lib/agent-session/index.js";
import * as phaseRouterBarrel from "../lib/phase-router/index.js";
import * as taskPlannerBarrel from "../lib/task-planner/index.js";

const TASK_PLANNER_EXPECTED_KEYS: readonly string[] = [
	"advanceBundleStatus",
	"checkBundleCompletion",
	"generateTaskGraph",
	"renderTasksMd",
	"assertValidTaskGraph",
	"validateTaskGraph",
	"updateBundleStatus",
	"selectNextWindow",
];

const AGENT_SESSION_EXPECTED_KEYS: readonly string[] = [
	"ClaudeAdapter",
	"CodexAdapter",
	"CopilotAdapter",
	"ConfigMismatchError",
	"SessionError",
	"SendQueue",
	"DefaultAgentSessionManager",
	"SessionMetadataStore",
	"agentConfigsEqual",
	"createSessionHandle",
];

const PHASE_ROUTER_EXPECTED_KEYS: readonly string[] = [
	"deriveAction",
	"isGated",
	"isTerminal",
	"InconsistentRunStateError",
	"MalformedContractError",
	"MissingContractError",
	"RunReadError",
	"PhaseRouter",
];

function assertRuntimeKeys(
	moduleName: string,
	barrel: object,
	expected: readonly string[],
): void {
	const actual = Object.keys(barrel).sort();
	const expectedSorted = [...expected].sort();
	assert.deepEqual(
		actual,
		expectedSorted,
		`${moduleName} barrel runtime exports drifted. ` +
			`Missing: ${expectedSorted.filter((k) => !actual.includes(k)).join(", ") || "(none)"}. ` +
			`Unexpected: ${actual.filter((k) => !expectedSorted.includes(k)).join(", ") || "(none)"}.`,
	);
}

test("task-planner barrel preserves its runtime export surface", () => {
	assertRuntimeKeys(
		"task-planner",
		taskPlannerBarrel,
		TASK_PLANNER_EXPECTED_KEYS,
	);
});

test("agent-session barrel preserves its runtime export surface", () => {
	assertRuntimeKeys(
		"agent-session",
		agentSessionBarrel,
		AGENT_SESSION_EXPECTED_KEYS,
	);
});

test("phase-router barrel preserves its runtime export surface", () => {
	assertRuntimeKeys(
		"phase-router",
		phaseRouterBarrel,
		PHASE_ROUTER_EXPECTED_KEYS,
	);
});
