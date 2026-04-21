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

export interface TemplateLintError {
	readonly filePath: string;
	readonly line: number;
	readonly token: string;
	readonly message: string;
}

/**
 * Scan `.md.tmpl` files for forbidden positional-arg placeholders inside
 * fenced `bash`/`sh` code blocks.
 *
 * Motivation: Claude Code's slash-command renderer substitutes `$1`, `$2`,
 * ..., `$9`, and `$ARGUMENTS` at invocation time. Any inline shell helper
 * that references these placeholders will be silently corrupted (they
 * collapse to empty strings when the command is invoked without positional
 * args). This lint rejects such patterns at build time so authors cannot
 * reintroduce the class of bug that caused the TUI auto-launch failure
 * tracked in issue #180.
 *
 * Rules:
 *   • Only fenced blocks whose language tag is `bash` or `sh` are scanned.
 *   • Matches are literal — regex `(?<!\\)\$[0-9]\b|(?<!\\)\$ARGUMENTS\b` —
 *     so backslash-escaped forms (`\$1`, `\$ARGUMENTS`), brace-delimited
 *     forms (`${1}`, `${ARGUMENTS}`), and two-digit references (`$10`) do
 *     NOT trigger the lint.
 *   • `text`-fenced blocks (used by every command for the user-input
 *     placeholder `\`\`\`text\n$ARGUMENTS\n\`\`\``) are unaffected.
 *   • Fenced blocks with no language tag are treated as out-of-scope (to
 *     opt in, tag them `bash` or `sh`).
 *
 * Returns an empty array on success; non-empty array on failure.
 */
export function lintCommandTemplates(
	templatePaths: readonly string[],
): readonly TemplateLintError[] {
	const errors: TemplateLintError[] = [];
	// Scan character-by-character is unnecessary — a line-by-line walk is
	// enough because code fences are line-based in CommonMark. The state
	// machine is: either inside a fenced block (tracked by language tag) or
	// outside. `(?<!\\)` excludes backslash-escaped tokens.
	const FORBIDDEN = /(?<!\\)\$[0-9]\b|(?<!\\)\$ARGUMENTS\b/g;
	for (const filePath of templatePaths) {
		let content: string;
		try {
			content = readFileSync(filePath, "utf8");
		} catch (err) {
			errors.push({
				filePath,
				line: 0,
				token: "",
				message: `cannot read template file "${filePath}": ${err instanceof Error ? err.message : String(err)}`,
			});
			continue;
		}
		const lines = content.split("\n");
		let inForbiddenFence = false;
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const fenceMatch = /^(\s*)```(\S*)\s*$/.exec(line);
			if (fenceMatch !== null) {
				if (inForbiddenFence) {
					// closing fence
					inForbiddenFence = false;
				} else {
					const lang = fenceMatch[2].trim().toLowerCase();
					inForbiddenFence = lang === "bash" || lang === "sh";
				}
				continue;
			}
			if (!inForbiddenFence) continue;
			FORBIDDEN.lastIndex = 0;
			let match: RegExpExecArray | null;
			match = FORBIDDEN.exec(line);
			while (match !== null) {
				const token = match[0];
				errors.push({
					filePath,
					line: i + 1,
					token,
					message: `${filePath}:${i + 1}: forbidden positional-arg placeholder ${token} in fenced bash/sh block (Claude Code substitutes $1..$9 / $ARGUMENTS at invocation time; extract the shell to a standalone binary or use \\$1 to escape)`,
				});
				match = FORBIDDEN.exec(line);
			}
		}
	}
	return errors;
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
