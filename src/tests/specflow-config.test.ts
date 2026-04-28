import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	_resetWarningCacheForTests,
	applyBorderlineOverride,
	parseBoolean,
	parseNonNegativeInt,
	parsePositiveInt,
	readLeafUnder,
	readSpecflowSharedConfig,
} from "../lib/specflow-config.js";

interface CapturedStderr {
	readonly text: string;
}

function captureStderr(fn: () => void): CapturedStderr {
	const buf: string[] = [];
	const orig = process.stderr.write.bind(process.stderr);
	process.stderr.write = ((chunk: unknown) => {
		buf.push(String(chunk));
		return true;
	}) as typeof process.stderr.write;
	try {
		fn();
		return { text: buf.join("") };
	} finally {
		process.stderr.write = orig;
	}
}

// --- parsers ---

test("parseBoolean: case-insensitive true/false, null otherwise", () => {
	assert.equal(parseBoolean("true"), true);
	assert.equal(parseBoolean("True"), true);
	assert.equal(parseBoolean("FALSE"), false);
	assert.equal(parseBoolean("yes"), null);
	assert.equal(parseBoolean(null), null);
});

test("parseNonNegativeInt: accepts 0 and positives, rejects negatives and floats", () => {
	assert.equal(parseNonNegativeInt("0"), 0);
	assert.equal(parseNonNegativeInt("42"), 42);
	assert.equal(parseNonNegativeInt("-1"), null);
	assert.equal(parseNonNegativeInt("3.5"), null);
	assert.equal(parseNonNegativeInt("abc"), null);
});

test("parsePositiveInt: rejects 0", () => {
	assert.equal(parsePositiveInt("1"), 1);
	assert.equal(parsePositiveInt("0"), null);
});

// --- readLeafUnder ---

test("readLeafUnder: returns leaf value at the expected path", () => {
	const yaml = "apply:\n  subagent_dispatch:\n    enabled: true\n";
	assert.equal(readLeafUnder(yaml, ["apply", "subagent_dispatch"], "enabled"), "true");
});

test("readLeafUnder: returns null when path missing", () => {
	const yaml = "review:\n  threshold: 5\n";
	assert.equal(
		readLeafUnder(yaml, ["apply", "subagent_dispatch"], "enabled"),
		null,
	);
});

// --- readSpecflowSharedConfig: file resolution ---

test("readSpecflowSharedConfig: returns empty string when neither file exists", () => {
	const dir = mkdtempSync(join(tmpdir(), "spec-cfg-"));
	try {
		_resetWarningCacheForTests();
		const captured = captureStderr(() => {
			assert.equal(readSpecflowSharedConfig(dir), "");
		});
		assert.equal(captured.text, "", "no warnings when no files exist");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("readSpecflowSharedConfig: returns canonical content, no warning", () => {
	const dir = mkdtempSync(join(tmpdir(), "spec-cfg-"));
	try {
		_resetWarningCacheForTests();
		mkdirSync(join(dir, ".specflow"));
		writeFileSync(
			join(dir, ".specflow/config.yaml"),
			"max_autofix_rounds: 5\n",
			"utf8",
		);
		const captured = captureStderr(() => {
			const content = readSpecflowSharedConfig(dir);
			assert.ok(content.includes("max_autofix_rounds: 5"));
		});
		assert.equal(captured.text, "");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

// --- legacy detection: shared-policy keys in openspec/config.yaml ---

test("readSpecflowSharedConfig: warns for shared-policy key in openspec/config.yaml", () => {
	const dir = mkdtempSync(join(tmpdir(), "spec-cfg-"));
	try {
		_resetWarningCacheForTests();
		mkdirSync(join(dir, "openspec"));
		writeFileSync(
			join(dir, "openspec/config.yaml"),
			`apply:
  subagent_dispatch:
    enabled: true
max_autofix_rounds: 6
`,
			"utf8",
		);
		const captured = captureStderr(() => {
			readSpecflowSharedConfig(dir);
		});
		assert.ok(
			captured.text.includes("apply.subagent_dispatch.enabled"),
			"warning names dispatch key",
		);
		assert.ok(
			captured.text.includes("max_autofix_rounds"),
			"warning names autofix-rounds key",
		);
		assert.ok(
			captured.text.includes(".specflow/config.yaml"),
			"warning names canonical destination",
		);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("readSpecflowSharedConfig: per-process dedupe — same warning emitted only once", () => {
	const dir = mkdtempSync(join(tmpdir(), "spec-cfg-"));
	try {
		_resetWarningCacheForTests();
		mkdirSync(join(dir, "openspec"));
		writeFileSync(
			join(dir, "openspec/config.yaml"),
			"max_autofix_rounds: 6\n",
			"utf8",
		);
		const captured = captureStderr(() => {
			readSpecflowSharedConfig(dir);
			readSpecflowSharedConfig(dir);
			readSpecflowSharedConfig(dir);
		});
		const occurrences = captured.text.split("max_autofix_rounds").length - 1;
		assert.equal(occurrences, 1, "warning is deduped per process");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

// --- legacy detection: env-only keys in .specflow/config.yaml (P1 review finding) ---

test("readSpecflowSharedConfig: warns for SPECFLOW_MAIN_AGENT in .specflow/config.yaml", () => {
	const dir = mkdtempSync(join(tmpdir(), "spec-cfg-"));
	try {
		_resetWarningCacheForTests();
		mkdirSync(join(dir, ".specflow"));
		// Operator misplaces an env-style key into the shared yaml.
		writeFileSync(
			join(dir, ".specflow/config.yaml"),
			"SPECFLOW_MAIN_AGENT: claude\n",
			"utf8",
		);
		const captured = captureStderr(() => {
			readSpecflowSharedConfig(dir);
		});
		assert.ok(
			captured.text.includes("SPECFLOW_MAIN_AGENT"),
			"warning names the misplaced env-key",
		);
		assert.ok(
			captured.text.includes(".specflow/config.env"),
			"warning names the canonical env destination",
		);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

// --- borderline override ---

test("applyBorderlineOverride: returns yaml value when env name is not classified borderline", () => {
	const result = applyBorderlineOverride("yamlVal", "SPECFLOW_NOT_BORDERLINE");
	assert.equal(result, "yamlVal");
});

test("applyBorderlineOverride: env wins for borderline keys when set", () => {
	const origEnv =
		process.env.SPECFLOW_APPLY_SUBAGENT_DISPATCH_MAX_CONCURRENCY;
	try {
		process.env.SPECFLOW_APPLY_SUBAGENT_DISPATCH_MAX_CONCURRENCY = "9";
		const result = applyBorderlineOverride(
			"5",
			"SPECFLOW_APPLY_SUBAGENT_DISPATCH_MAX_CONCURRENCY",
		);
		assert.equal(result, "9");
	} finally {
		if (origEnv === undefined) {
			delete process.env.SPECFLOW_APPLY_SUBAGENT_DISPATCH_MAX_CONCURRENCY;
		} else {
			process.env.SPECFLOW_APPLY_SUBAGENT_DISPATCH_MAX_CONCURRENCY = origEnv;
		}
	}
});

test("applyBorderlineOverride: yaml value used when env unset", () => {
	const origEnv =
		process.env.SPECFLOW_APPLY_SUBAGENT_DISPATCH_MAX_CONCURRENCY;
	try {
		delete process.env.SPECFLOW_APPLY_SUBAGENT_DISPATCH_MAX_CONCURRENCY;
		const result = applyBorderlineOverride(
			"5",
			"SPECFLOW_APPLY_SUBAGENT_DISPATCH_MAX_CONCURRENCY",
		);
		assert.equal(result, "5");
	} finally {
		if (origEnv !== undefined) {
			process.env.SPECFLOW_APPLY_SUBAGENT_DISPATCH_MAX_CONCURRENCY = origEnv;
		}
	}
});
