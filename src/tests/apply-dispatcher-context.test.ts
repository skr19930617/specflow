import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	resolveCapability,
	UnsafeCapabilityNameError,
} from "../lib/apply-dispatcher/capability-resolution.js";
import {
	assembleContextPackage,
	MissingCapabilityError,
	preflightWindow,
	UnsafePathError,
} from "../lib/apply-dispatcher/context-package.js";
import type { Bundle, TaskGraph } from "../lib/task-planner/types.js";

function mkBundle(overrides: Partial<Bundle> & { id: string }): Bundle {
	return {
		id: overrides.id,
		title: overrides.title ?? overrides.id,
		goal: overrides.goal ?? "",
		depends_on: overrides.depends_on ?? [],
		inputs: overrides.inputs ?? [],
		outputs: overrides.outputs ?? [],
		status: overrides.status ?? "pending",
		tasks: overrides.tasks ?? [],
		owner_capabilities: overrides.owner_capabilities ?? [],
		...(overrides.size_score !== undefined
			? { size_score: overrides.size_score }
			: {}),
	};
}

function setupFixture(
	capabilityFiles: ReadonlyArray<{
		capability: string;
		baseline?: string;
		delta?: string;
	}>,
	extras: {
		proposal?: string;
		design?: string;
		tasksMd?: string;
		inputs?: Record<string, string>;
	} = {},
) {
	const root = mkdtempSync(join(tmpdir(), "dispatcher-ctx-"));
	const changeId = "ctx-test";
	const changeDir = join(root, "openspec/changes", changeId);
	mkdirSync(changeDir, { recursive: true });
	mkdirSync(join(root, "openspec/specs"), { recursive: true });
	if (extras.proposal !== undefined) {
		writeFileSync(join(changeDir, "proposal.md"), extras.proposal, "utf8");
	}
	if (extras.design !== undefined) {
		writeFileSync(join(changeDir, "design.md"), extras.design, "utf8");
	}
	if (extras.tasksMd !== undefined) {
		writeFileSync(join(changeDir, "tasks.md"), extras.tasksMd, "utf8");
	}
	for (const cap of capabilityFiles) {
		if (cap.baseline !== undefined) {
			mkdirSync(join(root, "openspec/specs", cap.capability), {
				recursive: true,
			});
			writeFileSync(
				join(root, "openspec/specs", cap.capability, "spec.md"),
				cap.baseline,
				"utf8",
			);
		}
		if (cap.delta !== undefined) {
			mkdirSync(join(changeDir, "specs", cap.capability), { recursive: true });
			writeFileSync(
				join(changeDir, "specs", cap.capability, "spec.md"),
				cap.delta,
				"utf8",
			);
		}
	}
	for (const [path, content] of Object.entries(extras.inputs ?? {})) {
		const abs = join(root, path);
		mkdirSync(join(abs, ".."), { recursive: true });
		writeFileSync(abs, content, "utf8");
	}
	return { root, changeId };
}

// --- resolveCapability ---

test("resolveCapability: returns ok with both baseline and delta when both exist", () => {
	const { root, changeId } = setupFixture([
		{ capability: "foo", baseline: "base", delta: "del" },
	]);
	try {
		const res = resolveCapability("foo", changeId, root);
		assert.equal(res.kind, "ok");
		if (res.kind === "ok") {
			assert.equal(res.specs.baseline, "base");
			assert.equal(res.specs.delta, "del");
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("resolveCapability: returns ok with baseline only", () => {
	const { root, changeId } = setupFixture([
		{ capability: "foo", baseline: "base" },
	]);
	try {
		const res = resolveCapability("foo", changeId, root);
		assert.equal(res.kind, "ok");
		if (res.kind === "ok") {
			assert.equal(res.specs.baseline, "base");
			assert.equal(res.specs.delta, undefined);
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("resolveCapability: returns ok with delta only (new capability)", () => {
	const { root, changeId } = setupFixture([
		{ capability: "foo", delta: "del" },
	]);
	try {
		const res = resolveCapability("foo", changeId, root);
		assert.equal(res.kind, "ok");
		if (res.kind === "ok") {
			assert.equal(res.specs.baseline, undefined);
			assert.equal(res.specs.delta, "del");
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("resolveCapability: returns missing when neither exists", () => {
	const { root, changeId } = setupFixture([]);
	try {
		const res = resolveCapability("foo", changeId, root);
		assert.equal(res.kind, "missing");
		if (res.kind === "missing") {
			assert.equal(res.capability, "foo");
			assert.ok(res.baselinePath.endsWith("openspec/specs/foo/spec.md"));
			assert.ok(
				res.deltaPath.endsWith(
					`openspec/changes/${changeId}/specs/foo/spec.md`,
				),
			);
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

// --- preflightWindow ---

test("preflightWindow: all-valid window passes silently", () => {
	const { root, changeId } = setupFixture([
		{ capability: "a", baseline: "a-base" },
		{ capability: "b", delta: "b-del" },
	]);
	try {
		const window = [
			mkBundle({ id: "b1", owner_capabilities: ["a"] }),
			mkBundle({ id: "b2", owner_capabilities: ["a", "b"] }),
		];
		// Should not throw.
		preflightWindow(window, changeId, root);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("preflightWindow: throws on first missing capability with bundle id and cap name", () => {
	const { root, changeId } = setupFixture([
		{ capability: "a", baseline: "a-base" },
		// `missing-cap` is intentionally absent.
	]);
	try {
		const window = [
			mkBundle({ id: "b1", owner_capabilities: ["a"] }),
			mkBundle({ id: "b2", owner_capabilities: ["missing-cap"] }),
		];
		assert.throws(
			() => preflightWindow(window, changeId, root),
			(err: Error) => {
				assert.ok(err instanceof MissingCapabilityError);
				if (err instanceof MissingCapabilityError) {
					assert.equal(err.bundleId, "b2");
					assert.equal(err.capability, "missing-cap");
				}
				return true;
			},
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

// --- assembleContextPackage ---

function makeGraph(bundles: readonly Bundle[]): TaskGraph {
	return {
		version: "1.0",
		change_id: "ctx-test",
		generated_at: "2026-04-20T00:00:00Z",
		generated_from: "design.md",
		bundles,
	};
}

test("assembleContextPackage: packages all six categories for a bundle", () => {
	const tasksMd = `## 1. Bundle One

> First goal

- [ ] 1.1 Do thing one
- [ ] 1.2 Do thing two

## 2. Bundle Two

> Second goal

- [ ] 2.1 Do thing three
`;
	const { root, changeId } = setupFixture(
		[{ capability: "alpha", baseline: "ALPHA-BASE", delta: "ALPHA-DELTA" }],
		{
			proposal: "# proposal content",
			design: "# design content",
			tasksMd,
			inputs: { "src/some-input.ts": "// input body" },
		},
	);
	try {
		const b1 = mkBundle({
			id: "bundle-one",
			title: "Bundle One",
			goal: "First goal",
			owner_capabilities: ["alpha"],
			inputs: ["src/some-input.ts"],
		});
		const b2 = mkBundle({
			id: "bundle-two",
			title: "Bundle Two",
			goal: "Second goal",
		});
		const graph = makeGraph([b1, b2]);

		const pkg = assembleContextPackage(b1, changeId, graph, root);

		assert.equal(pkg.bundleId, "bundle-one");
		assert.equal(pkg.proposal, "# proposal content");
		assert.equal(pkg.design, "# design content");
		assert.equal(pkg.specs.length, 1);
		assert.equal(pkg.specs[0]?.capability, "alpha");
		assert.equal(pkg.specs[0]?.baseline, "ALPHA-BASE");
		assert.equal(pkg.specs[0]?.delta, "ALPHA-DELTA");
		assert.equal(pkg.bundleSlice.bundle.id, "bundle-one");
		assert.ok(pkg.tasksSection.startsWith("## 1. Bundle One"));
		assert.ok(pkg.tasksSection.includes("1.1 Do thing one"));
		assert.ok(!pkg.tasksSection.includes("## 2. Bundle Two"));
		assert.equal(pkg.inputs.length, 1);
		assert.equal(pkg.inputs[0]?.path, "src/some-input.ts");
		assert.equal(pkg.inputs[0]?.content, "// input body");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("assembleContextPackage: dependency_outputs carry upstream bundle outputs", () => {
	const { root, changeId } = setupFixture(
		[{ capability: "alpha", baseline: "ALPHA" }],
		{ proposal: "P", design: "D", tasksMd: "## 1. A\n## 2. B\n" },
	);
	try {
		const upstream = mkBundle({
			id: "upstream",
			outputs: ["src/up.ts", "src/up2.ts"],
		});
		const downstream = mkBundle({
			id: "downstream",
			depends_on: ["upstream"],
			owner_capabilities: ["alpha"],
		});
		const graph = makeGraph([upstream, downstream]);
		const pkg = assembleContextPackage(downstream, changeId, graph, root);
		assert.equal(pkg.bundleSlice.dependency_outputs.length, 1);
		assert.equal(pkg.bundleSlice.dependency_outputs[0]?.bundleId, "upstream");
		assert.deepEqual(pkg.bundleSlice.dependency_outputs[0]?.outputs, [
			"src/up.ts",
			"src/up2.ts",
		]);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("assembleContextPackage: missing input file is reported as empty content (not throw)", () => {
	const { root, changeId } = setupFixture(
		[{ capability: "alpha", baseline: "ALPHA" }],
		{ proposal: "", design: "", tasksMd: "" },
	);
	try {
		const bundle = mkBundle({
			id: "b",
			owner_capabilities: ["alpha"],
			inputs: ["src/does-not-exist.ts"],
		});
		const graph = makeGraph([bundle]);
		const pkg = assembleContextPackage(bundle, changeId, graph, root);
		assert.equal(pkg.inputs[0]?.path, "src/does-not-exist.ts");
		assert.equal(pkg.inputs[0]?.content, "");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("assembleContextPackage: throws MissingCapabilityError if capability unresolvable (defence in depth)", () => {
	const { root, changeId } = setupFixture([], {
		proposal: "",
		design: "",
		tasksMd: "",
	});
	try {
		const bundle = mkBundle({ id: "b", owner_capabilities: ["nope"] });
		const graph = makeGraph([bundle]);
		assert.throws(
			() => assembleContextPackage(bundle, changeId, graph, root),
			MissingCapabilityError,
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

// --- R3-F05: path safety ---

test("assembleContextPackage: bundle input '../../etc/passwd' is rejected before any read", () => {
	const { root, changeId } = setupFixture(
		[{ capability: "alpha", baseline: "ALPHA" }],
		{ proposal: "", design: "", tasksMd: "" },
	);
	try {
		const bundle = mkBundle({
			id: "escape",
			owner_capabilities: ["alpha"],
			inputs: ["../../../etc/passwd"],
		});
		const graph = makeGraph([bundle]);
		assert.throws(
			() => assembleContextPackage(bundle, changeId, graph, root),
			UnsafePathError,
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("assembleContextPackage: absolute-path input that escapes repo is rejected", () => {
	const { root, changeId } = setupFixture(
		[{ capability: "alpha", baseline: "ALPHA" }],
		{ proposal: "", design: "", tasksMd: "" },
	);
	try {
		const bundle = mkBundle({
			id: "escape-abs",
			owner_capabilities: ["alpha"],
			// An absolute path outside repoRoot. resolve() ignores repoRoot when
			// given an absolute input, so this must still fail.
			inputs: ["/etc/passwd"],
		});
		const graph = makeGraph([bundle]);
		assert.throws(
			() => assembleContextPackage(bundle, changeId, graph, root),
			UnsafePathError,
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("resolveCapability: unsafe capability name containing path separators is rejected", () => {
	const { root, changeId } = setupFixture([], {});
	try {
		assert.throws(
			() => resolveCapability("../../etc", changeId, root),
			UnsafeCapabilityNameError,
		);
		assert.throws(
			() => resolveCapability("foo/bar", changeId, root),
			UnsafeCapabilityNameError,
		);
		assert.throws(
			() => resolveCapability("", changeId, root),
			UnsafeCapabilityNameError,
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

// --- R3-F05: preflightWindow validates input paths ---

test("preflightWindow: rejects bundle with path-traversal input before any capability check", () => {
	const { root, changeId } = setupFixture(
		[{ capability: "alpha", baseline: "ALPHA" }],
		{},
	);
	try {
		const window = [
			mkBundle({ id: "safe", owner_capabilities: ["alpha"] }),
			mkBundle({
				id: "hostile",
				owner_capabilities: ["alpha"],
				inputs: ["../../../etc/passwd"],
			}),
		];
		assert.throws(
			() => preflightWindow(window, changeId, root),
			(err: Error) => {
				assert.ok(err instanceof UnsafePathError);
				if (err instanceof UnsafePathError) {
					assert.equal(err.bundleId, "hostile");
					assert.equal(err.reference, "../../../etc/passwd");
				}
				return true;
			},
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("preflightWindow: rejects absolute-path input that escapes repo", () => {
	const { root, changeId } = setupFixture(
		[{ capability: "alpha", baseline: "ALPHA" }],
		{},
	);
	try {
		const window = [
			mkBundle({
				id: "escape-abs",
				owner_capabilities: ["alpha"],
				inputs: ["/etc/passwd"],
			}),
		];
		assert.throws(
			() => preflightWindow(window, changeId, root),
			UnsafePathError,
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("preflightWindow: accepts safe repo-relative input paths", () => {
	const { root, changeId } = setupFixture(
		[{ capability: "alpha", baseline: "ALPHA" }],
		{ inputs: { "src/safe-file.ts": "// ok" } },
	);
	try {
		const window = [
			mkBundle({
				id: "ok",
				owner_capabilities: ["alpha"],
				inputs: ["src/safe-file.ts"],
			}),
		];
		// Should not throw.
		preflightWindow(window, changeId, root);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("resolveCapability: safe capability names with dashes, dots, underscores are accepted", () => {
	const { root, changeId } = setupFixture([
		{ capability: "my.cap_1-name", baseline: "X" },
	]);
	try {
		const res = resolveCapability("my.cap_1-name", changeId, root);
		assert.equal(res.kind, "ok");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
