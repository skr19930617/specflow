import { readFileSync } from "node:fs";
import { fromRepo } from "../lib/paths.js";
import type { CommandContract, CommandSection } from "../types/contracts.js";
import { type InsertGenerator, insertRegistry } from "./inserts.js";
import {
	type PhaseContract,
	phaseContractRegistry,
	renderPhaseMarkdown,
} from "./phase-contract.js";

/**
 * Minimum-viable lookup surface the resolver needs from a phase registry.
 * Both `Map<string, PhaseContract>` (used in tests) and the production
 * `PhaseContractRegistry` interface satisfy this shape.
 */
export interface PhaseRegistryLookup {
	get(phase: string): PhaseContract | undefined;
}

export interface ResolvedSections {
	readonly sections: readonly CommandSection[];
}

/** Regex matching all three insertion tag kinds. */
const TAG_PATTERN = /\{\{(insert|contract|render):\s*([^}]+)\}\}/g;

/** Regex to detect nested tags in resolved content. */
const NESTED_TAG_PATTERN = /\{\{(insert|contract|render):\s*[^}]+\}\}/;

/**
 * Resolve a single insertion tag against the appropriate registry.
 */
function resolveTag(
	kind: string,
	ref: string,
	insertRegistry: ReadonlyMap<string, InsertGenerator>,
	phaseRegistry: PhaseRegistryLookup,
	templatePath: string,
): string {
	const trimmedRef = ref.trim();

	switch (kind) {
		case "insert": {
			// Parse key with optional argument: "name(arg)" or "name"
			const argMatch = trimmedRef.match(/^([^(]+)\(([^)]*)\)$/);
			const name = argMatch ? argMatch[1].trim() : trimmedRef;
			const arg = argMatch ? argMatch[2].trim() : undefined;
			const generator = insertRegistry.get(name);
			if (!generator) {
				throw new Error(
					`Template resolution error in "${templatePath}": unknown insert key "${name}" (from "{{insert: ${trimmedRef}}}")`,
				);
			}
			return generator(arg);
		}
		case "contract": {
			const contract = phaseRegistry.get(trimmedRef);
			if (!contract) {
				throw new Error(
					`Template resolution error in "${templatePath}": unknown phase "${trimmedRef}" (from "{{contract: ${trimmedRef}}}")`,
				);
			}
			return JSON.stringify(contract, null, 2);
		}
		case "render": {
			const contract = phaseRegistry.get(trimmedRef);
			if (!contract) {
				throw new Error(
					`Template resolution error in "${templatePath}": unknown phase "${trimmedRef}" (from "{{render: ${trimmedRef}}}")`,
				);
			}
			return renderPhaseMarkdown(contract);
		}
		default:
			throw new Error(
				`Template resolution error in "${templatePath}": unknown tag kind "${kind}"`,
			);
	}
}

/**
 * Split resolved Markdown content into CommandSection[] using ## headings.
 * Matches the structure expected by renderBody() in generators/commands.ts.
 */
function splitIntoSections(content: string): readonly CommandSection[] {
	const sections: CommandSection[] = [];
	const lines = content.split("\n");
	let currentTitle: string | null = null;
	let currentLines: string[] = [];

	for (const line of lines) {
		const headingMatch = line.match(/^## (.+)$/);
		if (headingMatch) {
			// Flush previous section
			if (currentTitle !== null || currentLines.length > 0) {
				sections.push({
					title: currentTitle,
					content: currentLines.join("\n"),
				});
			}
			currentTitle = headingMatch[1].trim();
			currentLines = [];
		} else {
			currentLines.push(line);
		}
	}

	// Flush final section
	if (currentTitle !== null || currentLines.length > 0) {
		sections.push({
			title: currentTitle,
			content: currentLines.join("\n"),
		});
	}

	return sections;
}

/**
 * Read and resolve a .md.tmpl template file.
 *
 * - Reads the template from disk.
 * - Replaces all {{insert:}}, {{contract:}}, and {{render:}} tags.
 * - Checks for nested tags in resolved content (hard error).
 * - Splits the result into CommandSection[].
 */
export function resolveTemplate(
	templatePath: string,
	insertRegistry: ReadonlyMap<string, InsertGenerator>,
	phaseRegistry: PhaseRegistryLookup,
): ResolvedSections {
	let content: string;
	try {
		content = readFileSync(templatePath, "utf8");
	} catch (err) {
		throw new Error(
			`Template resolution error: cannot read template file "${templatePath}": ${err instanceof Error ? err.message : String(err)}`,
		);
	}

	// Resolve all tags (depth 1 only)
	const resolved = content.replace(TAG_PATTERN, (_match, kind, ref) => {
		const replacement = resolveTag(
			kind as string,
			ref as string,
			insertRegistry,
			phaseRegistry,
			templatePath,
		);

		// Check for nested tags in resolved content
		if (NESTED_TAG_PATTERN.test(replacement)) {
			throw new Error(
				`Template resolution error in "${templatePath}": nested insertion tag detected in resolved content of "{{${kind}: ${(ref as string).trim()}}}"`,
			);
		}

		return replacement;
	});

	return { sections: splitIntoSections(resolved) };
}

/**
 * Resolve every command whose body declares a `templatePath`, producing new
 * `CommandContract` objects with `body.sections` populated from the template.
 * Commands without a `templatePath` are returned unchanged.
 *
 * The returned array is a fresh readonly array; existing contract objects are
 * not mutated.
 */
export function resolveAllTemplates(
	commands: readonly CommandContract[],
): readonly CommandContract[] {
	return commands.map((command) => {
		const templatePath = command.body.templatePath;
		if (templatePath === undefined) {
			return command;
		}
		const resolved = resolveTemplate(
			fromRepo(templatePath),
			insertRegistry,
			phaseContractRegistry,
		);
		return {
			...command,
			body: {
				...command.body,
				sections: resolved.sections,
			},
		};
	});
}
