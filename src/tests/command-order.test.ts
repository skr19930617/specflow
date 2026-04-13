import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function assertOrderedFragments(content: string, fragments: readonly string[]) {
	let cursor = -1;
	for (const fragment of fragments) {
		const next = content.indexOf(fragment, cursor + 1);
		assert.notEqual(next, -1, `Missing fragment: ${fragment}`);
		cursor = next;
	}
}

test("generated /specflow command preserves detailed proposal step order", () => {
	const content = readFileSync(
		"dist/package/global/commands/specflow.md",
		"utf8",
	);
	assertOrderedFragments(content, [
		"## Step 1: Setup",
		"## Step 2: Fetch Issue",
		"## Step 3: Proposal Creation",
		"specflow-prepare-change [<CHANGE_ID>] <RAW_INPUT>",
		"writes `openspec/changes/<CHANGE_ID>/proposal.md`",
		'specflow-run start "<CHANGE_ID>"',
		'specflow-run advance "<RUN_ID>" propose',
		"## Step 4: Scope Check",
		'specflow-run advance "<RUN_ID>" check_scope',
		"## Step 5: Clarify",
		"## Step 6: Proposal Challenge + Reclarify",
		"specflow-challenge-proposal challenge <CHANGE_ID>",
		"## Step 7: Spec Delta Draft",
		'openspec instructions specs --change "<CHANGE_ID>" --json',
		"Capabilities",
		"## Step 8: Spec Validate",
		'specflow-run advance "<RUN_ID>" validate_spec',
		'openspec validate "<CHANGE_ID>" --type change --json',
		'specflow-run advance "<RUN_ID>" spec_validated',
		"## Step 9: Design Handoff",
	]);
	assert.equal(content.includes("このまま続行"), false);
});

test("generated /specflow.design command starts from spec_ready and enters review directly", () => {
	const content = readFileSync(
		"dist/package/global/commands/specflow.design.md",
		"utf8",
	);
	assertOrderedFragments(content, [
		"spec_ready",
		"## Step 4: Design Review Gate",
		'specflow-run advance "<RUN_ID>" review_design',
		'specflow-run advance "<RUN_ID>" design_review_approved',
	]);
	assert.equal(
		content.includes('openspec validate "<CHANGE_ID>" --type change --json'),
		false,
	);
	assert.equal(content.includes("このまま続行"), false);
});

test("generated /specflow.apply command gates approve behind apply_ready", () => {
	const content = readFileSync(
		"dist/package/global/commands/specflow.apply.md",
		"utf8",
	);
	assertOrderedFragments(content, [
		"design_ready",
		"## Step 1: Apply Draft and Implement",
		"## Step 2: Apply Review Gate",
		'specflow-run advance "<RUN_ID>" review_apply',
		'specflow-run advance "<RUN_ID>" apply_review_approved',
		"Only from `apply_ready`, offer `/specflow.approve`.",
	]);
});

test("generated /specflow.approve command keeps archive before commit and conditional issue closing", () => {
	const content = readFileSync(
		"dist/package/global/commands/specflow.approve.md",
		"utf8",
	);
	assertOrderedFragments(content, [
		"git diff HEAD --name-only",
		"git diff HEAD --stat",
		"## Archive",
		'openspec archive -y "<CHANGE_ID>"',
		"## Commit",
		"## Push & Pull Request",
		'specflow-run update-field "<RUN_ID>" last_summary_path "$FINAL_SUMMARY_PATH"',
		'specflow-run advance "<RUN_ID>" accept_apply',
	]);
	assert.equal(content.includes("git diff main...HEAD"), false);
	assert.ok(content.includes("issue-linked run の場合"));
	assert.ok(content.includes("inline-spec run で issue metadata が無い場合"));
	assert.ok(content.includes("Closes <issue-url>"));
});

test("generated /specflow.review_apply command continues with --skip-diff-check only", () => {
	const content = readFileSync(
		"dist/package/global/commands/specflow.review_apply.md",
		"utf8",
	);
	assert.ok(
		content.includes(
			"specflow-review-apply review <CHANGE_ID> --skip-diff-check",
		),
	);
	assert.equal(content.includes("--force"), false);
	assert.equal(content.includes("--no-diff-warning"), false);
});
