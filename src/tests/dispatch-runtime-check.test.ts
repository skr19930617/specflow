import assert from "node:assert/strict";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import test from "node:test";
import { verifyLocalSubagentRuntime } from "../lib/apply-dispatcher/runtime-check.js";

interface EnvSnapshot {
	readonly main?: string;
	readonly review?: string;
	readonly path?: string;
	readonly claudeOverride?: string;
	readonly codexOverride?: string;
	readonly copilotOverride?: string;
}

function snapshot(): EnvSnapshot {
	return {
		main: process.env.SPECFLOW_MAIN_AGENT,
		review: process.env.SPECFLOW_REVIEW_AGENT,
		path: process.env.PATH,
		claudeOverride: process.env.SPECFLOW_CLAUDE,
		codexOverride: process.env.SPECFLOW_CODEX,
		copilotOverride: process.env.SPECFLOW_COPILOT,
	};
}

function restore(s: EnvSnapshot): void {
	const setOrUnset = (key: string, value: string | undefined): void => {
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	};
	setOrUnset("SPECFLOW_MAIN_AGENT", s.main);
	setOrUnset("SPECFLOW_REVIEW_AGENT", s.review);
	setOrUnset("PATH", s.path);
	setOrUnset("SPECFLOW_CLAUDE", s.claudeOverride);
	setOrUnset("SPECFLOW_CODEX", s.codexOverride);
	setOrUnset("SPECFLOW_COPILOT", s.copilotOverride);
}

function makeFakeCli(dir: string, name: string): string {
	const path = join(dir, name);
	writeFileSync(path, "#!/bin/sh\nexit 0\n", "utf8");
	chmodSync(path, 0o755);
	return path;
}

test("verifyLocalSubagentRuntime: ok when main agent CLI is on PATH", () => {
	const before = snapshot();
	const dir = mkdtempSync(join(tmpdir(), "rt-check-"));
	try {
		makeFakeCli(dir, "claude");
		// Empty config.env so we use defaults (claude main, codex review).
		mkdirSync(join(dir, ".specflow"));
		writeFileSync(join(dir, ".specflow/config.env"), "");
		// Reset env to defaults; PATH only contains our fake-cli dir.
		delete process.env.SPECFLOW_MAIN_AGENT;
		delete process.env.SPECFLOW_REVIEW_AGENT;
		delete process.env.SPECFLOW_CLAUDE;
		delete process.env.SPECFLOW_CODEX;
		delete process.env.SPECFLOW_COPILOT;
		// Default review agent is codex; create a stub for it too.
		makeFakeCli(dir, "codex");
		process.env.PATH = dir;
		const result = verifyLocalSubagentRuntime(dir);
		assert.equal(result.ok, true);
	} finally {
		restore(before);
		rmSync(dir, { recursive: true, force: true });
	}
});

test("verifyLocalSubagentRuntime: fails when main CLI is missing on PATH", () => {
	const before = snapshot();
	const dir = mkdtempSync(join(tmpdir(), "rt-check-"));
	try {
		mkdirSync(join(dir, ".specflow"));
		writeFileSync(join(dir, ".specflow/config.env"), "");
		delete process.env.SPECFLOW_MAIN_AGENT;
		delete process.env.SPECFLOW_REVIEW_AGENT;
		delete process.env.SPECFLOW_CLAUDE;
		delete process.env.SPECFLOW_CODEX;
		delete process.env.SPECFLOW_COPILOT;
		// PATH points only at an empty directory — claude CLI not resolvable.
		process.env.PATH = dir;
		const result = verifyLocalSubagentRuntime(dir);
		assert.equal(result.ok, false);
		if (!result.ok) {
			assert.ok(result.reason.includes("claude"));
			assert.ok(
				result.reason.includes(".specflow/config.env"),
				"error mentions local-runtime fix path",
			);
			assert.ok(
				result.reason.includes("apply.subagent_dispatch.enabled"),
				"error mentions explicit opt-out path",
			);
			assert.ok(result.reason.includes(".specflow/config.yaml"));
		}
	} finally {
		restore(before);
		rmSync(dir, { recursive: true, force: true });
	}
});

test("verifyLocalSubagentRuntime: fails when SPECFLOW_MAIN_AGENT is invalid", () => {
	const before = snapshot();
	const dir = mkdtempSync(join(tmpdir(), "rt-check-"));
	try {
		mkdirSync(join(dir, ".specflow"));
		// Invalid agent identifier in config.env.
		writeFileSync(
			join(dir, ".specflow/config.env"),
			"SPECFLOW_MAIN_AGENT=bogus\n",
		);
		// Make sure the env var is not already set externally — let loadConfigEnv
		// populate it from the file.
		delete process.env.SPECFLOW_MAIN_AGENT;
		delete process.env.SPECFLOW_REVIEW_AGENT;
		const result = verifyLocalSubagentRuntime(dir);
		assert.equal(result.ok, false);
		if (!result.ok) {
			assert.ok(result.reason.includes("SPECFLOW_MAIN_AGENT"));
			assert.ok(result.reason.includes("bogus"));
		}
	} finally {
		restore(before);
		rmSync(dir, { recursive: true, force: true });
	}
});

test("verifyLocalSubagentRuntime: SPECFLOW_<AGENT> override path (absolute) is honored", () => {
	const before = snapshot();
	const dir = mkdtempSync(join(tmpdir(), "rt-check-"));
	try {
		const fakeCli = makeFakeCli(dir, "my-claude");
		mkdirSync(join(dir, ".specflow"));
		writeFileSync(join(dir, ".specflow/config.env"), "");
		delete process.env.SPECFLOW_MAIN_AGENT;
		delete process.env.SPECFLOW_REVIEW_AGENT;
		// PATH does NOT contain `claude`, but SPECFLOW_CLAUDE points at our stub.
		process.env.PATH = "/dev/null"; // unusable PATH
		process.env.SPECFLOW_CLAUDE = fakeCli;
		// Need codex too (review agent default). Put it via override.
		const codexCli = makeFakeCli(dir, "my-codex");
		process.env.SPECFLOW_CODEX = codexCli;
		// Add fake-cli dir to PATH so that codex resolution falls back via PATH
		// if ever needed; main check uses the override directly.
		process.env.PATH = `${dir}${delimiter}/dev/null`;
		const result = verifyLocalSubagentRuntime(dir);
		assert.equal(result.ok, true);
	} finally {
		restore(before);
		rmSync(dir, { recursive: true, force: true });
	}
});
