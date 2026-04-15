import { PLANNING_HEADINGS } from "./design-planning-headings.js";

export interface PlanningValidationResult {
	readonly valid: boolean;
	readonly missing: readonly string[];
	readonly empty: readonly string[];
}

/**
 * Extract markdown headings (## level) from design content.
 * Returns an array of { name, content } pairs where content is the text
 * between this heading and the next heading (or EOF).
 */
function extractSections(
	designContent: string,
): readonly { name: string; content: string }[] {
	const lines = designContent.split("\n");
	const sections: { name: string; content: string }[] = [];
	let currentHeading: string | null = null;
	let contentLines: string[] = [];

	for (const line of lines) {
		const headingMatch = line.match(/^##\s+(.+)$/);
		if (headingMatch) {
			if (currentHeading !== null) {
				sections.push({
					name: currentHeading,
					content: contentLines.join("\n"),
				});
			}
			currentHeading = headingMatch[1].trim();
			contentLines = [];
		} else if (currentHeading !== null) {
			contentLines.push(line);
		}
	}

	if (currentHeading !== null) {
		sections.push({ name: currentHeading, content: contentLines.join("\n") });
	}

	return sections;
}

/**
 * Case-insensitive match that requires the required heading to appear at the
 * START of the actual heading, preventing false positives on unrelated
 * headings that happen to contain the required text as a substring.
 *
 * e.g., "Concerns and Vertical Slices" matches "Concerns" (suffix words OK),
 * but "No Concerns Here" does NOT match "Concerns" (prefix words rejected).
 *
 * Matching rules:
 * 1. The required heading must appear at the start of the actual heading.
 * 2. The required heading must be followed by whitespace or end-of-string.
 *    This is stricter than a word boundary (`\b`) which would also match
 *    before hyphens and slashes, allowing false positives like
 *    "Concerns-Extended" matching "Concerns".
 */
function headingMatches(
	actualHeading: string,
	requiredHeading: string,
): boolean {
	const escaped = requiredHeading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const pattern = new RegExp(`^${escaped}(?:$|\\s)`, "i");
	return pattern.test(actualHeading);
}

function hasNonEmptyContent(content: string): boolean {
	const trimmed = content.trim();
	return trimmed.length > 0;
}

/**
 * Validate that a design.md contains all mandatory planning section headings
 * with non-empty content.
 *
 * - Heading matching is case-insensitive and allows additional words.
 * - "N/A" followed by any text is considered valid non-empty content.
 * - A section with only whitespace is considered empty.
 */
export function validatePlanningHeadings(
	designContent: string,
): PlanningValidationResult {
	const sections = extractSections(designContent);
	const missing: string[] = [];
	const empty: string[] = [];

	for (const required of PLANNING_HEADINGS) {
		const matchedSection = sections.find((section) =>
			headingMatches(section.name, required),
		);

		if (!matchedSection) {
			missing.push(required);
		} else if (!hasNonEmptyContent(matchedSection.content)) {
			empty.push(required);
		}
	}

	return {
		valid: missing.length === 0 && empty.length === 0,
		missing,
		empty,
	};
}
