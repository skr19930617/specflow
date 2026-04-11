import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { contracts } from "../contracts/install.js";
import {
	mergeProjectGitignore,
	renderProjectGitignore,
} from "../lib/project-gitignore.js";
import type { InstallPlan, Manifest } from "../types/contracts.js";

test("generated manifest and install plan reflect contracts", () => {
	const manifest = JSON.parse(
		readFileSync("dist/manifest.json", "utf8"),
	) as Manifest;
	const installPlan = JSON.parse(
		readFileSync("dist/install-plan.json", "utf8"),
	) as InstallPlan;

	assert.equal(manifest.commands.length, contracts.commands.length);
	assert.equal(manifest.prompts.length, contracts.prompts.length);
	assert.equal(manifest.orchestrators.length, contracts.orchestrators.length);
	assert.equal(manifest.workflows.length, 1);
	assert.equal(manifest.templates.length, contracts.templates.length);
	assert.equal(installPlan.links.length, contracts.installLinks.length);
	assert.equal(installPlan.copies.length, contracts.installCopies.length);
});

test("generated slash commands include run-state hook injections", () => {
	const specflow = readFileSync(
		"dist/package/global/commands/specflow.md",
		"utf8",
	);
	const apply = readFileSync(
		"dist/package/global/commands/specflow.apply.md",
		"utf8",
	);
	const explore = readFileSync(
		"dist/package/global/commands/specflow.explore.md",
		"utf8",
	);
	const spec = readFileSync(
		"dist/package/global/commands/specflow.spec.md",
		"utf8",
	);

	assert.ok(specflow.includes("## Run State Hooks"));
	assert.ok(specflow.includes("specflow-prepare-change"));
	assert.ok(
		specflow.includes(
			"specflow-prepare-change [<CHANGE_ID>] --source-file /tmp/specflow-proposal-source.json",
		),
	);
	assert.ok(apply.includes("accept_design"));
	assert.ok(explore.includes("--run-kind synthetic"));
	assert.ok(spec.includes("--run-kind synthetic"));
});

test("command contracts render without legacy command source paths", async () => {
	const { contracts } = await import("../contracts/install.js");
	for (const command of contracts.commands) {
		assert.ok(command.body.sections.length > 0);
		assert.equal(
			"legacySourcePath" in (command as unknown as Record<string, unknown>),
			false,
		);
	}
});

test("generated contracts no longer reference legacy asset paths", () => {
	const archivedTree = ["legacy", "v1", ""].join("/");
	const contractsJson = readFileSync("dist/contracts.json", "utf8");
	assert.equal(contractsJson.includes(archivedTree), false);
});

test("generated contracts and guides do not reference src-based installed assets", () => {
	const contractsJson = readFileSync("dist/contracts.json", "utf8");
	const specflow = readFileSync(
		"dist/package/global/commands/specflow.md",
		"utf8",
	);
	for (const content of [contractsJson, specflow]) {
		assert.equal(content.includes(".config/specflow/src"), false);
		assert.equal(content.includes("src/global/commands"), false);
		assert.equal(content.includes("src/global/prompts"), false);
		assert.equal(content.includes("src/global/workflow"), false);
	}
});

test("prompt templates render contract-driven output schemas", () => {
	const designPrompt = readFileSync(
		"dist/package/global/prompts/review_design_prompt.md",
		"utf8",
	);
	const applyRereviewPrompt = readFileSync(
		"dist/package/global/prompts/review_apply_rereview_prompt.md",
		"utf8",
	);

	assert.equal(designPrompt.includes("{{OUTPUT_SCHEMA}}"), false);
	assert.ok(
		designPrompt.includes(
			`"decision": "APPROVE" | "REQUEST_CHANGES" | "BLOCK"`,
		),
	);
	assert.ok(applyRereviewPrompt.includes(`"ledger_error": false`));
	assert.ok(applyRereviewPrompt.includes(`"resolved_previous_findings": [`));
});

test("build emits a dist package for installer assets", () => {
	assert.ok(existsSync("dist/lib/agent-context-template.js"));
	assert.ok(existsSync("dist/lib/profile-schema.js"));
	assert.ok(existsSync("dist/lib/claude-renderer.js"));
	assert.ok(existsSync("dist/package/global/claude-settings.json"));
	assert.ok(existsSync("dist/package/global/workflow/state-machine.json"));
	assert.ok(existsSync("dist/package/global/prompts/review_design_prompt.md"));
	assert.ok(existsSync("dist/package/global/commands/specflow.md"));
	assert.ok(existsSync("dist/package/template/.gitignore"));
	assert.ok(existsSync("dist/package/template/.mcp.json"));
	assert.ok(existsSync("dist/package/template/.specflow/config.env"));
	assert.ok(existsSync("dist/package/template/_gitignore"));
	assert.ok(existsSync("dist/package/template/_mcp.json"));
	assert.ok(existsSync("dist/package/template/_specflow/config.env"));
	assert.ok(existsSync("dist/package/template/CLAUDE.md"));
	assert.equal(existsSync("template"), false);
});

test("packaged CLAUDE.md template ships managed markers and an unmanaged notes section", () => {
	const templateClaude = readFileSync(
		"dist/package/template/CLAUDE.md",
		"utf8",
	);

	assert.ok(templateClaude.startsWith("<!-- specflow:managed:start -->"));
	assert.ok(templateClaude.includes("<!-- specflow:managed:end -->"));
	assert.ok(templateClaude.includes("## MANUAL ADDITIONS"));
});

test("repo .gitignore matches the shared specflow ignore layout", () => {
	const templateGitignore = readFileSync("assets/template/.gitignore", "utf8");
	assert.equal(
		readFileSync(".gitignore", "utf8"),
		renderProjectGitignore(templateGitignore, {
			claudeMode: "settings-only",
			includeNodeArtifacts: true,
		}),
	);
});

test("project gitignore render includes specflow runtime state", () => {
	const templateGitignore = readFileSync("assets/template/.gitignore", "utf8");
	assert.equal(
		renderProjectGitignore(templateGitignore, { claudeMode: "directory" }),
		[
			"# Claude Code - local settings",
			".claude/",
			"",
			"# MCP server config (local paths/tools)",
			"/.mcp.json",
			"",
			"# Specflow local env",
			".specflow/config.env",
			".specflow/runs/",
			"",
		].join("\n"),
	);
});

test("project gitignore merge preserves custom content while appending missing entries", () => {
	const templateGitignore = readFileSync("assets/template/.gitignore", "utf8");
	const merged = mergeProjectGitignore(
		["# Existing", "custom.log", "", ".specflow/config.env", ""].join("\n"),
		templateGitignore,
		{ claudeMode: "settings-only" },
	);

	assert.equal(merged.changed, true);
	assert.equal(
		merged.content,
		[
			"# Existing",
			"custom.log",
			"",
			".specflow/config.env",
			"",
			"# Claude Code - local settings",
			".claude/settings.json",
			".claude/settings.local.json",
			"",
			"# MCP server config (local paths/tools)",
			"/.mcp.json",
			"",
			"# Specflow local env",
			".specflow/runs/",
			"",
		].join("\n"),
	);
});

test("main branch no longer carries the in-tree legacy runtime", () => {
	const archivedTree = ["legacy", "v1"].join("/");
	const retiredWrapper = ["legacy", "wrapper.ts"].join("-");
	assert.equal(existsSync(archivedTree), false);
	assert.equal(existsSync(`src/bin/${retiredWrapper}`), false);
});
