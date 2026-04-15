// Integration tests for advanceBundleStatus — the apply-phase caller around
// the pure updateBundleStatus function. These assert end-to-end that:
//  - A terminal bundle transition persists a consistent task-graph.json (bundle
//    status + every child task status match).
//  - tasks.md is re-rendered from the normalized graph (no unchecked boxes
//    under a done / skipped bundle header).
//  - The logger is called exactly once per TaskStatusCoercion with the
//    expected payload.
//  - The logger is NOT called on non-terminal transitions or when every child
//    already matched the target (no-op silence).
//  - Both writes use a write-to-temp + rename atomic pattern.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { ChangeArtifactType, changeRef } from "../lib/artifact-types.js";
import { atomicWriteText } from "../lib/fs.js";
import { createLocalFsChangeArtifactStore } from "../lib/local-fs-change-artifact-store.js";
import {
	type AdvanceBundleWriter,
	advanceBundleStatus,
} from "../lib/task-planner/advance.js";
import type { TaskStatusCoercion } from "../lib/task-planner/status.js";
import type { TaskGraph } from "../lib/task-planner/types.js";

const repoRoot = process.cwd();
const advanceBundleCliPath = resolve(
	repoRoot,
	"dist/bin/specflow-advance-bundle.js",
);

function initGitRepo(repoPath: string): void {
	spawnSync("git", ["init", "--quiet"], { cwd: repoPath, stdio: "ignore" });
	spawnSync("git", ["symbolic-ref", "HEAD", "refs/heads/main"], {
		cwd: repoPath,
		stdio: "ignore",
	});
	spawnSync("git", ["config", "user.email", "specflow@example.com"], {
		cwd: repoPath,
		stdio: "ignore",
	});
	spawnSync("git", ["config", "user.name", "Specflow Tests"], {
		cwd: repoPath,
		stdio: "ignore",
	});
}

function sampleGraph(): TaskGraph {
	return {
		version: "1.0",
		change_id: "test-change",
		generated_at: "2026-04-15T00:00:00Z",
		generated_from: "design.md",
		bundles: [
			{
				id: "implement-foo",
				title: "Implement Foo",
				goal: "Create the foo module",
				depends_on: [],
				inputs: [],
				outputs: ["src/foo.ts"],
				status: "in_progress",
				tasks: [
					{ id: "1", title: "Write foo types", status: "pending" },
					{ id: "2", title: "Implement foo", status: "pending" },
				],
				owner_capabilities: ["task-planner"],
			},
		],
	};
}

function captureWriter(): {
	readonly writer: AdvanceBundleWriter;
	readonly writes: ReadonlyArray<{
		readonly target: string;
		readonly content: string;
	}>;
} {
	const writes: Array<{ target: string; content: string }> = [];
	const writer: AdvanceBundleWriter = {
		writeTaskGraph(content) {
			writes.push({ target: "task-graph.json", content });
		},
		writeTasksMd(content) {
			writes.push({ target: "tasks.md", content });
		},
	};
	return { writer, writes };
}

test("advanceBundleStatus: terminal transition writes a consistent task-graph.json (bundle + children match)", () => {
	const { writer, writes } = captureWriter();
	const result = advanceBundleStatus({
		taskGraph: sampleGraph(),
		bundleId: "implement-foo",
		newStatus: "done",
		writer,
	});
	assert.equal(result.ok, true);
	const graphWrite = writes.find((w) => w.target === "task-graph.json");
	assert.ok(graphWrite, "task-graph.json was written");
	const persisted = JSON.parse(graphWrite.content) as TaskGraph;
	const bundle = persisted.bundles.find((b) => b.id === "implement-foo");
	assert.equal(bundle?.status, "done");
	for (const task of bundle?.tasks ?? []) {
		assert.equal(task.status, "done");
	}
});

test("advanceBundleStatus: terminal transition writes tasks.md whose checkboxes match bundle header", () => {
	const { writer, writes } = captureWriter();
	const result = advanceBundleStatus({
		taskGraph: sampleGraph(),
		bundleId: "implement-foo",
		newStatus: "done",
		writer,
	});
	assert.equal(result.ok, true);
	const tasksWrite = writes.find((w) => w.target === "tasks.md");
	assert.ok(tasksWrite, "tasks.md was written");
	assert.ok(tasksWrite.content.includes("## 1. Implement Foo ✓"));
	assert.ok(tasksWrite.content.includes("- [x] 1.1 Write foo types"));
	assert.ok(tasksWrite.content.includes("- [x] 1.2 Implement foo"));
	assert.ok(!tasksWrite.content.includes("- [ ] 1.1"));
	assert.ok(!tasksWrite.content.includes("- [ ] 1.2"));
});

test("advanceBundleStatus: emits exactly one audit log line per coercion entry", () => {
	const { writer } = captureWriter();
	const logs: TaskStatusCoercion[] = [];
	const result = advanceBundleStatus({
		taskGraph: sampleGraph(),
		bundleId: "implement-foo",
		newStatus: "done",
		writer,
		logger: (c) => logs.push(c),
	});
	assert.equal(result.ok, true);
	assert.equal(logs.length, 2);
	for (const log of logs) {
		assert.equal(log.bundleId, "implement-foo");
		assert.equal(log.from, "pending");
		assert.equal(log.to, "done");
	}
	assert.deepEqual(logs.map((l) => l.taskId).sort(), ["1", "2"]);
});

test("advanceBundleStatus: no audit log on non-terminal transitions", () => {
	const base = sampleGraph();
	const graph: TaskGraph = {
		...base,
		bundles: [{ ...base.bundles[0], status: "pending" }],
	};
	const { writer } = captureWriter();
	const logs: TaskStatusCoercion[] = [];
	const result = advanceBundleStatus({
		taskGraph: graph,
		bundleId: "implement-foo",
		newStatus: "in_progress",
		writer,
		logger: (c) => logs.push(c),
	});
	assert.equal(result.ok, true);
	assert.equal(logs.length, 0);
});

test("advanceBundleStatus: no audit log when every child already matched the target", () => {
	const base = sampleGraph();
	const graph: TaskGraph = {
		...base,
		bundles: [
			{
				...base.bundles[0],
				status: "in_progress",
				tasks: base.bundles[0].tasks.map((t) => ({ ...t, status: "done" })),
			},
		],
	};
	const { writer } = captureWriter();
	const logs: TaskStatusCoercion[] = [];
	const result = advanceBundleStatus({
		taskGraph: graph,
		bundleId: "implement-foo",
		newStatus: "done",
		writer,
		logger: (c) => logs.push(c),
	});
	assert.equal(result.ok, true);
	assert.equal(logs.length, 0);
});

test("advanceBundleStatus: atomic write pattern (write-to-temp + rename) is used for both artifacts", () => {
	// The production writer delegates to atomicWriteText, which writes to a
	// temp file then renames. This test drives atomicWriteText directly and
	// asserts the rename-atomic property by observing that no .tmp sidecar
	// lingers after the write completes and that the final content matches.
	const dir = mkdtempSync(join(tmpdir(), "advance-bundle-atomic-"));
	try {
		const graphPath = join(dir, "task-graph.json");
		const tasksPath = join(dir, "tasks.md");
		atomicWriteText(graphPath, '{"ok":true}');
		atomicWriteText(tasksPath, "# tasks\n");
		// Both final files exist with expected content.
		assert.equal(readFileSync(graphPath, "utf8"), '{"ok":true}');
		assert.equal(readFileSync(tasksPath, "utf8"), "# tasks\n");
		// No temp sidecar files remain under the directory.
		const entries = existsSync(dir) ? readdirSync(dir) : [];
		for (const entry of entries) {
			assert.ok(!entry.endsWith(".tmp"), `no lingering tmp file: ${entry}`);
		}
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
	// Also verify advanceBundleStatus uses a writer that can be backed by
	// atomicWriteText. The important contract is sequencing: writeTaskGraph
	// runs before writeTasksMd (so readers see the authoritative graph first).
	const calls: string[] = [];
	const writer: AdvanceBundleWriter = {
		writeTaskGraph() {
			calls.push("task-graph.json");
		},
		writeTasksMd() {
			calls.push("tasks.md");
		},
	};
	const result = advanceBundleStatus({
		taskGraph: sampleGraph(),
		bundleId: "implement-foo",
		newStatus: "done",
		writer,
	});
	assert.equal(result.ok, true);
	assert.deepEqual(calls, ["task-graph.json", "tasks.md"]);
});

test("advanceBundleStatus + LocalFsChangeArtifactStore: end-to-end CLI wiring leaves no .tmp sidecars", () => {
	// Directly exercises the production chain used by specflow-advance-bundle:
	// createLocalFsChangeArtifactStore → store.write → atomicWriteText. The
	// CLI wraps exactly this wiring, so the atomic-rename guarantee reaches
	// the produced artifacts. Asserts the change directory contains only the
	// final task-graph.json + tasks.md (no lingering .tmp files).
	const projectRoot = mkdtempSync(join(tmpdir(), "advance-bundle-e2e-"));
	const changeId = "test-change";
	const changeDir = join(projectRoot, "openspec/changes", changeId);
	try {
		mkdirSync(changeDir, { recursive: true });
		// Seed the input task-graph.json with a bundle in progress.
		const initial = sampleGraph();
		writeFileSync(
			join(changeDir, "task-graph.json"),
			`${JSON.stringify(initial, null, 2)}\n`,
			"utf8",
		);

		const store = createLocalFsChangeArtifactStore(projectRoot);
		const taskGraphRef = changeRef(changeId, ChangeArtifactType.TaskGraph);
		const tasksRef = changeRef(changeId, ChangeArtifactType.Tasks);
		const result = advanceBundleStatus({
			taskGraph: initial,
			bundleId: "implement-foo",
			newStatus: "done",
			writer: {
				writeTaskGraph(content) {
					store.write(taskGraphRef, content);
				},
				writeTasksMd(content) {
					store.write(tasksRef, content);
				},
			},
		});
		assert.equal(result.ok, true);

		// Final artifacts are present and consistent with the normalized graph.
		const persisted = JSON.parse(
			readFileSync(join(changeDir, "task-graph.json"), "utf8"),
		) as TaskGraph;
		const bundle = persisted.bundles.find((b) => b.id === "implement-foo");
		assert.equal(bundle?.status, "done");
		for (const task of bundle?.tasks ?? []) {
			assert.equal(task.status, "done");
		}
		const renderedTasks = readFileSync(join(changeDir, "tasks.md"), "utf8");
		assert.ok(renderedTasks.includes("## 1. Implement Foo ✓"));

		// No .tmp sidecars remain anywhere under the change directory — the
		// core atomic-rename guarantee the CLI relies on.
		const entries = readdirSync(changeDir);
		for (const entry of entries) {
			assert.ok(!entry.endsWith(".tmp"), `no lingering tmp file: ${entry}`);
		}
	} finally {
		rmSync(projectRoot, { recursive: true, force: true });
	}
});

// --- CLI spawn-based tests (specflow-advance-bundle binary) ---
//
// These tests spawn the compiled CLI directly against a tmpdir to cover the
// full production seam: argv parsing → git discovery → LocalFs store →
// atomicWriteText. They complement the in-process tests above by catching any
// regression in the CLI wiring that bypasses the programmatic API.

test("specflow-advance-bundle CLI: end-to-end run leaves no .tmp sidecars and emits success JSON", () => {
	if (!existsSync(advanceBundleCliPath)) {
		// Skip gracefully when the dist has not been built yet; other CLI
		// tests in the suite follow the same pattern.
		return;
	}
	const projectRoot = mkdtempSync(join(tmpdir(), "advance-bundle-cli-"));
	const changeId = "test-change";
	const changeDir = join(projectRoot, "openspec/changes", changeId);
	try {
		initGitRepo(projectRoot);
		mkdirSync(changeDir, { recursive: true });
		writeFileSync(
			join(changeDir, "task-graph.json"),
			`${JSON.stringify(sampleGraph(), null, 2)}\n`,
			"utf8",
		);

		const result = spawnSync(
			process.execPath,
			[advanceBundleCliPath, changeId, "implement-foo", "done"],
			{ cwd: projectRoot, encoding: "utf8" },
		);
		assert.equal(result.status, 0, `stderr: ${result.stderr}`);

		const payload = JSON.parse(result.stdout) as Record<string, unknown>;
		assert.equal(payload.status, "success");
		assert.equal(payload.change_id, changeId);
		assert.equal(payload.bundle_id, "implement-foo");
		assert.equal(payload.new_status, "done");
		assert.equal(payload.coercions, 2);

		// Persisted artifacts match the normalized graph.
		const persisted = JSON.parse(
			readFileSync(join(changeDir, "task-graph.json"), "utf8"),
		) as TaskGraph;
		const bundle = persisted.bundles.find((b) => b.id === "implement-foo");
		assert.equal(bundle?.status, "done");
		for (const task of bundle?.tasks ?? []) {
			assert.equal(task.status, "done");
		}
		assert.ok(
			readFileSync(join(changeDir, "tasks.md"), "utf8").includes(
				"## 1. Implement Foo ✓",
			),
		);

		// No .tmp sidecars remain after the CLI exits — confirms the full
		// CLI → store.write → atomicWriteText chain preserves atomicity.
		for (const entry of readdirSync(changeDir)) {
			assert.ok(!entry.endsWith(".tmp"), `no lingering tmp file: ${entry}`);
		}
	} finally {
		rmSync(projectRoot, { recursive: true, force: true });
	}
});

test("specflow-advance-bundle CLI: pre-orchestration errors emit advance-bundle-result JSON on stdout", () => {
	if (!existsSync(advanceBundleCliPath)) {
		return;
	}
	const projectRoot = mkdtempSync(join(tmpdir(), "advance-bundle-cli-err-"));
	try {
		initGitRepo(projectRoot);

		// Missing task-graph.json — a pre-orchestration error path. Programmatic
		// callers must still be able to JSON.parse(stdout).
		const missing = spawnSync(
			process.execPath,
			[advanceBundleCliPath, "nonexistent", "some-bundle", "done"],
			{ cwd: projectRoot, encoding: "utf8" },
		);
		assert.equal(missing.status, 1);
		const missingPayload = JSON.parse(missing.stdout) as Record<
			string,
			unknown
		>;
		assert.equal(missingPayload.status, "error");
		assert.equal(typeof missingPayload.error, "string");
		assert.ok(
			(missingPayload.error as string).includes("task-graph.json not found"),
		);

		// Invalid NEW_STATUS — also a pre-orchestration error path.
		const badStatus = spawnSync(
			process.execPath,
			[advanceBundleCliPath, "any", "any", "not-a-status"],
			{ cwd: projectRoot, encoding: "utf8" },
		);
		assert.equal(badStatus.status, 1);
		const badStatusPayload = JSON.parse(badStatus.stdout) as Record<
			string,
			unknown
		>;
		assert.equal(badStatusPayload.status, "error");
		assert.ok(
			(badStatusPayload.error as string).includes("Invalid NEW_STATUS"),
		);

		// Missing args — the earliest failure path.
		const missingArgs = spawnSync(process.execPath, [advanceBundleCliPath], {
			cwd: projectRoot,
			encoding: "utf8",
		});
		assert.equal(missingArgs.status, 1);
		const missingArgsPayload = JSON.parse(missingArgs.stdout) as Record<
			string,
			unknown
		>;
		assert.equal(missingArgsPayload.status, "error");
		assert.ok((missingArgsPayload.error as string).includes("Usage:"));
	} finally {
		rmSync(projectRoot, { recursive: true, force: true });
	}
});
