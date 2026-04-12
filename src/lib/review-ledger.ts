import { copyFileSync, existsSync, readFileSync, renameSync } from "node:fs";
import { basename, resolve } from "node:path";
import type {
	LedgerCounts,
	LedgerRoundSummary,
	LedgerSeverityCounts,
	LedgerSnapshot,
	ReviewFinding,
	ReviewFindingStatus,
	ReviewLedger,
} from "../types/contracts.js";
import { atomicWriteText } from "./fs.js";
import { parseJson } from "./json.js";

export type LedgerReadStatus = "new" | "recovered" | "prompt_user" | "clean";

export interface LedgerConfig {
	readonly filename: string;
	readonly defaultPhase: string;
}

export interface LedgerReadResult {
	readonly ledger: ReviewLedger;
	readonly status: LedgerReadStatus;
}

export interface ProposalRoundMetadata {
	readonly decision?: string;
	readonly proposalHash?: string;
	readonly blockingCount?: number;
	readonly blockingSignature?: string;
	readonly stagnantRounds?: number;
	readonly maxRounds?: number;
	readonly stopReason?: string | null;
}

function findingStatus(finding: ReviewFinding): ReviewFindingStatus {
	return String(finding.status ?? "");
}

function findingSeverity(finding: ReviewFinding): string {
	return String(finding.severity ?? "");
}

function findingId(finding: ReviewFinding): string {
	return String(finding.id ?? "");
}

function normalizeFindings(input: unknown): ReviewFinding[] {
	if (!Array.isArray(input)) {
		return [];
	}
	return input.filter(
		(item) => item && typeof item === "object",
	) as ReviewFinding[];
}

function ledgerPath(changeDir: string, config: LedgerConfig): string {
	return resolve(changeDir, config.filename);
}

function ledgerBackupPath(changeDir: string, config: LedgerConfig): string {
	return resolve(changeDir, `${config.filename}.bak`);
}

function ledgerCorruptPath(changeDir: string, config: LedgerConfig): string {
	return resolve(changeDir, `${config.filename}.corrupt`);
}

export function featureIdFromDir(changeDir: string): string {
	return basename(changeDir);
}

export function emptyLedger(featureId: string, phase: string): ReviewLedger {
	return {
		feature_id: featureId,
		phase,
		current_round: 0,
		status: "all_resolved",
		max_finding_id: 0,
		findings: [],
		round_summaries: [],
	};
}

export function readLedger(
	changeDir: string,
	config: LedgerConfig,
): LedgerReadResult {
	const featureId = featureIdFromDir(changeDir);
	const path = ledgerPath(changeDir, config);
	const backupPath = ledgerBackupPath(changeDir, config);
	const corruptPath = ledgerCorruptPath(changeDir, config);

	if (!existsSync(path)) {
		return {
			ledger: emptyLedger(featureId, config.defaultPhase),
			status: "new",
		};
	}

	try {
		return {
			ledger: parseJson<ReviewLedger>(
				readFileSync(path, "utf8"),
				config.filename,
			),
			status: "clean",
		};
	} catch {
		renameSync(path, corruptPath);
	}

	if (existsSync(backupPath)) {
		try {
			return {
				ledger: parseJson<ReviewLedger>(
					readFileSync(backupPath, "utf8"),
					`${config.filename}.bak`,
				),
				status: "recovered",
			};
		} catch {
			// Fall through to prompt_user.
		}
	}

	return {
		ledger: emptyLedger(featureId, config.defaultPhase),
		status: "prompt_user",
	};
}

function cloneFinding<T extends ReviewFinding>(finding: T): T {
	return { ...finding };
}

function isOverride(finding: ReviewFinding): boolean {
	const status = findingStatus(finding);
	return status === "accepted_risk" || status === "ignored";
}

function isActive(finding: ReviewFinding): boolean {
	const status = findingStatus(finding);
	return status === "open" || status === "new";
}

function findingMatches(
	left: ReviewFinding,
	right: ReviewFinding,
	exactSeverity: boolean,
): boolean {
	if (String(left.file ?? "") !== String(right.file ?? "")) {
		return false;
	}
	if (String(left.category ?? "") !== String(right.category ?? "")) {
		return false;
	}
	return exactSeverity
		? findingSeverity(left) === findingSeverity(right)
		: findingSeverity(left) !== findingSeverity(right);
}

function nextFindingId(round: number, seq: number): string {
	return `R${round}-F${String(seq).padStart(2, "0")}`;
}

function makeNewFinding(
	finding: ReviewFinding,
	round: number,
	seq: number,
	status: "new" | "open",
	relation: string,
	supersedes: string | null,
): ReviewFinding {
	return {
		...finding,
		id: nextFindingId(round, seq),
		origin_round: round,
		latest_round: round,
		status,
		relation,
		supersedes,
		notes: "",
	};
}

export function validateLedger(ledger: ReviewLedger): {
	ledger: ReviewLedger;
	warnings: string[];
} {
	const warnings: string[] = [];
	const findings = normalizeFindings(ledger.findings).map((finding) => {
		const severity = findingSeverity(finding);
		const status = findingStatus(finding);
		const notes = String(finding.notes ?? "");
		if (
			severity === "high" &&
			(status === "accepted_risk" || status === "ignored") &&
			notes.replace(/\s/g, "").length === 0
		) {
			warnings.push(findingId(finding));
			return {
				...finding,
				status: "open",
			};
		}
		return cloneFinding(finding);
	});

	return {
		ledger: {
			...ledger,
			findings,
		},
		warnings,
	};
}

export function incrementRound(ledger: ReviewLedger): ReviewLedger {
	return {
		...ledger,
		current_round: Number(ledger.current_round ?? 0) + 1,
	};
}

export function matchFindings(
	ledger: ReviewLedger,
	codexFindings: readonly ReviewFinding[],
	currentRound: number,
): ReviewLedger {
	const codex = normalizeFindings(codexFindings);
	const existing = normalizeFindings(ledger.findings);

	if (codex.length === 0) {
		return {
			...ledger,
			findings: existing.map((finding) => {
				if (!isActive(finding)) {
					return cloneFinding(finding);
				}
				return {
					...finding,
					status: "resolved",
					resolved_round: currentRound,
				};
			}),
		};
	}

	const active = existing.filter(isActive);
	const overrides = existing.filter(isOverride);
	const others = existing.filter(
		(finding) => !isActive(finding) && !isOverride(finding),
	);

	const matchedCodex = new Set<number>();
	const matchedExisting = new Set<string>();
	const step1Results: ReviewFinding[] = [];

	for (const [index, finding] of codex.entries()) {
		const match = [...active, ...overrides].find((candidate) => {
			const id = findingId(candidate);
			return (
				id.length > 0 &&
				!matchedExisting.has(id) &&
				findingMatches(candidate, finding, true)
			);
		});
		if (!match) {
			continue;
		}
		matchedCodex.add(index);
		matchedExisting.add(findingId(match));
		if (isOverride(match)) {
			step1Results.push({
				...match,
				relation: "same",
				latest_round: currentRound,
			});
			continue;
		}
		step1Results.push({
			...match,
			status: "open",
			relation: "same",
			latest_round: currentRound,
		});
	}

	const matchedExistingStep2 = new Set<string>();
	const step2Resolved: ReviewFinding[] = [];
	const step2New: ReviewFinding[] = [];
	let seq = 1;

	for (const [index, finding] of codex.entries()) {
		if (matchedCodex.has(index)) {
			continue;
		}
		const match = [...active, ...overrides].find((candidate) => {
			const id = findingId(candidate);
			return (
				id.length > 0 &&
				!matchedExisting.has(id) &&
				!matchedExistingStep2.has(id) &&
				findingMatches(candidate, finding, false)
			);
		});
		if (!match) {
			continue;
		}
		matchedExistingStep2.add(findingId(match));
		matchedCodex.add(index);
		step2Resolved.push({
			...match,
			status: "resolved",
			latest_round: currentRound,
			relation: "reframed",
		});
		step2New.push(
			makeNewFinding(
				finding,
				currentRound,
				seq,
				"open",
				"reframed",
				findingId(match),
			),
		);
		seq += 1;
	}

	const allMatchedIds = new Set([...matchedExisting, ...matchedExistingStep2]);
	const step3New: ReviewFinding[] = [];
	for (const [index, finding] of codex.entries()) {
		if (matchedCodex.has(index)) {
			continue;
		}
		step3New.push(
			makeNewFinding(finding, currentRound, seq, "new", "new", null),
		);
		seq += 1;
	}

	const step3Resolved = active
		.filter((finding) => !allMatchedIds.has(findingId(finding)))
		.map((finding) => ({
			...finding,
			status: "resolved",
		}));

	const step3Preserved = overrides
		.filter((finding) => !allMatchedIds.has(findingId(finding)))
		.map(cloneFinding);

	return {
		...ledger,
		findings: [
			...step1Results,
			...step2Resolved,
			...step2New,
			...step3New,
			...step3Resolved,
			...step3Preserved,
			...others.map(cloneFinding),
		],
	};
}

function normalizeReferenceIds(values: unknown): string[] {
	if (!Array.isArray(values)) {
		return [];
	}
	return values
		.map((value) => {
			if (value && typeof value === "object" && "id" in value) {
				return String((value as { id?: unknown }).id ?? "");
			}
			return String(value ?? "");
		})
		.filter((value) => value.length > 0);
}

export function matchRereview(
	ledger: ReviewLedger,
	response: Record<string, unknown>,
	currentRound: number,
): ReviewLedger {
	const resolvedIds = normalizeReferenceIds(
		response.resolved_previous_findings,
	);
	const stillOpenIds = normalizeReferenceIds(
		response.still_open_previous_findings,
	);
	const newFindings = normalizeFindings(response.new_findings);
	const priorIds = normalizeFindings(ledger.findings)
		.filter((finding) => findingStatus(finding) !== "resolved")
		.map((finding) => findingId(finding));
	const cleanResolved = resolvedIds.filter((id) => !stillOpenIds.includes(id));
	const missingIds = priorIds.filter(
		(id) => !cleanResolved.includes(id) && !stillOpenIds.includes(id),
	);
	const finalStillOpen = [...stillOpenIds, ...missingIds];

	const findings = normalizeFindings(ledger.findings).map((finding) => {
		const id = findingId(finding);
		if (cleanResolved.includes(id)) {
			if (isOverride(finding)) {
				return cloneFinding(finding);
			}
			return {
				...finding,
				status: "resolved",
				resolved_round: currentRound,
			};
		}
		if (finalStillOpen.includes(id)) {
			if (isOverride(finding)) {
				return cloneFinding(finding);
			}
			return {
				...finding,
				status: "open",
			};
		}
		return cloneFinding(finding);
	});

	let seq = Number(ledger.max_finding_id ?? 0) + 1;
	const appended = newFindings.map((finding) => {
		const next = makeNewFinding(finding, currentRound, seq, "new", "new", null);
		seq += 1;
		return next;
	});

	return {
		...ledger,
		findings: [...findings, ...appended],
	};
}

export function applyStillOpenSeverityOverrides(
	ledger: ReviewLedger,
	values: unknown,
): ReviewLedger {
	if (!Array.isArray(values)) {
		return ledger;
	}
	const severityById = new Map<string, string>();
	for (const value of values) {
		if (!value || typeof value !== "object") {
			continue;
		}
		const id = String((value as { id?: unknown }).id ?? "");
		const severity = (value as { severity?: unknown }).severity;
		if (!id || severity == null) {
			continue;
		}
		severityById.set(id, String(severity));
	}

	return {
		...ledger,
		findings: normalizeFindings(ledger.findings).map((finding) => {
			const severity = severityById.get(findingId(finding));
			if (!severity) {
				return cloneFinding(finding);
			}
			return {
				...finding,
				severity,
			};
		}),
	};
}

export function clearLedgerFindings(ledger: ReviewLedger): ReviewLedger {
	return {
		...ledger,
		findings: [],
	};
}

export function setProposalReviewMetadata(
	ledger: ReviewLedger,
	metadata: ProposalRoundMetadata,
): ReviewLedger {
	const stopReason =
		metadata.stopReason === undefined
			? ledger.stop_reason
			: metadata.stopReason;
	return {
		...ledger,
		latest_decision:
			metadata.decision === undefined
				? ledger.latest_decision
				: metadata.decision,
		proposal_hash:
			metadata.proposalHash === undefined
				? ledger.proposal_hash
				: metadata.proposalHash,
		blocking_count:
			metadata.blockingCount === undefined
				? ledger.blocking_count
				: metadata.blockingCount,
		blocking_signature:
			metadata.blockingSignature === undefined
				? ledger.blocking_signature
				: metadata.blockingSignature,
		stagnant_rounds:
			metadata.stagnantRounds === undefined
				? ledger.stagnant_rounds
				: metadata.stagnantRounds,
		max_rounds:
			metadata.maxRounds === undefined ? ledger.max_rounds : metadata.maxRounds,
		stop_reason: stopReason,
	};
}

export function computeSummary(
	ledger: ReviewLedger,
	currentRound: number,
	metadata: ProposalRoundMetadata = {},
): ReviewLedger {
	const findings = normalizeFindings(ledger.findings);
	const actionable = findings.filter((finding) => {
		const status = findingStatus(finding);
		return status === "open" || status === "new";
	});
	const bySeverity: Record<string, number> = {};
	for (const finding of actionable) {
		const severity = findingSeverity(finding) || "unknown";
		bySeverity[severity] = (bySeverity[severity] ?? 0) + 1;
	}
	const summary: LedgerRoundSummary = {
		round: currentRound,
		total: findings.length,
		open: actionable.length,
		new: findings.filter((finding) => findingStatus(finding) === "new").length,
		resolved: findings.filter(
			(finding) => findingStatus(finding) === "resolved",
		).length,
		overridden: findings.filter((finding) => isOverride(finding)).length,
		by_severity: bySeverity,
		...(metadata.decision !== undefined ? { decision: metadata.decision } : {}),
		...(metadata.proposalHash !== undefined
			? { proposal_hash: metadata.proposalHash }
			: {}),
		...(metadata.blockingCount !== undefined
			? { blocking_count: metadata.blockingCount }
			: {}),
		...(metadata.blockingSignature !== undefined
			? { blocking_signature: metadata.blockingSignature }
			: {}),
		...(metadata.stagnantRounds !== undefined
			? { stagnant_rounds: metadata.stagnantRounds }
			: {}),
		...(metadata.maxRounds !== undefined
			? { max_rounds: metadata.maxRounds }
			: {}),
		...(metadata.stopReason !== undefined
			? { stop_reason: metadata.stopReason }
			: {}),
	};
	return setProposalReviewMetadata(
		{
			...ledger,
			round_summaries: [...(ledger.round_summaries ?? []), summary],
		},
		metadata,
	);
}

export function computeStatus(ledger: ReviewLedger): ReviewLedger {
	const findings = normalizeFindings(ledger.findings);
	const hasOpenHigh = findings.some((finding) => {
		const severity = findingSeverity(finding);
		const status = findingStatus(finding);
		return (
			severity === "high" &&
			(status === "open" ||
				status === "new" ||
				status === "accepted_risk" ||
				status === "ignored")
		);
	});
	const allResolved = findings.every(
		(finding) => findingStatus(finding) === "resolved",
	);
	return {
		...ledger,
		status: hasOpenHigh
			? "has_open_high"
			: allResolved
				? "all_resolved"
				: "in_progress",
	};
}

export function computeScore(ledger: ReviewLedger): number {
	return normalizeFindings(ledger.findings)
		.filter((finding) => findingStatus(finding) !== "resolved")
		.reduce((total, finding) => {
			const severity = findingSeverity(finding);
			if (severity === "high") {
				return total + 3;
			}
			if (severity === "medium") {
				return total + 2;
			}
			if (severity === "low") {
				return total + 1;
			}
			return total;
		}, 0);
}

export function persistMaxFindingId(ledger: ReviewLedger): ReviewLedger {
	const maxFindingId = normalizeFindings(ledger.findings)
		.map((finding) => {
			const match = findingId(finding).match(/F0*([0-9]+)$/);
			return match ? Number(match[1]) : 0;
		})
		.reduce((max, value) => Math.max(max, value), 0);
	return {
		...ledger,
		max_finding_id: maxFindingId,
	};
}

export function backupAndWriteLedger(
	changeDir: string,
	ledger: ReviewLedger,
	config: LedgerConfig,
	cleanRead: boolean,
): void {
	const path = ledgerPath(changeDir, config);
	const backupPath = ledgerBackupPath(changeDir, config);
	if (cleanRead && existsSync(path)) {
		copyFileSync(path, backupPath);
	}
	atomicWriteText(path, `${JSON.stringify(ledger, null, 2)}\n`);
}

export function actionableCount(ledger: ReviewLedger): number {
	return normalizeFindings(ledger.findings).filter((finding) => {
		const status = findingStatus(finding);
		return status === "new" || status === "open";
	}).length;
}

export function severitySummary(ledger: ReviewLedger): string {
	const counts = new Map<string, number>();
	for (const finding of normalizeFindings(ledger.findings)) {
		const status = findingStatus(finding);
		if (status !== "new" && status !== "open") {
			continue;
		}
		const key = (findingSeverity(finding) || "unknown").toUpperCase();
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	const order = ["HIGH", "MEDIUM", "LOW"];
	const entries = [...counts.entries()].sort(([left], [right]) => {
		const leftIndex = order.indexOf(left);
		const rightIndex = order.indexOf(right);
		const leftRank = leftIndex === -1 ? order.length : leftIndex;
		const rightRank = rightIndex === -1 ? order.length : rightIndex;
		return leftRank - rightRank || left.localeCompare(right);
	});
	return entries
		.filter(([, count]) => count > 0)
		.map(([severity, count]) => `${severity}: ${count}`)
		.join(", ");
}

export function ledgerCounts(ledger: ReviewLedger): LedgerCounts {
	const findings = normalizeFindings(ledger.findings);
	return {
		total: findings.length,
		open: findings.filter((finding) => findingStatus(finding) === "open")
			.length,
		new: findings.filter((finding) => findingStatus(finding) === "new").length,
		resolved: findings.filter(
			(finding) => findingStatus(finding) === "resolved",
		).length,
		overridden: findings.filter((finding) => isOverride(finding)).length,
	};
}

function countBySeverity(
	findings: readonly ReviewFinding[],
	severity: string,
): LedgerSeverityCounts {
	const scoped = findings.filter(
		(finding) => findingSeverity(finding) === severity,
	);
	return {
		open: scoped.filter((finding) => findingStatus(finding) === "open").length,
		new: scoped.filter((finding) => findingStatus(finding) === "new").length,
		resolved: scoped.filter((finding) => findingStatus(finding) === "resolved")
			.length,
		overridden: scoped.filter((finding) => isOverride(finding)).length,
	};
}

export function ledgerBySeverity(
	ledger: ReviewLedger,
): Record<string, LedgerSeverityCounts> {
	const findings = normalizeFindings(ledger.findings);
	return {
		high: countBySeverity(findings, "high"),
		medium: countBySeverity(findings, "medium"),
		low: countBySeverity(findings, "low"),
	};
}

export function ledgerSnapshot(ledger: ReviewLedger): LedgerSnapshot {
	return {
		round: Number(ledger.current_round ?? 0),
		status: String(ledger.status ?? "in_progress"),
		counts: ledgerCounts(ledger),
		by_severity: ledgerBySeverity(ledger),
		round_summaries: [...(ledger.round_summaries ?? [])],
	};
}

export function openHighFindings(ledger: ReviewLedger): ReviewFinding[] {
	return normalizeFindings(ledger.findings).filter((finding) => {
		const status = findingStatus(finding);
		return (
			findingSeverity(finding) === "high" &&
			(status === "new" || status === "open")
		);
	});
}

export function highFindingTitles(ledger: ReviewLedger): string[] {
	return normalizeFindings(ledger.findings)
		.filter((finding) => findingSeverity(finding) === "high")
		.map((finding) => String(finding.title ?? ""));
}

export function resolvedHighFindingTitles(ledger: ReviewLedger): string[] {
	return normalizeFindings(ledger.findings)
		.filter(
			(finding) =>
				findingSeverity(finding) === "high" &&
				findingStatus(finding) === "resolved",
		)
		.map((finding) => String(finding.title ?? ""));
}

export function acceptedRiskSummary(ledger: ReviewLedger): string {
	const values = normalizeFindings(ledger.findings)
		.filter((finding) => isOverride(finding))
		.map(
			(finding) =>
				`${String(finding.title ?? "")} (${findingStatus(finding)}, notes: "${String(finding.notes ?? "")}")`,
		);
	return values.length === 0 ? "none" : values.join("\n");
}

export function reemergedFindingTitle(
	newlyResolved: readonly string[],
	unresolvedHigh: readonly string[],
): string | null {
	const unresolved = unresolvedHigh.map((value) => value.toLowerCase());
	for (const value of newlyResolved) {
		const lower = value.toLowerCase();
		if (unresolved.some((candidate) => candidate.includes(lower))) {
			return value;
		}
	}
	return null;
}
