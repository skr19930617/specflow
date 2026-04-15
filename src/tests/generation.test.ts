import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { commandBodies } from "../contracts/command-bodies.js";
import { contracts } from "../contracts/install.js";
import {
	mergeProjectGitignore,
	renderProjectGitignore,
} from "../lib/project-gitignore.js";
import type { InstallPlan, Manifest } from "../types/contracts.js";

/**
 * Flatten all section contents of a commandBodies entry into a single string.
 * Used by source-level assertions that must stay independent of dist freshness.
 */
function commandBodyText(key: string): string {
	const body = commandBodies[key];
	assert.ok(body, `commandBodies['${key}'] is missing`);
	return body.sections.map((section) => section.content).join("\n");
}

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
		specflow.includes("specflow-prepare-change [<CHANGE_ID>] <RAW_INPUT>"),
	);
	assert.ok(
		!specflow.includes("/tmp/specflow-proposal-source.json"),
		"generated specflow.md should not reference /tmp/specflow-proposal-source.json",
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
	assert.ok(existsSync("dist/package/template/.specflow/config.env"));
	assert.ok(existsSync("dist/package/template/_gitignore"));
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

test("specflow.apply command body source encodes the specflow-advance-bundle contract", () => {
	// Source-level assertions against `src/contracts/command-bodies.ts`. These
	// are independent of the build pipeline and protect against cases where
	// `dist/` is stale or absent (e.g., a clean checkout or test runner that
	// skips the build step).
	const apply = commandBodyText("specflow.apply");

	assert.ok(
		apply.includes("Pre-apply path detection"),
		"command body should introduce the three-way path detection",
	);
	assert.ok(
		apply.includes("legacy fallback"),
		"command body should name the legacy fallback path",
	);
	assert.ok(
		apply.includes("CLI-mandatory path"),
		"command body should name the CLI-mandatory path",
	);
	assert.ok(
		apply.includes(
			"specflow-advance-bundle <CHANGE_ID> <BUNDLE_ID> <NEW_STATUS>",
		),
		"command body should contain the literal CLI invocation with placeholders",
	);
	for (const transition of [
		"pending → in_progress",
		"in_progress → done",
		"pending → skipped",
		"pending → done",
	]) {
		assert.ok(
			apply.includes(transition),
			`command body should enumerate the transition: ${transition}`,
		);
	}
	assert.ok(
		apply.includes("Fail-fast on CLI error"),
		"command body should document fail-fast behavior on CLI error",
	);
	assert.ok(
		apply.includes("contract violation per `task-planner`"),
		"command body should link the prohibition to the task-planner contract",
	);
});

test("specflow.fix_apply command body source carries the specflow-advance-bundle safety-net", () => {
	// Source-level assertion — independent of the build pipeline.
	const fixApply = commandBodyText("specflow.fix_apply");
	assert.ok(
		fixApply.includes("specflow-advance-bundle"),
		"command body Important Rules should reference specflow-advance-bundle",
	);
	assert.ok(
		fixApply.includes("contract violation per `task-planner`"),
		"command body Important Rules should classify inline edits as a contract violation",
	);
});

test("generated specflow.apply.md encodes the specflow-advance-bundle contract", () => {
	// Defensive guard: this test depends on a fresh `npm run build` having
	// produced the dist file. Fail fast with a clear message if it is missing,
	// so a stale-build case surfaces loudly instead of silently passing against
	// outdated content. The companion source-level test above exercises the
	// same contract directly against `command-bodies.ts` as a belt-and-suspenders
	// guarantee that the contract is enforced regardless of dist state.
	const applyPath = "dist/package/global/commands/specflow.apply.md";
	assert.ok(
		existsSync(applyPath),
		`${applyPath} is missing; run \`npm run build\` before the test suite`,
	);
	const apply = readFileSync(applyPath, "utf8");

	// Positive: three-way detection rule documented.
	assert.ok(
		apply.includes("Pre-apply path detection"),
		"apply.md should introduce the three-way path detection",
	);
	assert.ok(
		apply.includes("legacy fallback"),
		"apply.md should name the legacy fallback path",
	);
	assert.ok(
		apply.includes("CLI-mandatory path"),
		"apply.md should name the CLI-mandatory path",
	);

	// Positive: CLI is named with its full positional signature.
	assert.ok(
		apply.includes(
			"specflow-advance-bundle <CHANGE_ID> <BUNDLE_ID> <NEW_STATUS>",
		),
		"apply.md should contain the literal CLI invocation with placeholders",
	);

	// Positive: all four logical transitions are enumerated.
	for (const transition of [
		"pending → in_progress",
		"in_progress → done",
		"pending → skipped",
		"pending → done",
	]) {
		assert.ok(
			apply.includes(transition),
			`apply.md should enumerate the transition: ${transition}`,
		);
	}

	// Positive: fail-fast language.
	assert.ok(
		apply.includes("Fail-fast on CLI error"),
		"apply.md should document fail-fast behavior on CLI error",
	);
	assert.ok(
		apply.includes("remain in `apply_draft`"),
		"apply.md should state the run stays in apply_draft on CLI error",
	);

	// Positive: prohibition of inline mutation, linked to task-planner contract.
	assert.ok(
		apply.includes("Inline `node -e"),
		"apply.md should explicitly prohibit inline node -e scripts",
	);
	assert.ok(
		apply.includes("contract violation per `task-planner`"),
		"apply.md should link the prohibition to the task-planner contract",
	);

	// Negative: no embedded example inline mutation snippet.
	for (const forbidden of [
		"bundle.status =",
		"fs.writeFileSync",
		"fs.readFileSync",
		"tasks[*].status =",
	]) {
		assert.ok(
			!apply.includes(forbidden),
			`apply.md must not contain an inline mutation snippet: ${forbidden}`,
		);
	}

	// Negative: no jq expression that rewrites a status field.
	assert.ok(
		!/\bjq\s+['"][^'"]*\.status/.test(apply),
		"apply.md must not contain a jq expression that rewrites a status field",
	);
});

test("generated specflow.fix_apply.md carries the specflow-advance-bundle safety-net", () => {
	const fixApplyPath = "dist/package/global/commands/specflow.fix_apply.md";
	assert.ok(
		existsSync(fixApplyPath),
		`${fixApplyPath} is missing; run \`npm run build\` before the test suite`,
	);
	const fixApply = readFileSync(fixApplyPath, "utf8");
	assert.ok(
		fixApply.includes("specflow-advance-bundle"),
		"fix_apply.md Important Rules should reference specflow-advance-bundle",
	);
	assert.ok(
		fixApply.includes("contract violation per `task-planner`"),
		"fix_apply.md Important Rules should classify inline edits as a contract violation",
	);
});

test("review_apply body encodes severity-aware state mapping and approve-last option", () => {
	const body = commandBodyText("specflow.review_apply");
	// The State-to-Option Mapping gate conditions must be severity-aware, not
	// actionable_count-based.
	assert.ok(
		body.includes("HIGH+ unresolved ≥ 1 after review"),
		"review_apply should gate review_with_findings on HIGH+ unresolved",
	);
	assert.ok(
		body.includes("HIGH+ unresolved == 0 after review"),
		"review_apply should gate review_no_findings on HIGH+ unresolved",
	);
	// Approve must be listed as a last-position non-primary option in
	// _with_findings states and carry the severity_summary suffix.
	assert.ok(
		body.includes('"Approve (accepted risk)" → `/specflow.approve` *(last)*'),
		"review_apply _with_findings states should place Approve last",
	);
	assert.ok(
		body.includes("accepted_risk 運用を確認してください"),
		"review_apply must carry the accepted-risk confirmation warning",
	);
	// _no_findings messaging must clarify that HIGH+ resolved, LOW/MEDIUM may remain.
	assert.ok(
		body.includes("all HIGH+ findings resolved (LOW/MEDIUM may remain"),
		"review_apply _no_findings header should reference HIGH+ semantics",
	);
});

test("review_design body mirrors severity-aware mapping with apply-last option", () => {
	const body = commandBodyText("specflow.review_design");
	assert.ok(
		body.includes("HIGH+ unresolved ≥ 1 after review"),
		"review_design should gate review_with_findings on HIGH+ unresolved",
	);
	assert.ok(
		body.includes('"実装に進む (accepted risk)" → `/specflow.apply` *(last)*'),
		"review_design _with_findings states should place apply last",
	);
	assert.ok(
		body.includes("accepted_risk 運用を確認してください"),
		"review_design must carry the accepted-risk confirmation warning",
	);
	assert.ok(
		body.includes("all HIGH+ findings resolved (LOW/MEDIUM may remain"),
		"review_design _no_findings header should reference HIGH+ semantics",
	);
});

test("approve body Quality Gate describes critical+high threshold", () => {
	const body = commandBodyText("specflow.approve");
	assert.ok(
		body.includes("`severity ∈ {critical, high}`"),
		"approve Quality Gate should describe critical+high threshold explicitly",
	);
	assert.ok(
		body.includes("未解決の critical/high finding"),
		"approve Quality Gate WARNING copy should mention critical/high",
	);
	assert.ok(
		body.includes(
			"LOW / MEDIUM のみが残っている場合は `has_open_high` にはならない",
		),
		"approve Quality Gate should clarify LOW/MEDIUM do not trigger has_open_high",
	);
});
