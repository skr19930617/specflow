import type { ChangeArtifactStore } from "../lib/artifact-store.js";
import {
	ChangeArtifactType,
	changeRef,
	ReviewLedgerKind,
} from "../lib/artifact-types.js";
import { tryGit } from "../lib/git.js";
import { createLocalFsChangeArtifactStore } from "../lib/local-fs-change-artifact-store.js";
import { moduleRepoRoot, printSchemaJson } from "../lib/process.js";
import {
	actionableCount,
	applyStillOpenSeverityOverrides,
	clearLedgerFindings,
	computeScore,
	computeStatus,
	computeSummary,
	emptyLedger,
	highFindingTitles,
	incrementRound,
	ledgerSnapshot,
	matchFindings,
	matchRereview,
	openHighFindings,
	persistMaxFindingId,
	readLedgerFromStore,
	resolvedHighFindingTitles,
	severitySummary,
	validateLedger,
	writeLedgerToStore,
} from "../lib/review-ledger.js";
import {
	buildPrompt,
	callCodex,
	contentHash,
	errorJson,
	readDesignArtifactsFromStore,
	readPrompt,
	readReviewConfig,
	renderCurrentPhaseToStore,
	unresolvedHighCount,
	validateChangeFromStore,
} from "../lib/review-runtime.js";
import type {
	AutofixRoundScore,
	DivergenceWarning,
	ReviewFinding,
	ReviewLedger,
	ReviewPayload,
	ReviewResult,
} from "../types/contracts.js";

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

function buildReviewPrompt(
	runtimeRoot: string,
	changeStore: ChangeArtifactStore,
	changeId: string,
): string {
	const artifacts = readDesignArtifactsFromStore(changeStore, changeId);
	if (!artifacts) {
		throw new Error("missing_artifacts");
	}
	const parts: [string, string][] = [["PROPOSAL CONTENT", artifacts.proposal]];
	if (artifacts.specs) {
		parts.push(["SPEC FILES", artifacts.specs]);
	}
	parts.push(
		["DESIGN CONTENT", artifacts.design],
		["TASKS CONTENT", artifacts.tasks],
	);
	return [
		readPrompt(runtimeRoot, "review_design_prompt.md").trimEnd(),
		buildPrompt(parts),
	].join("\n\n");
}

function buildRereviewPrompt(
	runtimeRoot: string,
	changeStore: ChangeArtifactStore,
	changeId: string,
	previousFindings: readonly ReviewFinding[],
	maxFindingId: number,
): string {
	const artifacts = readDesignArtifactsFromStore(changeStore, changeId);
	if (!artifacts) {
		throw new Error("missing_artifacts");
	}
	const parts: [string, string][] = [
		["PREVIOUS_FINDINGS", JSON.stringify(previousFindings)],
		["MAX_FINDING_ID", String(maxFindingId)],
		["PROPOSAL CONTENT", artifacts.proposal],
	];
	if (artifacts.specs) {
		parts.push(["SPEC FILES", artifacts.specs]);
	}
	parts.push(
		["DESIGN CONTENT", artifacts.design],
		["TASKS CONTENT", artifacts.tasks],
	);
	return [
		readPrompt(runtimeRoot, "review_design_rereview_prompt.md").trimEnd(),
		buildPrompt(parts),
	].join("\n\n");
}

function buildFixPrompt(
	runtimeRoot: string,
	changeStore: ChangeArtifactStore,
	changeId: string,
	findings: readonly ReviewFinding[],
): string {
	const artifacts = readDesignArtifactsFromStore(changeStore, changeId);
	if (!artifacts) {
		throw new Error("missing_artifacts");
	}
	let prefix =
		"You are a design and tasks fixer. Based on the review findings below, fix all issues in the design and task documents.\nApply fixes for all findings. Do not skip any. Modify design.md and tasks.md as needed.";
	try {
		prefix = readPrompt(runtimeRoot, "fix_design_prompt.md").trimEnd();
	} catch {
		// Keep fallback prompt.
	}
	return [
		prefix,
		buildPrompt([
			["REVIEW FINDINGS", JSON.stringify(findings)],
			["PROPOSAL CONTENT", artifacts.proposal],
			["DESIGN CONTENT", artifacts.design],
			["TASKS CONTENT", artifacts.tasks],
		]),
	].join("\n\n");
}

function reviewPayload(
	reviewJson: Record<string, unknown>,
	rereviewMode: boolean,
	parseError: boolean,
	rawResponse: string,
): ReviewPayload {
	return {
		decision: String(reviewJson.decision ?? "UNKNOWN"),
		summary: String(reviewJson.summary ?? ""),
		findings: Array.isArray(reviewJson.findings)
			? (reviewJson.findings as ReviewFinding[])
			: [],
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
	rereviewClassification: {
		resolved: string[];
		still_open: string[];
		new_findings: string[];
	} | null,
): ReviewResult {
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
		rereview_classification: rereviewClassification,
		error: null,
	};
}

function artifactHash(
	changeStore: ChangeArtifactStore,
	changeId: string,
	type: typeof ChangeArtifactType.Design | typeof ChangeArtifactType.Tasks,
): string {
	const ref = changeRef(changeId, type);
	if (!changeStore.exists(ref)) {
		return "";
	}
	return contentHash(changeStore.read(ref));
}

function runReviewPipeline(
	runtimeRoot: string,
	projectRoot: string,
	changeStore: ChangeArtifactStore,
	action: string,
	changeId: string,
	rereviewMode: boolean,
): ReviewResult {
	process.stderr.write("Reading artifacts...\n");
	if (!readDesignArtifactsFromStore(changeStore, changeId)) {
		return {
			...errorJson(action, changeId, "missing_artifacts"),
			review: null,
			ledger: null,
			autofix: null,
			handoff: null,
		};
	}

	process.stderr.write("Calling Codex for design review...\n");
	const prompt = rereviewMode
		? (() => {
				const priorLedger = readLedgerFromStore(
					changeStore,
					changeId,
					ReviewLedgerKind.Design,
				).ledger;
				const previousFindings = (priorLedger.findings ?? []).filter(
					(finding) => String(finding.status ?? "") !== "resolved",
				);
				return buildRereviewPrompt(
					runtimeRoot,
					changeStore,
					changeId,
					previousFindings,
					Number(priorLedger.max_finding_id ?? 0),
				);
			})()
		: buildReviewPrompt(runtimeRoot, changeStore, changeId);
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

	const ledgerRead = readLedgerFromStore(
		changeStore,
		changeId,
		ReviewLedgerKind.Design,
	);
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
		process.stderr.write(
			`[ledger] WARNING: Reverted high-severity findings with empty notes to 'open': ${validated.warnings.join(", ")}\n`,
		);
	}

	let rereviewClassification: {
		resolved: string[];
		still_open: string[];
		new_findings: string[];
	} | null = null;
	if (!parseError) {
		ledger = incrementRound(ledger);
		const round = Number(ledger.current_round ?? 0);
		if (rereviewMode) {
			if (reviewJson.ledger_error === true) {
				ledger = clearLedgerFindings(ledger);
			}
			ledger = matchRereview(ledger, reviewJson, round);
			ledger = applyStillOpenSeverityOverrides(
				ledger,
				reviewJson.still_open_previous_findings,
			);
			rereviewClassification = {
				resolved: Array.isArray(reviewJson.resolved_previous_findings)
					? reviewJson.resolved_previous_findings.map((value) =>
							String((value as { id?: unknown }).id ?? value),
						)
					: [],
				still_open: Array.isArray(reviewJson.still_open_previous_findings)
					? reviewJson.still_open_previous_findings.map((value) =>
							String((value as { id?: unknown }).id ?? value),
						)
					: [],
				new_findings: Array.isArray(reviewJson.new_findings)
					? (reviewJson.new_findings as ReviewFinding[]).map((finding) =>
							String(finding.id ?? ""),
						)
					: [],
			};
		} else {
			ledger = matchFindings(
				ledger,
				Array.isArray(reviewJson.findings)
					? (reviewJson.findings as ReviewFinding[])
					: [],
				round,
			);
		}
		ledger = computeSummary(ledger, round);
		ledger = computeStatus(ledger);
		ledger = persistMaxFindingId(ledger);
		writeLedgerToStore(
			changeStore,
			changeId,
			ReviewLedgerKind.Design,
			ledger,
			ledgerRead.status === "clean",
		);
		renderCurrentPhaseToStore(
			changeStore,
			changeId,
			ledger,
			"design",
			projectRoot,
		);
	}

	return resultFromLedger(
		action,
		changeId,
		reviewJson,
		rereviewMode,
		parseError,
		rawResponse,
		ledger,
		rereviewClassification,
	);
}

function runAutofixLoop(
	runtimeRoot: string,
	projectRoot: string,
	changeStore: ChangeArtifactStore,
	changeId: string,
	maxRounds: number,
): ReviewResult {
	if (!readDesignArtifactsFromStore(changeStore, changeId)) {
		return {
			...errorJson("autofix_loop", changeId, "missing_artifacts"),
			review: null,
			ledger: null,
			autofix: null,
			handoff: null,
		};
	}

	const ledgerRead = readLedgerFromStore(
		changeStore,
		changeId,
		ReviewLedgerKind.Design,
	);
	let ledger = ledgerRead.ledger;
	if (ledgerRead.status === "prompt_user") {
		process.stderr.write(
			"Warning: corrupt ledger, auto-reinitializing for autofix mode\n",
		);
		ledger = emptyLedger(changeId, "design");
	}

	let previousScore = computeScore(ledger);
	let previousNewHighCount = 0;
	let previousAllHighTitles = highFindingTitles(ledger);
	let previousResolvedHighTitles = resolvedHighFindingTitles(ledger);
	let consecutiveNoChange = 0;
	let consecutiveFailures = 0;
	let autofixRound = 0;
	let loopResult = "max_rounds_reached";
	const roundScores: AutofixRoundScore[] = [];
	const divergenceWarnings: DivergenceWarning[] = [];

	while (autofixRound < maxRounds) {
		autofixRound += 1;
		process.stderr.write(
			`Auto-fix Round ${autofixRound}/${maxRounds}: Starting design fix...\n`,
		);
		const actionableFindings = (ledger.findings ?? []).filter((finding) => {
			const status = String(finding.status ?? "");
			return status === "new" || status === "open";
		});
		const preFixHash =
			artifactHash(changeStore, changeId, ChangeArtifactType.Design) +
			artifactHash(changeStore, changeId, ChangeArtifactType.Tasks);
		const fixResult = callCodex(
			projectRoot,
			buildFixPrompt(runtimeRoot, changeStore, changeId, actionableFindings),
		);
		if (!fixResult.ok) {
			consecutiveFailures += 1;
			process.stderr.write(
				`Warning: fix step failed (consecutive failures: ${consecutiveFailures})\n`,
			);
			if (consecutiveFailures >= 3) {
				loopResult = "consecutive_failures";
				break;
			}
			continue;
		}
		const postFixHash =
			artifactHash(changeStore, changeId, ChangeArtifactType.Design) +
			artifactHash(changeStore, changeId, ChangeArtifactType.Tasks);
		if (preFixHash === postFixHash) {
			consecutiveNoChange += 1;
			process.stderr.write(
				`Warning: no artifact changes detected (consecutive: ${consecutiveNoChange})\n`,
			);
			if (consecutiveNoChange >= 2) {
				loopResult = "no_progress";
				break;
			}
		} else {
			consecutiveNoChange = 0;
		}

		const reviewResult = runReviewPipeline(
			runtimeRoot,
			projectRoot,
			changeStore,
			"fix_review",
			changeId,
			true,
		);
		if (reviewResult.status === "error" || reviewResult.review?.parse_error) {
			consecutiveFailures += 1;
			process.stderr.write(
				`Warning: re-review returned error/parse_error (consecutive failures: ${consecutiveFailures})\n`,
			);
			if (consecutiveFailures >= 3) {
				loopResult = "consecutive_failures";
				break;
			}
			continue;
		}

		consecutiveFailures = 0;
		ledger = readLedgerFromStore(
			changeStore,
			changeId,
			ReviewLedgerKind.Design,
		).ledger;
		const currentScore = computeScore(ledger);
		const unresolvedHigh = unresolvedHighCount(ledger);
		const currentAllHighTitles = highFindingTitles(ledger);
		const currentNewHighCount = currentAllHighTitles.filter(
			(title) => !previousAllHighTitles.includes(title),
		).length;
		roundScores.push({
			round: autofixRound,
			score: currentScore,
			unresolved_high: unresolvedHigh,
			new_high: currentNewHighCount,
		});

		if (unresolvedHigh === 0) {
			loopResult = "success";
			process.stderr.write(
				`Auto-fix Round ${autofixRound}: success (unresolved high = 0)\n`,
			);
			break;
		}

		if (currentScore > previousScore) {
			divergenceWarnings.push({
				round: autofixRound,
				type: "quality_gate_degradation",
				detail: `+${currentScore - previousScore}`,
			});
		}

		const currentResolvedHighTitles = resolvedHighFindingTitles(ledger);
		const newlyResolved = currentResolvedHighTitles.filter(
			(title) => !previousResolvedHighTitles.includes(title),
		);
		const unresolvedTitles = openHighFindings(ledger).map((finding) =>
			String(finding.title ?? ""),
		);
		const reemerged = newlyResolved.find((title) =>
			unresolvedTitles.some((candidate) =>
				candidate.toLowerCase().includes(title.toLowerCase()),
			),
		);
		if (reemerged) {
			divergenceWarnings.push({
				round: autofixRound,
				type: "finding_re_emergence",
				detail: reemerged,
			});
		}

		if (autofixRound >= 2 && currentNewHighCount > previousNewHighCount) {
			divergenceWarnings.push({
				round: autofixRound,
				type: "new_high_increase",
				detail: `+${currentNewHighCount - previousNewHighCount}`,
			});
		}

		previousScore = currentScore;
		previousNewHighCount = currentNewHighCount;
		previousAllHighTitles = currentAllHighTitles;
		previousResolvedHighTitles = currentResolvedHighTitles;
		process.stderr.write(
			`Auto-fix Round ${autofixRound}/${maxRounds}: unresolved_high=${unresolvedHigh}, score=${currentScore}\n`,
		);
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

function cmdReview(
	runtimeRoot: string,
	projectRoot: string,
	changeStore: ChangeArtifactStore,
	args: readonly string[],
): ReviewResult {
	const changeId = args[0];
	if (!changeId) {
		die("Usage: specflow-review-design review <CHANGE_ID> [--reset-ledger]");
	}
	const reset = args.includes("--reset-ledger");
	try {
		validateChangeFromStore(changeStore, changeId);
	} catch (error) {
		die(String((error as Error).message));
	}
	if (reset) {
		writeLedgerToStore(
			changeStore,
			changeId,
			ReviewLedgerKind.Design,
			emptyLedger(changeId, "design"),
			false,
		);
		process.stderr.write("Ledger reset to empty\n");
	}
	return runReviewPipeline(
		runtimeRoot,
		projectRoot,
		changeStore,
		"review",
		changeId,
		false,
	);
}

function cmdFixReview(
	runtimeRoot: string,
	projectRoot: string,
	changeStore: ChangeArtifactStore,
	args: readonly string[],
): ReviewResult {
	const changeId = args[0];
	if (!changeId) {
		die(
			"Usage: specflow-review-design fix-review <CHANGE_ID> [--reset-ledger] [--autofix]",
		);
	}
	const reset = args.includes("--reset-ledger");
	try {
		validateChangeFromStore(changeStore, changeId);
	} catch (error) {
		die(String((error as Error).message));
	}
	if (reset) {
		writeLedgerToStore(
			changeStore,
			changeId,
			ReviewLedgerKind.Design,
			emptyLedger(changeId, "design"),
			false,
		);
		process.stderr.write("Ledger reset to empty\n");
	}
	return runReviewPipeline(
		runtimeRoot,
		projectRoot,
		changeStore,
		"fix_review",
		changeId,
		true,
	);
}

function cmdAutofixLoop(
	runtimeRoot: string,
	projectRoot: string,
	changeStore: ChangeArtifactStore,
	args: readonly string[],
): ReviewResult {
	const changeId = args[0];
	if (!changeId) {
		die(
			"Usage: specflow-review-design autofix-loop <CHANGE_ID> [--max-rounds N]",
		);
	}
	let maxRounds = "";
	for (let index = 1; index < args.length; index += 1) {
		if (args[index] === "--max-rounds") {
			maxRounds = args[index + 1] ?? "";
			break;
		}
	}
	const config = readReviewConfig(projectRoot);
	const rounds = maxRounds ? Number(maxRounds) : config.maxAutofixRounds;
	try {
		validateChangeFromStore(changeStore, changeId);
	} catch (error) {
		die(String((error as Error).message));
	}
	return runAutofixLoop(
		runtimeRoot,
		projectRoot,
		changeStore,
		changeId,
		rounds,
	);
}

function main(): void {
	const projectRoot = ensureGitRepo();
	const runtimeRoot = moduleRepoRoot(import.meta.url);
	const changeStore = createLocalFsChangeArtifactStore(projectRoot);
	const [subcommand, ...args] = process.argv.slice(2);
	if (!subcommand) {
		process.stderr.write(`Usage: specflow-review-design <subcommand> <CHANGE_ID> [options]

Subcommands:
  review        Initial design review
  fix-review    Re-review after fixes
  autofix-loop  Auto-fix loop

`);
		process.exit(1);
	}

	let result: ReviewResult;
	switch (subcommand) {
		case "review":
			result = cmdReview(runtimeRoot, projectRoot, changeStore, args);
			break;
		case "fix-review":
			result = cmdFixReview(runtimeRoot, projectRoot, changeStore, args);
			break;
		case "autofix-loop":
			result = cmdAutofixLoop(runtimeRoot, projectRoot, changeStore, args);
			break;
		default:
			die(
				`Error: unknown subcommand '${subcommand}'. Available: review, fix-review, autofix-loop`,
			);
	}
	printSchemaJson("review-design-result", result);
}

main();
