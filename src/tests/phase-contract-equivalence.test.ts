import assert from "node:assert/strict";
import test from "node:test";
import { renderPhaseSection } from "../contracts/inserts.js";
import { contracts } from "../contracts/install.js";
import { phaseContractRegistry } from "../contracts/phase-contract.js";
import { resolveAllTemplates } from "../contracts/template-resolver.js";

const resolvedCommands = resolveAllTemplates(contracts.commands);

// ---------------------------------------------------------------------------
// Semantic equivalence: PhaseContract CLI commands appear in command-bodies
// ---------------------------------------------------------------------------

/**
 * For each phase that has CLI commands in its PhaseContract, verify that
 * those commands also appear somewhere in the command-bodies Markdown.
 * This catches drift between the structured contract and the prose guide.
 */
test("PhaseContract CLI commands appear in command-bodies Markdown", () => {
	// Collect all Markdown content from resolved command bodies
	const allMarkdown = resolvedCommands
		.flatMap((c) => c.body.sections.map((s) => s.content))
		.join("\n");

	const driftErrors: string[] = [];

	for (const phase of phaseContractRegistry.phases()) {
		const contract = phaseContractRegistry.get(phase);
		if (!contract) continue;

		for (const step of contract.cliCommands) {
			// Normalize: strip template variables for flexible matching
			const normalized = step.command
				.replace(/<CHANGE_ID>/g, "")
				.replace(/<RUN_ID>/g, "")
				.replace(/<BUNDLE_ID>/g, "")
				.replace(/<NEW_STATUS>/g, "")
				.replace(/"/g, "")
				.trim();

			// Extract the core command (first word or first two words)
			const coreCommand = normalized.split(/\s+/).slice(0, 1).join(" ");

			if (coreCommand && !allMarkdown.includes(coreCommand)) {
				driftErrors.push(
					`Phase "${phase}": CLI command "${step.command}" core "${coreCommand}" not found in command-bodies`,
				);
			}
		}
	}

	assert.equal(
		driftErrors.length,
		0,
		`CLI command drift detected:\n${driftErrors.join("\n")}`,
	);
});

/**
 * Verify that renderPhaseSection returns non-empty content for phases
 * that have execution metadata.
 */
test("renderPhaseSection returns content for phases with CLI commands", () => {
	const phasesWithCommands = [
		"proposal_draft",
		"spec_draft",
		"design_draft",
		"apply_draft",
	];

	for (const phase of phasesWithCommands) {
		const section = renderPhaseSection(phase);
		assert.ok(
			section.length > 0,
			`renderPhaseSection("${phase}") should return non-empty content`,
		);
		assert.ok(
			section.includes("```bash"),
			`renderPhaseSection("${phase}") should contain fenced code blocks`,
		);
	}
});

test("renderPhaseSection returns empty for terminal phases", () => {
	for (const phase of ["approved", "decomposed", "rejected"]) {
		assert.equal(
			renderPhaseSection(phase),
			"",
			`renderPhaseSection("${phase}") should be empty for terminal phase`,
		);
	}
});
