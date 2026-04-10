import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { makeTempDir, removeTempDir, repoRoot } from "./test-helpers.js";

const releaseUrl =
	"https://github.com/skr19930617/specflow/releases/latest/download/specflow-node.tgz";

test("package metadata exposes release-install bins and packaged assets", () => {
	const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
		bin: Record<string, string>;
		files: string[];
		scripts: Record<string, string>;
	};

	assert.equal(pkg.scripts.postinstall, "node scripts/postinstall.mjs");
	assert.equal(pkg.bin["specflow-install"], "bin/specflow-install");
	assert.equal(pkg.bin["specflow-run"], "bin/specflow-run");
	assert.equal(
		pkg.bin["specflow-review-proposal"],
		"bin/specflow-review-proposal",
	);
	assert.ok(pkg.files.includes("bin"));
	assert.ok(pkg.files.includes("dist"));
	assert.ok(pkg.files.includes("scripts/postinstall.mjs"));
});

test("npm pack dry-run includes the runtime bundle needed by release installs", () => {
	const npmCache = makeTempDir("specflow-npm-cache-");
	try {
		const packed = JSON.parse(
			execFileSync("npm", ["pack", "--json", "--dry-run"], {
				cwd: repoRoot,
				encoding: "utf8",
				env: {
					...process.env,
					npm_config_cache: npmCache,
				},
			}),
		) as Array<{ files: Array<{ path: string }> }>;
		const paths = new Set(packed[0]?.files.map((file) => file.path) ?? []);

		assert.ok(paths.has("bin/specflow-install"));
		assert.ok(paths.has("bin/.launcher.mjs"));
		assert.ok(paths.has("dist/bin/specflow-install.js"));
		assert.ok(paths.has("dist/bin/specflow-run.js"));
		assert.ok(paths.has("dist/package/global/workflow/state-machine.json"));
		assert.ok(paths.has("dist/package/global/commands/specflow.md"));
		assert.ok(paths.has("scripts/postinstall.mjs"));
	} finally {
		removeTempDir(npmCache);
	}
});

test("release workflow and bootstrap target the stable latest tarball url", () => {
	const workflow = readFileSync(".github/workflows/release.yml", "utf8");
	const installer = readFileSync("install.sh", "utf8");
	const readme = readFileSync("README.md", "utf8");

	assert.ok(workflow.includes("workflow_run:"));
	assert.ok(workflow.includes("workflows:"));
	assert.ok(workflow.includes("specflow-node.tgz"));
	assert.ok(workflow.includes("make_latest: true"));
	assert.ok(installer.includes(releaseUrl));
	assert.ok(installer.includes('npm install -g --force "$RELEASE_URL"'));
	assert.equal(installer.includes("git clone"), false);
	assert.equal(installer.includes("npm --prefix"), false);
	assert.ok(readme.includes(releaseUrl));
});
