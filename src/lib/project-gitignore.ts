interface GitignoreSection {
	readonly title: string;
	readonly entries: readonly string[];
}

const CLAUDE_SECTION_TITLE = "Claude Code - local settings";
const NODE_SECTION: GitignoreSection = {
	title: "Node",
	entries: ["node_modules/", "dist/", "coverage/"],
};

export type ClaudeGitignoreMode = "settings-only" | "directory";

export interface ProjectGitignoreOptions {
	readonly claudeMode: ClaudeGitignoreMode;
	readonly includeNodeArtifacts?: boolean;
}

function claudeEntries(mode: ClaudeGitignoreMode): readonly string[] {
	if (mode === "directory") {
		return [".claude/"];
	}
	return [".claude/settings.json", ".claude/settings.local.json"];
}

function renderSection(section: GitignoreSection): string {
	return [`# ${section.title}`, ...section.entries].join("\n");
}

function parseGitignoreTemplate(templateContent: string): GitignoreSection[] {
	const sections: GitignoreSection[] = [];
	let title: string | null = null;
	let entries: string[] = [];

	const flush = () => {
		if (title !== null) {
			sections.push({ title, entries });
		}
	};

	for (const line of templateContent.split(/\r?\n/)) {
		if (line.startsWith("# ")) {
			flush();
			title = line.slice(2);
			entries = [];
			continue;
		}
		if (!line.trim()) {
			continue;
		}
		entries.push(line);
	}

	flush();
	return sections;
}

function sectionsFor(
	templateContent: string,
	options: ProjectGitignoreOptions,
): readonly GitignoreSection[] {
	const sections = parseGitignoreTemplate(templateContent).map((section) =>
		section.title === CLAUDE_SECTION_TITLE
			? { ...section, entries: claudeEntries(options.claudeMode) }
			: section,
	);

	if (options.includeNodeArtifacts) {
		sections.push(NODE_SECTION);
	}

	return sections;
}

export function renderProjectGitignore(
	templateContent: string,
	options: ProjectGitignoreOptions,
): string {
	return `${sectionsFor(templateContent, options).map(renderSection).join("\n\n")}\n`;
}

export function mergeProjectGitignore(
	existingContent: string,
	templateContent: string,
	options: ProjectGitignoreOptions,
): { readonly content: string; readonly changed: boolean } {
	const existingLines = new Set(existingContent.split(/\r?\n/));
	const missingBlocks = sectionsFor(templateContent, options)
		.map((section) => ({
			...section,
			entries: section.entries.filter((entry) => !existingLines.has(entry)),
		}))
		.filter((section) => section.entries.length > 0)
		.map(renderSection);

	if (missingBlocks.length === 0) {
		return { content: existingContent, changed: false };
	}

	let content = existingContent;
	if (content.trim()) {
		content = content.endsWith("\n") ? content : `${content}\n`;
		content = `${content}\n`;
	}

	return {
		content: `${content}${missingBlocks.join("\n\n")}\n`,
		changed: true,
	};
}
