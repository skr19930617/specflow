import {
	PLANNING_HEADING_DESCRIPTIONS,
	PLANNING_HEADINGS,
} from "../lib/design-planning-headings.js";
import {
	type PhaseContract,
	phaseContractRegistry,
	renderPhaseMarkdown,
} from "./phase-contract.js";
import { buildOpenspecPrereq } from "./prerequisites.js";

/**
 * Render structured PhaseContract metadata as a Markdown block for a phase.
 * Returns empty string if the phase has no contract or no renderable metadata.
 */
export function renderPhaseSection(phase: string): string {
	const contract: PhaseContract | undefined = phaseContractRegistry.get(phase);
	if (!contract) return "";
	return renderPhaseMarkdown(contract);
}

/**
 * Build the design artifact special-handling instruction block.
 */
export function buildDesignArtifactInstruction(): string {
	const headingList = PLANNING_HEADINGS.map(
		(heading) =>
			`   - ${heading} — ${PLANNING_HEADING_DESCRIPTIONS[heading].toLowerCase()}`,
	).join("\n");
	return [
		"**Special handling for `design` artifact:**",
		'   When `ARTIFACT_JSON.artifactId` is `"design"`, the generated `design.md` MUST include the following 7 mandatory planning sections as `##` headings, in addition to the sections described in `ARTIFACT_JSON.instruction`:',
		headingList,
		'   Each section MUST have non-empty content. Use "N/A" with a brief justification for sections that do not apply.',
	].join("\n");
}

/**
 * Parse an insert key that may contain arguments.
 * E.g., "openspec_prereq(specflow.apply)" → { name: "openspec_prereq", arg: "specflow.apply" }
 * E.g., "important_rules.common" → { name: "important_rules.common", arg: undefined }
 */
function parseInsertKey(key: string): {
	readonly name: string;
	readonly arg: string | undefined;
} {
	const match = key.match(/^([^(]+)\(([^)]*)\)$/);
	if (match) {
		return { name: match[1].trim(), arg: match[2].trim() };
	}
	return { name: key.trim(), arg: undefined };
}

/** Insert generator function type. */
export type InsertGenerator = (arg?: string) => string;

/**
 * Registry of insert generators keyed by name.
 * Used by the template resolver to resolve {{insert: <key>}} tags.
 */
const registry = new Map<string, InsertGenerator>();

registry.set("openspec_prereq", (arg?: string) => {
	if (!arg) throw new Error("openspec_prereq requires a command name argument");
	return buildOpenspecPrereq(arg);
});

registry.set("design_artifact_instruction", () =>
	buildDesignArtifactInstruction(),
);

registry.set("render_phase_section", (arg?: string) => {
	if (!arg)
		throw new Error("render_phase_section requires a phase name argument");
	return renderPhaseSection(arg);
});

export const insertRegistry: ReadonlyMap<string, InsertGenerator> = registry;

/**
 * Resolve an insert key (with optional arguments) against the registry.
 * Throws if the key is not found.
 */
export function resolveInsert(rawKey: string): string {
	const { name, arg } = parseInsertKey(rawKey);
	const generator = insertRegistry.get(name);
	if (!generator) {
		throw new Error(`Unknown insert key: "${name}" (from "${rawKey}")`);
	}
	return generator(arg);
}
