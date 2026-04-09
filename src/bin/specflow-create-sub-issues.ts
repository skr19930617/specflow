import { readFileSync } from "node:fs";
import { printSchemaJson, resolveCommand, tryExec } from "../lib/process.js";
import { assertSchemaValue, validateSchemaValue } from "../lib/schemas.js";
import type {
  CreateSubIssueCreated,
  CreateSubIssueFailed,
  CreateSubIssueInputItem,
  CreateSubIssuesInput,
  CreateSubIssuesResult,
} from "../types/contracts.js";

const HELP_TEXT = `Usage: specflow-create-sub-issues < payload.json

Create GitHub sub-issues from a decomposition plan.

Reads JSON from stdin with fields:
  parent_issue_number  (int)    Parent issue number
  repo                 (string) Repository in "owner/repo" format
  run_timestamp        (string) Unique run identifier (YYYYMMDD-HHMMSS)
  sub_features         (array)  Sub-features to create as issues

Each sub_feature must have:
  phase_number, title, description, requirements, acceptance_criteria, phase_total

Output: JSON with created[], failed[], summary_comment_posted, parent_issue_number
`;

const LABEL_COLORS = ["0e8a16", "1d76db", "d93f0b", "5319e7", "fbca04", "b60205", "006b75", "e99695"] as const;

function gh(args: readonly string[]) {
  return tryExec(resolveCommand("SPECFLOW_GH", "gh"), args, process.cwd());
}

function helpRequested(): boolean {
  return process.argv[2] === "--help" || process.argv[2] === "-h";
}

function readStdin(): string {
  return readFileSync(0, "utf8");
}

function printErrorJson(value: unknown): never {
  process.stderr.write(`${JSON.stringify(value)}\n`);
  process.exit(1);
}

function parseInput(raw: string): CreateSubIssuesInput {
  if (!raw.trim()) {
    printErrorJson({ error: "No input provided on stdin" });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    printErrorJson({ error: `Invalid JSON: ${message}` });
  }

  const validationErrors = validateSchemaValue("create-sub-issues-input", parsed);
  if (validationErrors.length > 0) {
    printErrorJson({ error: "Validation failed", details: validationErrors });
  }
  return assertSchemaValue("create-sub-issues-input", parsed as CreateSubIssuesInput, "stdin");
}

function phaseLabelColor(phaseNumber: number): string {
  return LABEL_COLORS[(phaseNumber - 1) % LABEL_COLORS.length];
}

function ensurePhaseLabels(input: CreateSubIssuesInput): void {
  for (const subFeature of input.sub_features) {
    void gh([
      "label",
      "create",
      `phase-${subFeature.phase_number}`,
      "--repo",
      input.repo,
      "--color",
      phaseLabelColor(subFeature.phase_number),
      "--description",
      `Decomposition phase ${subFeature.phase_number}`,
      "--force",
    ]);
  }
}

function decompositionId(input: CreateSubIssuesInput, subFeature: CreateSubIssueInputItem): string {
  return `decompose-${input.parent_issue_number}-${input.run_timestamp}-phase-${subFeature.phase_number}`;
}

function issueTitle(subFeature: CreateSubIssueInputItem): string {
  return `Phase ${subFeature.phase_number}: ${subFeature.title}`;
}

function existingIssue(input: CreateSubIssuesInput, subFeature: CreateSubIssueInputItem): CreateSubIssueCreated | null {
  const result = gh([
    "issue",
    "list",
    "--repo",
    input.repo,
    "--search",
    decompositionId(input, subFeature),
    "--json",
    "number,url,title",
    "--limit",
    "1",
  ]);
  if (result.status !== 0) {
    return null;
  }
  try {
    const parsed = JSON.parse(result.stdout) as Array<{ number?: number; url?: string }>;
    const first = parsed[0];
    if (!first || typeof first.number !== "number" || typeof first.url !== "string") {
      return null;
    }
    return {
      phase_number: subFeature.phase_number,
      issue_number: first.number,
      issue_url: first.url,
      title: issueTitle(subFeature),
    };
  } catch {
    return null;
  }
}

function renderIssueBody(input: CreateSubIssuesInput, subFeature: CreateSubIssueInputItem): string {
  return [
    `## Phase ${subFeature.phase_number} of ${subFeature.phase_total}: ${subFeature.title}`,
    "",
    `**Parent Issue**: #${input.parent_issue_number}`,
    `**Decomposition ID**: ${decompositionId(input, subFeature)}`,
    "",
    "## Description",
    subFeature.description,
    "",
    "## Requirements",
    ...subFeature.requirements.map((requirement) => `- ${requirement}`),
    "",
    "## Acceptance Criteria",
    ...subFeature.acceptance_criteria.map((criterion) => `- ${criterion}`),
  ].join("\n");
}

function parseIssueNumberFromUrl(url: string): number | null {
  const match = url.trim().match(/\/issues\/([0-9]+)\/?$/);
  if (!match) {
    return null;
  }
  const value = Number(match[1]);
  return Number.isInteger(value) ? value : null;
}

function createIssue(input: CreateSubIssuesInput, subFeature: CreateSubIssueInputItem): CreateSubIssueCreated | CreateSubIssueFailed {
  const title = issueTitle(subFeature);
  const duplicate = existingIssue(input, subFeature);
  if (duplicate) {
    return duplicate;
  }

  const result = gh([
    "issue",
    "create",
    "--repo",
    input.repo,
    "--title",
    title,
    "--body",
    renderIssueBody(input, subFeature),
    "--label",
    `phase-${subFeature.phase_number}`,
  ]);
  if (result.status === 0) {
    const issueUrl = result.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .at(-1);
    const issueNumber = issueUrl ? parseIssueNumberFromUrl(issueUrl) : null;
    if (issueUrl && issueNumber !== null) {
      return {
        phase_number: subFeature.phase_number,
        issue_number: issueNumber,
        issue_url: issueUrl,
        title,
      };
    }
  }

  const message = (result.stderr || result.stdout || "Unknown error").trim().slice(0, 200);
  return {
    phase_number: subFeature.phase_number,
    title,
    error: message,
  };
}

function isCreatedIssue(result: CreateSubIssueCreated | CreateSubIssueFailed): result is CreateSubIssueCreated {
  return "issue_number" in result;
}

function renderSummaryComment(input: CreateSubIssuesInput, created: readonly CreateSubIssueCreated[]): string {
  const lines = [...created]
    .sort((left, right) => left.phase_number - right.phase_number)
    .map((issue) => `- **Phase ${issue.phase_number}**: #${issue.issue_number} — ${issue.title}`);
  return [
    "## Decomposition Sub-Issues",
    "",
    "This issue has been decomposed into the following sub-issues:",
    "",
    ...lines,
    "",
    `_Decomposition run: ${input.run_timestamp}_`,
  ].join("\n");
}

function postSummaryComment(input: CreateSubIssuesInput, created: readonly CreateSubIssueCreated[]): boolean {
  if (created.length === 0 || input.skip_comment === true) {
    return false;
  }
  const result = gh([
    "issue",
    "comment",
    String(input.parent_issue_number),
    "--repo",
    input.repo,
    "--body",
    renderSummaryComment(input, created),
  ]);
  return result.status === 0;
}

function main(): void {
  if (helpRequested()) {
    process.stdout.write(HELP_TEXT);
    process.exit(0);
  }

  const input = parseInput(readStdin());
  ensurePhaseLabels(input);

  const created: CreateSubIssueCreated[] = [];
  const failed: CreateSubIssueFailed[] = [];
  for (const subFeature of input.sub_features) {
    const result = createIssue(input, subFeature);
    if (isCreatedIssue(result)) {
      created.push(result);
    } else {
      failed.push(result);
    }
  }

  const output: CreateSubIssuesResult = {
    created,
    failed,
    summary_comment_posted: postSummaryComment(input, created),
    parent_issue_number: input.parent_issue_number,
  };
  printSchemaJson("create-sub-issues-result", output);
  process.exit(failed.length > 0 ? 2 : 0);
}

main();
