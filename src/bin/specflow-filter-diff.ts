import { basename } from "node:path";
import { matchesGlobPattern } from "../lib/glob.js";
import { tryExec } from "../lib/process.js";
import type { DiffExcludedEntry, DiffSummary } from "../types/contracts.js";

const HELP_TEXT = `Usage: specflow-filter-diff [-- <pathspec>...]

Filter git diff output for Codex review by removing:
  - Completely deleted files (deleted file mode)
  - Rename-only files (similarity index 100%, no content change)
  - Files matching DIFF_EXCLUDE_PATTERNS globs

Output:
  stdout: Filtered diff text
  stderr: JSON summary (last line)

Environment variables:
  DIFF_EXCLUDE_PATTERNS  Colon-separated glob patterns to exclude
  DIFF_WARN_THRESHOLD    Line count threshold (used by caller, not this script)

Examples:
  specflow-filter-diff
  specflow-filter-diff -- . ':(exclude).specflow' ':(exclude).specify'
  DIFF_EXCLUDE_PATTERNS="*.lock:dist/**" specflow-filter-diff
`;

const BUILTIN_EXCLUDE_PATTERNS = [
  "*/review-ledger.json",
  "*/review-ledger.json.bak",
  "*/review-ledger.json.corrupt",
  "*/review-ledger-design.json",
  "*/review-ledger-design.json.bak",
  "*/current-phase.md",
];

function parsePatterns(raw: string | undefined): { patterns: string[]; warnings: string[] } {
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

function pathMatchesPattern(filePath: string, pattern: string): boolean {
  if (matchesGlobPattern(filePath, pattern)) {
    return true;
  }
  if (!pattern.includes("/")) {
    return matchesGlobPattern(basename(filePath), pattern);
  }
  return false;
}

function git(args: readonly string[]) {
  return tryExec("git", args, process.cwd());
}

function printSummary(summary: DiffSummary): void {
  process.stderr.write(`${JSON.stringify(summary)}\n`);
}

function main(): void {
  const args = process.argv.slice(2);
  if (args[0] === "--help" || args[0] === "-h") {
    process.stdout.write(HELP_TEXT);
    process.exit(0);
  }

  const { patterns, warnings } = parsePatterns(process.env.DIFF_EXCLUDE_PATTERNS);
  const nameStatus = git(["diff", "--name-status", "-M100", ...args]);
  if (!nameStatus.stdout.trim()) {
    printSummary({
      excluded: [],
      warnings,
      included_count: 0,
      excluded_count: 0,
      total_lines: 0,
    });
    process.exit(0);
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

    const matchedPattern = patterns.find((pattern) => pathMatchesPattern(filePath, pattern));
    if (matchedPattern) {
      excluded.push({ file: filePath, reason: "pattern_match", pattern: matchedPattern });
      continue;
    }

    includedFiles.push(filePath);
  }

  let filteredDiff = "";
  let totalLines = 0;
  if (includedFiles.length > 0) {
    const diff = git(["diff", "--", ...includedFiles]);
    filteredDiff = diff.stdout;
    if (filteredDiff) {
      process.stdout.write(filteredDiff);
      totalLines = filteredDiff.endsWith("\n") ? filteredDiff.split("\n").length - 1 : filteredDiff.split("\n").length;
    }
  }

  printSummary({
    excluded,
    warnings,
    included_count: includedFiles.length,
    excluded_count: excluded.length,
    total_lines: totalLines,
  });
}

main();
