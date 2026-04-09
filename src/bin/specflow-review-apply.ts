import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { moduleRepoRoot, printSchemaJson, tryExec } from "../lib/process.js";
import { projectRoot as resolveProjectRoot, tryGit } from "../lib/git.js";
import { tryParseJson } from "../lib/json.js";
import {
  actionableCount,
  backupAndWriteLedger,
  computeScore,
  computeStatus,
  computeSummary,
  highFindingTitles,
  ledgerSnapshot,
  matchFindings,
  matchRereview,
  openHighFindings,
  persistMaxFindingId,
  readLedger,
  resolvedHighFindingTitles,
  severitySummary,
  validateLedger,
  incrementRound,
  type LedgerConfig,
} from "../lib/review-ledger.js";
import {
  buildPrompt,
  callCodex,
  diffWarningSummary,
  errorJson,
  readPrompt,
  readReviewConfig,
  renderCurrentPhase,
  unresolvedHighCount,
} from "../lib/review-runtime.js";
import type {
  AutofixRoundScore,
  DiffSummary,
  DivergenceWarning,
  ReviewFinding,
  ReviewLedger,
  ReviewPayload,
  ReviewResult,
} from "../types/contracts.js";

const LEDGER_CONFIG: LedgerConfig = {
  filename: "review-ledger.json",
  defaultPhase: "impl",
};

function notInGitRepo(): never {
  process.stdout.write('{"status":"error","error":"not_in_git_repo"}\n');
  process.exit(1);
}

function ensureGitRepo(): string {
  const result = tryGit(["rev-parse", "--show-toplevel"], process.cwd());
  if (result.status !== 0) {
    notInGitRepo();
  }
  return result.stdout.trim();
}

function die(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function readProposal(changeDir: string): string {
  return readFileSync(resolve(changeDir, "proposal.md"), "utf8");
}

function diffFilter(runtimeRoot: string, cwd: string): { diff: string; summary: DiffSummary | "empty" } {
  const diffFilterPath = resolve(runtimeRoot, "bin/specflow-filter-diff");
  const result = tryExec(
    diffFilterPath,
    ["--", ".", ":(exclude)*/review-ledger.json", ":(exclude)*/review-ledger.json.bak", ":(exclude)*/review-ledger.json.corrupt", ":(exclude)*/current-phase.md"],
    cwd,
  );
  const stderrLines = result.stderr.trim().split("\n").filter(Boolean);
  const lastLine = stderrLines.at(-1) ?? "{}";
  const parsed = tryParseJson<DiffSummary>(lastLine) ?? {
    excluded: [],
    warnings: [],
    included_count: 0,
    excluded_count: 0,
    total_lines: 0,
  };
  if (!result.stdout) {
    return { diff: "", summary: "empty" };
  }
  return { diff: result.stdout, summary: parsed };
}

function buildReviewPrompt(runtimeRoot: string, changeDir: string, diff: string): string {
  return [
    readPrompt(runtimeRoot, "review_apply_prompt.md").trimEnd(),
    buildPrompt([
      ["CURRENT GIT DIFF", diff],
      ["PROPOSAL CONTENT", readProposal(changeDir)],
    ]),
  ].join("\n\n");
}

function buildRereviewPrompt(runtimeRoot: string, changeDir: string, diff: string, previousFindings: readonly ReviewFinding[], maxFindingId: number): string {
  return [
    readPrompt(runtimeRoot, "review_apply_rereview_prompt.md").trimEnd(),
    buildPrompt([
      ["PREVIOUS_FINDINGS", JSON.stringify(previousFindings)],
      ["MAX_FINDING_ID", String(maxFindingId)],
      ["CURRENT GIT DIFF", diff],
      ["PROPOSAL CONTENT", readProposal(changeDir)],
    ]),
  ].join("\n\n");
}

function buildFixPrompt(changeDir: string, diff: string, findings: readonly ReviewFinding[]): string {
  return [
    "You are a code fixer. Based on the review findings below, fix all issues in the codebase.",
    "Apply fixes for all findings. Do not skip any.",
    "",
    buildPrompt([
    ["REVIEW FINDINGS", JSON.stringify(findings)],
    ["CURRENT GIT DIFF", diff],
    ["PROPOSAL CONTENT", readProposal(changeDir)],
    ]),
  ].join("\n");
}

function reviewPayload(reviewJson: Record<string, unknown>, rereviewMode: boolean, parseError: boolean, rawResponse: string): ReviewPayload {
  return {
    decision: String(reviewJson.decision ?? "UNKNOWN"),
    summary: String(reviewJson.summary ?? ""),
    findings: Array.isArray(reviewJson.findings) ? (reviewJson.findings as ReviewFinding[]) : [],
    rereview_mode: rereviewMode,
    parse_error: parseError,
    raw_response: parseError ? rawResponse : null,
  };
}

function resultFromLedger(
  action: string,
  changeId: string,
  reviewJson: Record<string, unknown>,
  rereviewMode: boolean,
  parseError: boolean,
  rawResponse: string,
  ledger: ReviewLedger,
  diffSummary: DiffSummary,
): ReviewResult {
  const publicDiffSummary = {
    total_lines: diffSummary.total_lines,
    excluded_count: diffSummary.excluded_count,
    included_count: diffSummary.included_count,
    diff_warning: diffSummary.diff_warning,
  };
  const actionable = actionableCount(ledger);
  return {
    status: "success",
    action,
    change_id: changeId,
    review: reviewPayload(reviewJson, rereviewMode, parseError, rawResponse),
    ledger: ledgerSnapshot(ledger),
    autofix: null,
    handoff: {
      state: actionable > 0 ? "review_with_findings" : "review_no_findings",
      actionable_count: actionable,
      severity_summary: severitySummary(ledger),
    },
    diff_summary: publicDiffSummary,
    error: null,
  };
}

function runReviewPipeline(runtimeRoot: string, projectRoot: string, changeDir: string, action: string, changeId: string, rereviewMode: boolean): ReviewResult {
  process.stderr.write("Running diff filter...\n");
  const rawDiff = diffFilter(runtimeRoot, projectRoot);
  if (rawDiff.summary === "empty") {
    return {
      ...errorJson(action, changeId, "no_changes"),
      review: null,
      ledger: null,
      autofix: null,
      handoff: null,
    };
  }
  const config = readReviewConfig(projectRoot);
  let diff = rawDiff.diff;
  let diffSummary = diffWarningSummary(rawDiff.summary, config.diffWarnThreshold);
  if (diffSummary.diff_warning) {
    const publicDiffSummary = {
      total_lines: diffSummary.total_lines,
      excluded_count: diffSummary.excluded_count,
      included_count: diffSummary.included_count,
      diff_warning: diffSummary.diff_warning,
    };
    return {
      status: "warning",
      action,
      change_id: changeId,
      warning: "diff_threshold_exceeded",
      diff_summary: publicDiffSummary,
      diff_total_lines: diffSummary.total_lines,
      review: null,
      ledger: null,
      autofix: null,
      handoff: null,
      error: null,
    };
  }

  if (rereviewMode) {
    process.stderr.write("Applying fixes via Codex...\n");
    const beforeFix = readLedger(changeDir, LEDGER_CONFIG).ledger;
    const fixFindings = (beforeFix.findings ?? []).filter((finding) => {
      const status = String(finding.status ?? "");
      return status === "new" || status === "open";
    });
    void callCodex(projectRoot, buildFixPrompt(changeDir, diff, fixFindings));
    const rerun = diffFilter(runtimeRoot, projectRoot);
    if (rerun.summary === "empty") {
      return {
        ...errorJson(action, changeId, "no_changes"),
        review: null,
        ledger: null,
        autofix: null,
        handoff: null,
      };
    }
    diff = rerun.diff;
    diffSummary = diffWarningSummary(rerun.summary, config.diffWarnThreshold);
  }

  process.stderr.write("Calling Codex for review...\n");
  const prompt = rereviewMode
    ? (() => {
        const priorLedger = readLedger(changeDir, LEDGER_CONFIG).ledger;
        const previousFindings = (priorLedger.findings ?? []).filter((finding) => String(finding.status ?? "") !== "resolved");
        return buildRereviewPrompt(runtimeRoot, changeDir, diff, previousFindings, Number(priorLedger.max_finding_id ?? 0));
      })()
    : buildReviewPrompt(runtimeRoot, changeDir, diff);
  const codexResult = callCodex<Record<string, unknown>>(projectRoot, prompt);

  let parseError = false;
  let rawResponse = "";
  let reviewJson: Record<string, unknown> = {
    decision: "UNKNOWN",
    findings: [],
    summary: "parse failed",
  };

  if (!codexResult.ok) {
    if (codexResult.exitCode) {
      return {
        ...errorJson(action, changeId, `codex_exit_${codexResult.exitCode}`),
        review: null,
        ledger: null,
        autofix: null,
        handoff: null,
      };
    }
    parseError = true;
    rawResponse = codexResult.rawResponse;
  } else if (codexResult.payload) {
    reviewJson = codexResult.payload;
  }

  const ledgerRead = readLedger(changeDir, LEDGER_CONFIG);
  if (ledgerRead.status === "prompt_user") {
    return {
      status: "success",
      action,
      change_id: changeId,
      review: null,
      ledger: null,
      autofix: null,
      handoff: null,
      ledger_recovery: "prompt_user",
      error: null,
    };
  }

  let ledger = ledgerRead.ledger;
  const validated = validateLedger(ledger);
  ledger = validated.ledger;
  if (validated.warnings.length > 0) {
    process.stderr.write(`[ledger] WARNING: Reverted high-severity findings with empty notes to 'open': ${validated.warnings.join(", ")}\n`);
  }

  if (!parseError) {
    ledger = incrementRound(ledger);
    const round = Number(ledger.current_round ?? 0);
    if (rereviewMode) {
      ledger = matchRereview(ledger, reviewJson, round);
    } else {
      ledger = matchFindings(ledger, Array.isArray(reviewJson.findings) ? (reviewJson.findings as ReviewFinding[]) : [], round);
    }
    ledger = computeSummary(ledger, round);
    ledger = computeStatus(ledger);
    ledger = persistMaxFindingId(ledger);
    backupAndWriteLedger(changeDir, ledger, LEDGER_CONFIG, ledgerRead.status === "clean");
    renderCurrentPhase(changeDir, ledger, "apply", projectRoot);
  }

  return resultFromLedger(action, changeId, reviewJson, rereviewMode, parseError, rawResponse, ledger, diffSummary);
}

function runAutofixLoop(runtimeRoot: string, projectRoot: string, changeDir: string, changeId: string, maxRounds: number): ReviewResult {
  let ledger = readLedger(changeDir, LEDGER_CONFIG).ledger;
  let previousScore = computeScore(ledger);
  let previousNewHighCount = 0;
  let previousAllHighTitles = highFindingTitles(ledger);
  let previousResolvedHighTitles = resolvedHighFindingTitles(ledger);
  let consecutiveFailures = 0;
  let autofixRound = 0;
  let loopResult = "max_rounds_reached";
  const roundScores: AutofixRoundScore[] = [];
  const divergenceWarnings: DivergenceWarning[] = [];

  while (autofixRound < maxRounds) {
    autofixRound += 1;
    process.stderr.write(`Auto-fix Round ${autofixRound}/${maxRounds}: Starting fix...\n`);
    const diffResult = diffFilter(runtimeRoot, projectRoot);
    if (diffResult.summary === "empty") {
      loopResult = "no_changes";
      break;
    }
    const actionableFindings = (ledger.findings ?? []).filter((finding) => {
      const status = String(finding.status ?? "");
      return status === "new" || status === "open";
    });
    const fixResult = callCodex(projectRoot, buildFixPrompt(changeDir, diffResult.diff, actionableFindings));
    if (!fixResult.ok) {
      consecutiveFailures += 1;
      process.stderr.write(`Warning: fix step failed (consecutive: ${consecutiveFailures})\n`);
      if (consecutiveFailures >= 3) {
        loopResult = "consecutive_failures";
        break;
      }
      continue;
    }

    const reviewResult = runReviewPipeline(runtimeRoot, projectRoot, changeDir, "fix_review", changeId, true);
    if (reviewResult.status === "error" || reviewResult.review?.parse_error) {
      consecutiveFailures += 1;
      process.stderr.write(`Warning: re-review returned error/parse_error (consecutive: ${consecutiveFailures})\n`);
      if (consecutiveFailures >= 3) {
        loopResult = "consecutive_failures";
        break;
      }
      continue;
    }

    consecutiveFailures = 0;
    ledger = readLedger(changeDir, LEDGER_CONFIG).ledger;
    const currentScore = computeScore(ledger);
    const unresolvedHigh = unresolvedHighCount(ledger);
    const currentAllHighTitles = highFindingTitles(ledger);
    const currentNewHighCount = currentAllHighTitles.filter((title) => !previousAllHighTitles.includes(title)).length;

    roundScores.push({
      round: autofixRound,
      score: currentScore,
      unresolved_high: unresolvedHigh,
      new_high: currentNewHighCount,
    });

    if (unresolvedHigh === 0) {
      loopResult = "success";
      process.stderr.write(`Auto-fix Round ${autofixRound}: success (unresolved high = 0)\n`);
      break;
    }

    if (currentScore > previousScore) {
      divergenceWarnings.push({
        round: autofixRound,
        type: "quality_gate_degradation",
        detail: `+${currentScore - previousScore}`,
      });
      process.stderr.write(`Warning: quality gate degradation +${currentScore - previousScore}\n`);
    }

    const currentResolvedHighTitles = resolvedHighFindingTitles(ledger);
    const newlyResolved = currentResolvedHighTitles.filter((title) => !previousResolvedHighTitles.includes(title));
    const unresolvedTitles = openHighFindings(ledger).map((finding) => String(finding.title ?? ""));
    const reemerged = newlyResolved.find((title) => unresolvedTitles.some((candidate) => candidate.toLowerCase().includes(title.toLowerCase())));
    if (reemerged) {
      divergenceWarnings.push({
        round: autofixRound,
        type: "finding_re_emergence",
        detail: reemerged,
      });
      process.stderr.write(`Warning: finding re-emergence: ${reemerged}\n`);
    }

    if (autofixRound >= 2 && currentNewHighCount > previousNewHighCount) {
      divergenceWarnings.push({
        round: autofixRound,
        type: "new_high_increase",
        detail: `+${currentNewHighCount - previousNewHighCount}`,
      });
      process.stderr.write(`Warning: new high increase +${currentNewHighCount - previousNewHighCount}\n`);
    }

    previousScore = currentScore;
    previousNewHighCount = currentNewHighCount;
    previousAllHighTitles = currentAllHighTitles;
    previousResolvedHighTitles = currentResolvedHighTitles;
    process.stderr.write(`Auto-fix Round ${autofixRound}/${maxRounds}: unresolved_high=${unresolvedHigh}, score=${currentScore}\n`);
  }

  const actionable = actionableCount(ledger);
  return {
    status: "success",
    action: "autofix_loop",
    change_id: changeId,
    review: null,
    ledger: ledgerSnapshot(ledger),
    autofix: {
      total_rounds: autofixRound,
      result: loopResult,
      round_scores: roundScores,
      divergence_warnings: divergenceWarnings,
    },
    handoff: {
      state: actionable === 0 ? "loop_no_findings" : "loop_with_findings",
      actionable_count: actionable,
      severity_summary: severitySummary(ledger),
    },
    error: null,
  };
}

function cmdReview(runtimeRoot: string, projectRoot: string, args: readonly string[]): ReviewResult {
  const changeId = args[0];
  if (!changeId) {
    die("Usage: specflow-review-apply review <CHANGE_ID>");
  }
  const changeDir = resolve(projectRoot, "openspec/changes", changeId);
  if (!existsSync(changeDir) || !existsSync(resolve(changeDir, "proposal.md"))) {
    die(`Error: change directory not found: ${changeDir}`);
  }
  return runReviewPipeline(runtimeRoot, projectRoot, changeDir, "review", changeId, false);
}

function cmdFixReview(runtimeRoot: string, projectRoot: string, args: readonly string[]): ReviewResult {
  let changeId = "";
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--autofix") {
      continue;
    }
    if (arg.startsWith("-")) {
      die(`Error: unknown option '${arg}'`);
    }
    if (!changeId) {
      changeId = arg;
      continue;
    }
    die(`Error: unexpected argument '${arg}'`);
  }
  if (!changeId) {
    die("Usage: specflow-review-apply fix-review <CHANGE_ID> [--autofix]");
  }
  const changeDir = resolve(projectRoot, "openspec/changes", changeId);
  if (!existsSync(changeDir) || !existsSync(resolve(changeDir, "proposal.md"))) {
    die(`Error: change directory not found: ${changeDir}`);
  }
  return runReviewPipeline(runtimeRoot, projectRoot, changeDir, "fix_review", changeId, true);
}

function cmdAutofixLoop(runtimeRoot: string, projectRoot: string, args: readonly string[]): ReviewResult {
  let changeId = "";
  let maxRounds = "";
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--max-rounds") {
      maxRounds = args[index + 1] ?? die("Error: --max-rounds requires a value");
      index += 1;
      continue;
    }
    if (arg.startsWith("-")) {
      die(`Error: unknown option '${arg}'`);
    }
    if (!changeId) {
      changeId = arg;
      continue;
    }
    die(`Error: unexpected argument '${arg}'`);
  }
  if (!changeId) {
    die("Usage: specflow-review-apply autofix-loop <CHANGE_ID> [--max-rounds N]");
  }
  const config = readReviewConfig(projectRoot);
  const rounds = maxRounds
    ? /^[0-9]+$/.test(maxRounds) && Number(maxRounds) >= 1 && Number(maxRounds) <= 10
      ? Number(maxRounds)
      : die("Error: --max-rounds must be a number between 1 and 10")
    : config.maxAutofixRounds;
  const changeDir = resolve(projectRoot, "openspec/changes", changeId);
  if (!existsSync(changeDir) || !existsSync(resolve(changeDir, "proposal.md"))) {
    die(`Error: change directory not found: ${changeDir}`);
  }
  return runAutofixLoop(runtimeRoot, projectRoot, changeDir, changeId, rounds);
}

function main(): void {
  const projectRoot = ensureGitRepo();
  const runtimeRoot = moduleRepoRoot(import.meta.url);
  const [subcommand = "", ...args] = process.argv.slice(2);
  let result: ReviewResult;
  switch (subcommand) {
    case "review":
      result = cmdReview(runtimeRoot, projectRoot, args);
      break;
    case "fix-review":
      result = cmdFixReview(runtimeRoot, projectRoot, args);
      break;
    case "autofix-loop":
      result = cmdAutofixLoop(runtimeRoot, projectRoot, args);
      break;
    case "":
      die("Usage: specflow-review-apply <review|fix-review|autofix-loop> <CHANGE_ID> [options]");
    default:
      die(`Error: unknown subcommand '${subcommand}'. Use: review, fix-review, autofix-loop`);
  }
  printSchemaJson("review-apply-result", result);
}

main();
