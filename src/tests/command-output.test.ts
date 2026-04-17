import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { contracts } from "../contracts/install.js";
import { resolveAllTemplates } from "../contracts/template-resolver.js";
import { fromRepo } from "../lib/paths.js";
import type { CommandContract } from "../types/contracts.js";

// Snapshots live alongside the source test file; resolve from repo root so the
// compiled test under dist/tests/ finds them too.
const SNAPSHOT_DIR = fromRepo("src/tests/__snapshots__");

function renderCommandToString(contract: CommandContract): string {
	const frontmatterEntries = {
		...contract.body.frontmatter,
		description: contract.description,
	};
	const frontmatterLines = Object.entries(frontmatterEntries).map(
		([key, value]) => `${key}: ${value}`,
	);
	const frontmatter = `---\n${frontmatterLines.join("\n")}\n---`;

	const body = contract.body.sections
		.map((section) => {
			if (section.title === null) {
				return section.content.trimEnd();
			}
			return `## ${section.title}\n\n${section.content.trimEnd()}`;
		})
		.join("\n\n")
		.trimEnd();

	let hookSection = "";
	if (contract.runHooks.length > 0) {
		const blocks = contract.runHooks.map((hook) => {
			return [
				`### ${hook.title}`,
				"",
				hook.description,
				"",
				"```bash",
				hook.shell,
				"```",
			].join("\n");
		});
		hookSection = `\n\n## Run State Hooks\n\n${blocks.join("\n\n")}\n`;
	}

	const parts = [frontmatter, "", body, hookSection.trimEnd()].filter(
		(part) => part.length > 0,
	);
	return `${parts.join("\n").trimEnd()}\n`;
}

const UPDATE_SNAPSHOTS = process.env.UPDATE_SNAPSHOTS === "1";

function snapshotPath(commandId: string): string {
	return join(SNAPSHOT_DIR, `${commandId}.md.snap`);
}

function assertSnapshot(commandId: string, actual: string): void {
	const snapPath = snapshotPath(commandId);

	if (UPDATE_SNAPSHOTS) {
		mkdirSync(dirname(snapPath), { recursive: true });
		writeFileSync(snapPath, actual, "utf8");
		return;
	}

	if (!existsSync(snapPath)) {
		throw new Error(
			`Snapshot not found for "${commandId}". Run with UPDATE_SNAPSHOTS=1 to create.`,
		);
	}

	const expected = readFileSync(snapPath, "utf8");
	assert.equal(
		actual,
		expected,
		`Snapshot mismatch for "${commandId}". Run with UPDATE_SNAPSHOTS=1 to update.`,
	);
}

// Resolve templates up front so snapshot comparison covers the full
// validate → resolve → render pipeline used by src/build.ts.
const resolvedCommands = resolveAllTemplates(contracts.commands);

// Generate one test per command
for (const command of resolvedCommands) {
	test(`snapshot: ${command.id}`, () => {
		const output = renderCommandToString(command);
		assertSnapshot(command.id, output);
	});
}

// Verify every command has a snapshot (coverage check)
test("all commands in commandBodies have snapshot tests", () => {
	const commandIds = resolvedCommands.map((c) => c.id);
	assert.ok(commandIds.length > 0, "Expected at least one command");
	// If snapshots exist, verify every command id is covered
	if (existsSync(SNAPSHOT_DIR)) {
		for (const id of commandIds) {
			assert.ok(
				existsSync(snapshotPath(id)),
				`Missing snapshot for command "${id}"`,
			);
		}
	}
});
