// Git-backed WorkspaceContext implementation for local mode.
// CLI entry points construct this and inject into core via the WorkspaceContext interface.

import { basename } from "node:path";
import type { DiffExcludedEntry, DiffSummary } from "../types/contracts.js";
import { matchesGlobPattern } from "./glob.js";
import { tryExec } from "./process.js";
import type {
	FilteredDiffResult,
	WorkspaceContext,
} from "./workspace-context.js";

const BUILTIN_EXCLUDE_PATTERNS = [
	"*/review-ledger.json",
	"*/review-ledger.json.bak",
	"*/review-ledger.json.corrupt",
	"*/review-ledger-design.json",
	"*/review-ledger-design.json.bak",
	"*/current-phase.md",
];

function pathMatchesPattern(filePath: string, pattern: string): boolean {
	if (matchesGlobPattern(filePath, pattern)) {
		return true;
	}
	if (!pattern.includes("/")) {
		return matchesGlobPattern(basename(filePath), pattern);
	}
	return false;
}

function parseExcludePatterns(raw: string | undefined): {
	patterns: readonly string[];
	warnings: readonly string[];
} {
	const patterns: string[] = [];
	const warnings: string[] = [];
	if (raw) {
		for (const pattern of raw.split(":")) {
			if (!pattern) {
				continue;
			}
			try {
				matchesGlobPattern("___test___", pattern);
				patterns.push(pattern);
			} catch {
				warnings.push(`invalid pattern '${pattern}' — skipping`);
			}
		}
	}
	return {
		patterns: [...patterns, ...BUILTIN_EXCLUDE_PATTERNS],
		warnings,
	};
}

function globsToPathspecs(globs: readonly string[]): readonly string[] {
	return globs.map((g) => `:(exclude)${g}`);
}

function collectFilteredDiff(
	resolvedRoot: string,
	options: {
		readonly excludeGlobs?: readonly string[];
		readonly pathspecs?: readonly string[];
	} = {},
): FilteredDiffResult {
	const { patterns, warnings } = parseExcludePatterns(
		process.env.DIFF_EXCLUDE_PATTERNS,
	);
	const excludeGlobs = (options.excludeGlobs ?? []).filter(Boolean);
	const allPatterns = [...patterns, ...excludeGlobs];
	const nameStatusArgs = [
		"diff",
		"--name-status",
		"-M100",
		...(options.pathspecs ?? []),
	];
	const nameStatus = tryExec("git", nameStatusArgs, resolvedRoot);

	if (!nameStatus.stdout.trim()) {
		return {
			diff: "",
			summary: "empty",
			warnings: [...warnings],
		};
	}

	const includedFiles: string[] = [];
	const excluded: DiffExcludedEntry[] = [];

	for (const line of nameStatus.stdout.trim().split("\n")) {
		const [status, file1 = "", file2 = ""] = line.split("\t");
		if (!status) {
			continue;
		}
		if (status === "D") {
			excluded.push({ file: file1, reason: "deleted_file" });
			continue;
		}
		if (status === "R100") {
			excluded.push({ file: file1, reason: "rename_only", new_path: file2 });
			continue;
		}

		let filePath = file1;
		if (status.startsWith("R") || status.startsWith("C")) {
			filePath = file2;
		}

		const matchedPattern = allPatterns.find((pattern) =>
			pathMatchesPattern(filePath, pattern),
		);
		if (matchedPattern) {
			excluded.push({
				file: filePath,
				reason: "pattern_match",
				pattern: matchedPattern,
			});
			continue;
		}

		includedFiles.push(filePath);
	}

	let filteredDiff = "";
	let totalLines = 0;
	if (includedFiles.length > 0) {
		const diffResult = tryExec(
			"git",
			["diff", "--", ...includedFiles],
			resolvedRoot,
		);
		filteredDiff = diffResult.stdout;
		if (filteredDiff) {
			totalLines = filteredDiff.endsWith("\n")
				? filteredDiff.split("\n").length - 1
				: filteredDiff.split("\n").length;
		}
	}

	const summary: DiffSummary = {
		excluded,
		warnings: [...warnings],
		included_count: includedFiles.length,
		excluded_count: excluded.length,
		total_lines: totalLines,
	};

	if (includedFiles.length === 0 && excluded.length === 0) {
		return {
			diff: "",
			summary: "empty",
			warnings: [...warnings],
		};
	}

	return { diff: filteredDiff, summary, warnings: [...warnings] };
}

export function filterLocalWorkspaceDiff(
	projectRoot: string,
	options: {
		readonly excludeGlobs?: readonly string[];
		readonly pathspecs?: readonly string[];
	} = {},
): FilteredDiffResult {
	return collectFilteredDiff(projectRoot, options);
}

class LocalWorkspaceContext implements WorkspaceContext {
	private readonly resolvedRoot: string;
	private readonly resolvedWorktree: string;

	constructor(workspacePath?: string, worktreePath?: string) {
		const cwd = workspacePath ?? process.cwd();
		const result = tryExec("git", ["rev-parse", "--show-toplevel"], cwd);
		if (result.status !== 0) {
			throw new Error(`not a git repository: ${cwd}`);
		}
		this.resolvedRoot = result.stdout.trim();
		this.resolvedWorktree = worktreePath ?? this.resolvedRoot;
	}

	readonly projectRoot = (): string => {
		return this.resolvedRoot;
	};

	readonly branchName = (): string | null => {
		const result = tryExec(
			"git",
			["rev-parse", "--abbrev-ref", "HEAD"],
			this.resolvedWorktree,
		);
		if (result.status !== 0) {
			return null;
		}
		return result.stdout.trim() || null;
	};

	readonly projectIdentity = (): string => {
		const result = tryExec(
			"git",
			["remote", "get-url", "origin"],
			this.resolvedRoot,
		);
		if (result.status !== 0 || !result.stdout.trim()) {
			return `local/${basename(this.resolvedRoot)}`;
		}
		return result.stdout
			.trim()
			.replace(/\.git$/, "")
			.replace(/^.*[:/]([^/]+\/[^/]+)$/, "$1");
	};

	readonly projectDisplayName = (): string => {
		return this.projectIdentity();
	};

	readonly worktreePath = (): string => {
		return this.resolvedWorktree;
	};

	readonly filteredDiff = (
		excludeGlobs: readonly string[],
	): FilteredDiffResult => {
		return collectFilteredDiff(this.resolvedRoot, {
			excludeGlobs,
			pathspecs: ["--", ".", ...globsToPathspecs(excludeGlobs)],
		});
	};
}

export function createLocalWorkspaceContext(
	workspacePath?: string,
	worktreePath?: string,
): WorkspaceContext {
	return new LocalWorkspaceContext(workspacePath, worktreePath);
}
