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
import { _resetWarningCacheForTests } from "../lib/specflow-config.js";

// --- DEFAULT_DISPATCH_CONFIG: default-on after the flip ---

test("DEFAULT_DISPATCH_CONFIG.enabled is true by default (enabled by default, explicit opt-out)", () => {
	assert.equal(DEFAULT_DISPATCH_CONFIG.enabled, true);
	assert.equal(DEFAULT_DISPATCH_CONFIG.threshold, 5);
	assert.equal(DEFAULT_DISPATCH_CONFIG.maxConcurrency, 3);
});

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

test("parseDispatchConfig: explicit opt-out (enabled=false) is honored", () => {
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
    # turn it off explicitly
    enabled: false
    threshold: 3    # override default
    max_concurrency: 2
`;
	assert.deepEqual(parseDispatchConfig(yaml), {
		enabled: false,
		threshold: 3,
		maxConcurrency: 2,
	});
});

test("parseDispatchConfig: sibling top-level keys do not leak into the section", () => {
	const yaml = `max_autofix_rounds: 4
apply:
  subagent_dispatch:
    enabled: false
diff_warn_threshold: 1000
`;
	assert.equal(parseDispatchConfig(yaml).enabled, false);
});

// R3-F07: when `apply:` exists but has NO `subagent_dispatch:` block, an
// unrelated top-level key's `subagent_dispatch:` must NOT be picked up.
test("parseDispatchConfig: unrelated section with subagent_dispatch does not leak into apply", () => {
	const yaml = `apply:
  other_key: something
review:
  subagent_dispatch:
    enabled: false
    threshold: 99
`;
	// apply.subagent_dispatch is genuinely absent → defaults across the board.
	assert.deepEqual(parseDispatchConfig(yaml), DEFAULT_DISPATCH_CONFIG);
});

test("parseDispatchConfig: empty apply: block does not pick up later sibling section", () => {
	const yaml = `apply:
other_root:
  subagent_dispatch:
    enabled: false
    threshold: 42
`;
	assert.deepEqual(parseDispatchConfig(yaml), DEFAULT_DISPATCH_CONFIG);
});

test("parseDispatchConfig: apply.subagent_dispatch leaves are not read from a sibling top-level section", () => {
	const yaml = `apply:
  subagent_dispatch:
    enabled: false
review:
  subagent_dispatch:
    threshold: 42
`;
	const result = parseDispatchConfig(yaml);
	assert.equal(result.enabled, false);
	assert.equal(
		result.threshold,
		DEFAULT_DISPATCH_CONFIG.threshold,
		"apply.subagent_dispatch.threshold is missing → default, not leaked from review",
	);
});

// --- readDispatchConfig: filesystem integration ---

test("readDispatchConfig: returns defaults when neither config file exists", () => {
	const dir = mkdtempSync(join(tmpdir(), "dispatch-config-"));
	try {
		_resetWarningCacheForTests();
		assert.deepEqual(readDispatchConfig(dir), DEFAULT_DISPATCH_CONFIG);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("readDispatchConfig: reads from canonical .specflow/config.yaml when present", () => {
	const dir = mkdtempSync(join(tmpdir(), "dispatch-config-"));
	try {
		_resetWarningCacheForTests();
		mkdirSync(join(dir, ".specflow"));
		writeFileSync(
			join(dir, ".specflow/config.yaml"),
			`apply:
  subagent_dispatch:
    enabled: false
    threshold: 8
    max_concurrency: 2
`,
			"utf8",
		);
		assert.deepEqual(readDispatchConfig(dir), {
			enabled: false,
			threshold: 8,
			maxConcurrency: 2,
		});
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("readDispatchConfig: legacy openspec/config.yaml is ignored, defaults apply", () => {
	const dir = mkdtempSync(join(tmpdir(), "dispatch-config-"));
	const stderrBuf: string[] = [];
	const origWrite = process.stderr.write.bind(process.stderr);
	process.stderr.write = ((chunk: unknown) => {
		stderrBuf.push(String(chunk));
		return true;
	}) as typeof process.stderr.write;
	try {
		_resetWarningCacheForTests();
		mkdirSync(join(dir, "openspec"));
		writeFileSync(
			join(dir, "openspec/config.yaml"),
			`apply:
  subagent_dispatch:
    enabled: false
    threshold: 99
`,
			"utf8",
		);
		const result = readDispatchConfig(dir);
		// Legacy values are NOT honored — fall through to defaults.
		assert.deepEqual(result, DEFAULT_DISPATCH_CONFIG);
		const stderr = stderrBuf.join("");
		assert.ok(
			stderr.includes("apply.subagent_dispatch.enabled"),
			"warning should name the misplaced key",
		);
		assert.ok(
			stderr.includes(".specflow/config.yaml"),
			"warning should name the canonical file",
		);
	} finally {
		process.stderr.write = origWrite;
		rmSync(dir, { recursive: true, force: true });
	}
});

test("readDispatchConfig: canonical wins on duplicate, legacy emits warning", () => {
	const dir = mkdtempSync(join(tmpdir(), "dispatch-config-"));
	const stderrBuf: string[] = [];
	const origWrite = process.stderr.write.bind(process.stderr);
	process.stderr.write = ((chunk: unknown) => {
		stderrBuf.push(String(chunk));
		return true;
	}) as typeof process.stderr.write;
	try {
		_resetWarningCacheForTests();
		mkdirSync(join(dir, ".specflow"));
		mkdirSync(join(dir, "openspec"));
		writeFileSync(
			join(dir, ".specflow/config.yaml"),
			`apply:
  subagent_dispatch:
    enabled: false
`,
			"utf8",
		);
		writeFileSync(
			join(dir, "openspec/config.yaml"),
			`apply:
  subagent_dispatch:
    enabled: true
`,
			"utf8",
		);
		const result = readDispatchConfig(dir);
		// Canonical (.specflow) wins → enabled false.
		assert.equal(result.enabled, false);
		const stderr = stderrBuf.join("");
		assert.ok(
			stderr.includes(".specflow/config.yaml"),
			"warning names canonical location",
		);
	} finally {
		process.stderr.write = origWrite;
		rmSync(dir, { recursive: true, force: true });
	}
});

// --- shouldUseDispatcher: guard semantics ---

test("shouldUseDispatcher: returns true when enabled AND task-graph exists", () => {
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

test("shouldUseDispatcher: returns false when explicitly disabled regardless of task-graph", () => {
	const disabled = { ...DEFAULT_DISPATCH_CONFIG, enabled: false };
	assert.equal(shouldUseDispatcher(disabled, true), false);
	assert.equal(shouldUseDispatcher(disabled, false), false);
});

// --- Borderline override smoke test: max_concurrency ---

test("readDispatchConfig: SPECFLOW_APPLY_SUBAGENT_DISPATCH_MAX_CONCURRENCY overrides the yaml value", () => {
	const dir = mkdtempSync(join(tmpdir(), "dispatch-config-"));
	const origEnv = process.env.SPECFLOW_APPLY_SUBAGENT_DISPATCH_MAX_CONCURRENCY;
	try {
		_resetWarningCacheForTests();
		mkdirSync(join(dir, ".specflow"));
		writeFileSync(
			join(dir, ".specflow/config.yaml"),
			`apply:
  subagent_dispatch:
    max_concurrency: 8
`,
			"utf8",
		);
		// Yaml says 8; env overrides to 2.
		process.env.SPECFLOW_APPLY_SUBAGENT_DISPATCH_MAX_CONCURRENCY = "2";
		const result = readDispatchConfig(dir);
		assert.equal(result.maxConcurrency, 2, "env override wins for borderline setting");
	} finally {
		if (origEnv === undefined) {
			delete process.env.SPECFLOW_APPLY_SUBAGENT_DISPATCH_MAX_CONCURRENCY;
		} else {
			process.env.SPECFLOW_APPLY_SUBAGENT_DISPATCH_MAX_CONCURRENCY = origEnv;
		}
		rmSync(dir, { recursive: true, force: true });
	}
});

test("readDispatchConfig: invalid env override falls back to yaml, not default", () => {
	const dir = mkdtempSync(join(tmpdir(), "dispatch-config-"));
	const origEnv = process.env.SPECFLOW_APPLY_SUBAGENT_DISPATCH_MAX_CONCURRENCY;
	try {
		_resetWarningCacheForTests();
		mkdirSync(join(dir, ".specflow"));
		writeFileSync(
			join(dir, ".specflow/config.yaml"),
			`apply:
  subagent_dispatch:
    max_concurrency: 4
`,
			"utf8",
		);
		process.env.SPECFLOW_APPLY_SUBAGENT_DISPATCH_MAX_CONCURRENCY = "not-a-number";
		const result = readDispatchConfig(dir);
		// Invalid env override SHALL NOT discard the valid yaml value.
		// Precedence: (valid env) > (yaml) > (default).
		assert.equal(result.maxConcurrency, 4);
	} finally {
		if (origEnv === undefined) {
			delete process.env.SPECFLOW_APPLY_SUBAGENT_DISPATCH_MAX_CONCURRENCY;
		} else {
			process.env.SPECFLOW_APPLY_SUBAGENT_DISPATCH_MAX_CONCURRENCY = origEnv;
		}
		rmSync(dir, { recursive: true, force: true });
	}
});
