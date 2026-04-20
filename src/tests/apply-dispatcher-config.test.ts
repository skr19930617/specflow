import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	DEFAULT_DISPATCH_CONFIG,
	parseDispatchConfig,
	readDispatchConfig,
	shouldUseDispatcher,
} from "../lib/apply-dispatcher/config.js";

// --- parseDispatchConfig: empty / missing ---

test("parseDispatchConfig: empty content falls back to defaults", () => {
	assert.deepEqual(parseDispatchConfig(""), DEFAULT_DISPATCH_CONFIG);
});

test("parseDispatchConfig: config without apply section falls back to defaults", () => {
	const yaml = "max_autofix_rounds: 4\nunrelated: value\n";
	assert.deepEqual(parseDispatchConfig(yaml), DEFAULT_DISPATCH_CONFIG);
});

test("parseDispatchConfig: empty apply.subagent_dispatch section falls back to defaults", () => {
	const yaml = `apply:
  subagent_dispatch:
`;
	assert.deepEqual(parseDispatchConfig(yaml), DEFAULT_DISPATCH_CONFIG);
});

// --- parseDispatchConfig: full / partial ---

test("parseDispatchConfig: full section parses all three fields", () => {
	const yaml = `apply:
  subagent_dispatch:
    enabled: true
    threshold: 10
    max_concurrency: 5
`;
	assert.deepEqual(parseDispatchConfig(yaml), {
		enabled: true,
		threshold: 10,
		maxConcurrency: 5,
	});
});

test("parseDispatchConfig: partial section keeps defaults for missing fields", () => {
	const yaml = `apply:
  subagent_dispatch:
    enabled: true
`;
	assert.deepEqual(parseDispatchConfig(yaml), {
		enabled: true,
		threshold: DEFAULT_DISPATCH_CONFIG.threshold,
		maxConcurrency: DEFAULT_DISPATCH_CONFIG.maxConcurrency,
	});
});

test("parseDispatchConfig: enabled=false parses correctly (not confused with missing)", () => {
	const yaml = `apply:
  subagent_dispatch:
    enabled: false
    threshold: 7
`;
	const result = parseDispatchConfig(yaml);
	assert.equal(result.enabled, false);
	assert.equal(result.threshold, 7);
});

test("parseDispatchConfig: threshold=0 is valid (non-negative integer)", () => {
	const yaml = `apply:
  subagent_dispatch:
    threshold: 0
`;
	assert.equal(parseDispatchConfig(yaml).threshold, 0);
});

// --- parseDispatchConfig: invalid values fall back ---

test("parseDispatchConfig: negative threshold falls back to default", () => {
	const yaml = `apply:
  subagent_dispatch:
    threshold: -1
`;
	assert.equal(
		parseDispatchConfig(yaml).threshold,
		DEFAULT_DISPATCH_CONFIG.threshold,
	);
});

test("parseDispatchConfig: non-integer threshold falls back to default", () => {
	const yaml = `apply:
  subagent_dispatch:
    threshold: 5.5
`;
	assert.equal(
		parseDispatchConfig(yaml).threshold,
		DEFAULT_DISPATCH_CONFIG.threshold,
	);
});

test("parseDispatchConfig: zero max_concurrency falls back (must be positive)", () => {
	const yaml = `apply:
  subagent_dispatch:
    max_concurrency: 0
`;
	assert.equal(
		parseDispatchConfig(yaml).maxConcurrency,
		DEFAULT_DISPATCH_CONFIG.maxConcurrency,
	);
});

test("parseDispatchConfig: non-boolean enabled value falls back", () => {
	const yaml = `apply:
  subagent_dispatch:
    enabled: yes
`;
	assert.equal(
		parseDispatchConfig(yaml).enabled,
		DEFAULT_DISPATCH_CONFIG.enabled,
	);
});

test("parseDispatchConfig: comments in section are ignored", () => {
	const yaml = `apply:
  subagent_dispatch:
    # turn it on
    enabled: true
    threshold: 3    # override default
    max_concurrency: 2
`;
	assert.deepEqual(parseDispatchConfig(yaml), {
		enabled: true,
		threshold: 3,
		maxConcurrency: 2,
	});
});

test("parseDispatchConfig: sibling top-level keys do not leak into the section", () => {
	const yaml = `max_autofix_rounds: 4
apply:
  subagent_dispatch:
    enabled: true
diff_warn_threshold: 1000
`;
	assert.equal(parseDispatchConfig(yaml).enabled, true);
});

// R3-F07: when `apply:` exists but has NO `subagent_dispatch:` block, an
// unrelated top-level key's `subagent_dispatch:` must NOT be picked up.
test("parseDispatchConfig: unrelated section with subagent_dispatch does not leak into apply", () => {
	const yaml = `apply:
  other_key: something
review:
  subagent_dispatch:
    enabled: true
    threshold: 99
`;
	// apply.subagent_dispatch is genuinely absent → defaults across the board.
	assert.deepEqual(parseDispatchConfig(yaml), DEFAULT_DISPATCH_CONFIG);
});

test("parseDispatchConfig: empty apply: block does not pick up later sibling section", () => {
	const yaml = `apply:
other_root:
  subagent_dispatch:
    enabled: true
    threshold: 42
`;
	assert.deepEqual(parseDispatchConfig(yaml), DEFAULT_DISPATCH_CONFIG);
});

test("parseDispatchConfig: apply.subagent_dispatch leaves are not read from a sibling top-level section", () => {
	// `apply` has a real subagent_dispatch but without `threshold`. A later
	// top-level `review.subagent_dispatch.threshold` must NOT fill in for it.
	const yaml = `apply:
  subagent_dispatch:
    enabled: true
review:
  subagent_dispatch:
    threshold: 42
`;
	const result = parseDispatchConfig(yaml);
	assert.equal(result.enabled, true);
	assert.equal(
		result.threshold,
		DEFAULT_DISPATCH_CONFIG.threshold,
		"apply.subagent_dispatch.threshold is missing → default, not leaked from review",
	);
});

// --- readDispatchConfig: filesystem integration ---

test("readDispatchConfig: returns defaults when openspec/config.yaml does not exist", () => {
	const dir = mkdtempSync(join(tmpdir(), "dispatch-config-"));
	try {
		// No openspec/ directory at all — should fall through to defaults.
		assert.deepEqual(readDispatchConfig(dir), DEFAULT_DISPATCH_CONFIG);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("readDispatchConfig: reads from openspec/config.yaml when present", () => {
	const dir = mkdtempSync(join(tmpdir(), "dispatch-config-"));
	try {
		mkdirSync(join(dir, "openspec"));
		writeFileSync(
			join(dir, "openspec/config.yaml"),
			`apply:
  subagent_dispatch:
    enabled: true
    threshold: 8
    max_concurrency: 2
`,
			"utf8",
		);
		assert.deepEqual(readDispatchConfig(dir), {
			enabled: true,
			threshold: 8,
			maxConcurrency: 2,
		});
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

// --- shouldUseDispatcher: guard semantics ---

test("shouldUseDispatcher: returns true only when enabled AND task-graph exists", () => {
	assert.equal(
		shouldUseDispatcher({ ...DEFAULT_DISPATCH_CONFIG, enabled: true }, true),
		true,
	);
});

test("shouldUseDispatcher: returns false when enabled but task-graph absent (legacy fallback)", () => {
	assert.equal(
		shouldUseDispatcher({ ...DEFAULT_DISPATCH_CONFIG, enabled: true }, false),
		false,
	);
});

test("shouldUseDispatcher: returns false when disabled regardless of task-graph", () => {
	assert.equal(shouldUseDispatcher(DEFAULT_DISPATCH_CONFIG, true), false);
	assert.equal(shouldUseDispatcher(DEFAULT_DISPATCH_CONFIG, false), false);
});
