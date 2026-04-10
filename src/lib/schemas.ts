import type {
	AnalyzeProjectResult,
	CreateSubIssueCreated,
	CreateSubIssueFailed,
	CreateSubIssueInputItem,
	CreateSubIssuesInput,
	CreateSubIssuesResult,
	DesignArtifactNextResult,
	DesignArtifactValidateResult,
	DiffSummary,
	HandoffSummary,
	InitProjectResult,
	IssueMetadata,
	LedgerCounts,
	LedgerRoundSummary,
	LedgerSeverityCounts,
	LedgerSnapshot,
	ProposalSource,
	ReviewDiffSummary,
	ReviewFinding,
	ReviewPayload,
	ReviewResult,
	RereviewClassification,
	SourceMetadata,
	RunAgents,
	RunHistoryEntry,
	RunState,
	SchemaId,
} from "../types/contracts.js";

type ValidationErrors = string[];
type SchemaValidator = (
	value: unknown,
	path: string,
	errors: ValidationErrors,
) => void;

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function push(errors: ValidationErrors, path: string, message: string): void {
	errors.push(`${path} ${message}`);
}

function expectRecord(
	value: unknown,
	path: string,
	errors: ValidationErrors,
): Record<string, unknown> | null {
	if (isRecord(value)) {
		return value;
	}
	push(errors, path, "must be an object.");
	return null;
}

function optional(
	value: unknown,
	validator: SchemaValidator,
	path: string,
	errors: ValidationErrors,
): void {
	if (value === undefined) {
		return;
	}
	validator(value, path, errors);
}

function stringValidator(
	value: unknown,
	path: string,
	errors: ValidationErrors,
): void {
	if (typeof value !== "string") {
		push(errors, path, "must be a string.");
	}
}

function nonEmptyStringValidator(
	value: unknown,
	path: string,
	errors: ValidationErrors,
): void {
	if (typeof value !== "string" || value.length === 0) {
		push(errors, path, "must be a non-empty string.");
	}
}

function numberValidator(
	value: unknown,
	path: string,
	errors: ValidationErrors,
): void {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		push(errors, path, "must be a finite number.");
	}
}

function booleanValidator(
	value: unknown,
	path: string,
	errors: ValidationErrors,
): void {
	if (typeof value !== "boolean") {
		push(errors, path, "must be a boolean.");
	}
}

function nullOrStringValidator(
	value: unknown,
	path: string,
	errors: ValidationErrors,
): void {
	if (value !== null && typeof value !== "string") {
		push(errors, path, "must be a string or null.");
	}
}

function nullOrObjectValidator(
	value: unknown,
	path: string,
	errors: ValidationErrors,
): void {
	if (value !== null && !isRecord(value)) {
		push(errors, path, "must be an object or null.");
	}
}

function stringArrayValidator(
	value: unknown,
	path: string,
	errors: ValidationErrors,
): void {
	if (!Array.isArray(value)) {
		push(errors, path, "must be an array.");
		return;
	}
	for (let index = 0; index < value.length; index += 1) {
		stringValidator(value[index], `${path}[${index}]`, errors);
	}
}

function objectArrayValidator(
	value: unknown,
	path: string,
	errors: ValidationErrors,
): void {
	if (!Array.isArray(value)) {
		push(errors, path, "must be an array.");
		return;
	}
	for (let index = 0; index < value.length; index += 1) {
		if (!isRecord(value[index])) {
			push(errors, `${path}[${index}]`, "must be an object.");
		}
	}
}

function issueMetadataValidator(
	value: unknown,
	path: string,
	errors: ValidationErrors,
): void {
	const record = expectRecord(value, path, errors);
	if (!record) {
		return;
	}
	numberValidator(record.number, `${path}.number`, errors);
	stringValidator(record.title, `${path}.title`, errors);
	stringValidator(record.url, `${path}.url`, errors);
	optional(record.body, stringValidator, `${path}.body`, errors);
	optional(record.labels, objectArrayValidator, `${path}.labels`, errors);
	optional(record.assignees, objectArrayValidator, `${path}.assignees`, errors);
	optional(record.author, nullOrObjectValidator, `${path}.author`, errors);
	optional(record.state, stringValidator, `${path}.state`, errors);
}

function sourceMetadataValidator(
	value: unknown,
	path: string,
	errors: ValidationErrors,
): void {
	const record = expectRecord(value, path, errors);
	if (!record) {
		return;
	}
	if (record.kind !== "inline" && record.kind !== "url") {
		push(errors, `${path}.kind`, "must be inline or url.");
	}
	if (
		record.provider !== null &&
		record.provider !== "generic" &&
		record.provider !== "github"
	) {
		push(errors, `${path}.provider`, "must be generic, github, or null.");
	}
	stringValidator(record.reference, `${path}.reference`, errors);
	nullOrStringValidator(record.title, `${path}.title`, errors);
}

function proposalSourceValidator(
	value: unknown,
	path: string,
	errors: ValidationErrors,
): void {
	sourceMetadataValidator(value, path, errors);
	const record = expectRecord(value, path, errors);
	if (!record) {
		return;
	}
	stringValidator(record.body, `${path}.body`, errors);
}

function diffSummaryValidator(
	value: unknown,
	path: string,
	errors: ValidationErrors,
): void {
	const record = expectRecord(value, path, errors);
	if (!record) {
		return;
	}
	if (!Array.isArray(record.excluded)) {
		push(errors, `${path}.excluded`, "must be an array.");
	} else {
		for (let index = 0; index < record.excluded.length; index += 1) {
			const item = expectRecord(
				record.excluded[index],
				`${path}.excluded[${index}]`,
				errors,
			);
			if (!item) {
				continue;
			}
			stringValidator(item.file, `${path}.excluded[${index}].file`, errors);
			stringValidator(item.reason, `${path}.excluded[${index}].reason`, errors);
			optional(
				item.new_path,
				stringValidator,
				`${path}.excluded[${index}].new_path`,
				errors,
			);
			optional(
				item.pattern,
				stringValidator,
				`${path}.excluded[${index}].pattern`,
				errors,
			);
		}
	}
	stringArrayValidator(record.warnings, `${path}.warnings`, errors);
	numberValidator(record.included_count, `${path}.included_count`, errors);
	numberValidator(record.excluded_count, `${path}.excluded_count`, errors);
	numberValidator(record.total_lines, `${path}.total_lines`, errors);
	optional(
		record.diff_warning,
		booleanValidator,
		`${path}.diff_warning`,
		errors,
	);
}

function designArtifactNextValidator(
	value: unknown,
	path: string,
	errors: ValidationErrors,
): void {
	const record = expectRecord(value, path, errors);
	if (!record) {
		return;
	}
	const status = record.status;
	if (
		status !== "ready" &&
		status !== "complete" &&
		status !== "blocked" &&
		status !== "error"
	) {
		push(
			errors,
			`${path}.status`,
			"must be ready, complete, blocked, or error.",
		);
	}
	optional(record.artifactId, stringValidator, `${path}.artifactId`, errors);
	optional(record.outputPath, stringValidator, `${path}.outputPath`, errors);
	optional(record.template, stringValidator, `${path}.template`, errors);
	optional(record.instruction, stringValidator, `${path}.instruction`, errors);
	optional(
		record.dependencies,
		objectArrayValidator,
		`${path}.dependencies`,
		errors,
	);
	optional(record.blocked, stringArrayValidator, `${path}.blocked`, errors);
	optional(record.error, stringValidator, `${path}.error`, errors);
}

function designArtifactValidateValidator(
	value: unknown,
	path: string,
	errors: ValidationErrors,
): void {
	const record = expectRecord(value, path, errors);
	if (!record) {
		return;
	}
	const status = record.status;
	if (status !== "valid" && status !== "invalid" && status !== "error") {
		push(errors, `${path}.status`, "must be valid, invalid, or error.");
	}
	optional(record.items, objectArrayValidator, `${path}.items`, errors);
	optional(record.error, stringValidator, `${path}.error`, errors);
}

function analyzeProjectValidator(
	value: unknown,
	path: string,
	errors: ValidationErrors,
): void {
	const record = expectRecord(value, path, errors);
	if (!record) {
		return;
	}
	stringValidator(record.project_name, `${path}.project_name`, errors);
	nullOrStringValidator(record.description, `${path}.description`, errors);
	stringArrayValidator(record.languages, `${path}.languages`, errors);
	stringArrayValidator(record.frameworks, `${path}.frameworks`, errors);
	nullOrStringValidator(
		record.package_manager,
		`${path}.package_manager`,
		errors,
	);
	stringArrayValidator(record.build_tools, `${path}.build_tools`, errors);
	stringArrayValidator(record.test_tools, `${path}.test_tools`, errors);
	expectRecord(record.ci, `${path}.ci`, errors);
	nullOrStringValidator(record.license, `${path}.license`, errors);
	expectRecord(record.git_remote, `${path}.git_remote`, errors);
	expectRecord(record.openspec, `${path}.openspec`, errors);
	nullOrStringValidator(
		record.existing_readme,
		`${path}.existing_readme`,
		errors,
	);
	stringValidator(record.file_structure, `${path}.file_structure`, errors);
	stringArrayValidator(record.bin_entries, `${path}.bin_entries`, errors);
	expectRecord(record.scripts, `${path}.scripts`, errors);
	stringArrayValidator(record.config_files, `${path}.config_files`, errors);
	nullOrStringValidator(record.contributing, `${path}.contributing`, errors);
	stringArrayValidator(record.keywords, `${path}.keywords`, errors);
}

function initProjectValidator(
	value: unknown,
	path: string,
	errors: ValidationErrors,
): void {
	const record = expectRecord(value, path, errors);
	if (!record) {
		return;
	}
	if (record.mode !== "init" && record.mode !== "update") {
		push(errors, `${path}.mode`, "must be init or update.");
	}
	if (record.project_name !== null && record.project_name !== undefined) {
		stringValidator(record.project_name, `${path}.project_name`, errors);
	}
	stringValidator(record.location, `${path}.location`, errors);
	optional(record.main_agent, stringValidator, `${path}.main_agent`, errors);
	optional(
		record.review_agent,
		stringValidator,
		`${path}.review_agent`,
		errors,
	);
	optional(
		record.track_claude_dir,
		booleanValidator,
		`${path}.track_claude_dir`,
		errors,
	);
	optional(
		record.openspec_initialized,
		booleanValidator,
		`${path}.openspec_initialized`,
		errors,
	);
	stringArrayValidator(record.created_files, `${path}.created_files`, errors);
	stringArrayValidator(record.updated_files, `${path}.updated_files`, errors);
	stringArrayValidator(
		record.installed_commands,
		`${path}.installed_commands`,
		errors,
	);
	stringArrayValidator(record.warnings, `${path}.warnings`, errors);
}

function reviewFindingValidator(
	value: unknown,
	path: string,
	errors: ValidationErrors,
): void {
	const record = expectRecord(value, path, errors);
	if (!record) {
		return;
	}
	optional(record.id, stringValidator, `${path}.id`, errors);
	optional(record.title, stringValidator, `${path}.title`, errors);
	optional(record.file, stringValidator, `${path}.file`, errors);
	optional(record.category, stringValidator, `${path}.category`, errors);
	optional(record.severity, stringValidator, `${path}.severity`, errors);
	optional(record.status, stringValidator, `${path}.status`, errors);
	optional(record.relation, stringValidator, `${path}.relation`, errors);
	if (record.supersedes !== undefined && record.supersedes !== null) {
		stringValidator(record.supersedes, `${path}.supersedes`, errors);
	}
	optional(record.notes, stringValidator, `${path}.notes`, errors);
	optional(
		record.origin_round,
		numberValidator,
		`${path}.origin_round`,
		errors,
	);
	optional(
		record.latest_round,
		numberValidator,
		`${path}.latest_round`,
		errors,
	);
	optional(
		record.resolved_round,
		numberValidator,
		`${path}.resolved_round`,
		errors,
	);
}

function reviewPayloadValidator(
	value: unknown,
	path: string,
	errors: ValidationErrors,
): void {
	const record = expectRecord(value, path, errors);
	if (!record) {
		return;
	}
	stringValidator(record.decision, `${path}.decision`, errors);
	stringValidator(record.summary, `${path}.summary`, errors);
	if (!Array.isArray(record.findings)) {
		push(errors, `${path}.findings`, "must be an array.");
	} else {
		for (let index = 0; index < record.findings.length; index += 1) {
			reviewFindingValidator(
				record.findings[index],
				`${path}.findings[${index}]`,
				errors,
			);
		}
	}
	booleanValidator(record.rereview_mode, `${path}.rereview_mode`, errors);
	optional(record.parse_error, booleanValidator, `${path}.parse_error`, errors);
	if (record.raw_response !== undefined && record.raw_response !== null) {
		stringValidator(record.raw_response, `${path}.raw_response`, errors);
	}
}

function ledgerCountsValidator(
	value: unknown,
	path: string,
	errors: ValidationErrors,
): void {
	const record = expectRecord(value, path, errors);
	if (!record) {
		return;
	}
	numberValidator(record.total, `${path}.total`, errors);
	numberValidator(record.open, `${path}.open`, errors);
	numberValidator(record.new, `${path}.new`, errors);
	numberValidator(record.resolved, `${path}.resolved`, errors);
	numberValidator(record.overridden, `${path}.overridden`, errors);
}

function ledgerSeverityCountsValidator(
	value: unknown,
	path: string,
	errors: ValidationErrors,
): void {
	const record = expectRecord(value, path, errors);
	if (!record) {
		return;
	}
	numberValidator(record.open, `${path}.open`, errors);
	numberValidator(record.new, `${path}.new`, errors);
	numberValidator(record.resolved, `${path}.resolved`, errors);
	numberValidator(record.overridden, `${path}.overridden`, errors);
}

function ledgerRoundSummaryValidator(
	value: unknown,
	path: string,
	errors: ValidationErrors,
): void {
	const record = expectRecord(value, path, errors);
	if (!record) {
		return;
	}
	numberValidator(record.round, `${path}.round`, errors);
	numberValidator(record.total, `${path}.total`, errors);
	numberValidator(record.open, `${path}.open`, errors);
	numberValidator(record.new, `${path}.new`, errors);
	numberValidator(record.resolved, `${path}.resolved`, errors);
	numberValidator(record.overridden, `${path}.overridden`, errors);
	const bySeverity = expectRecord(
		record.by_severity,
		`${path}.by_severity`,
		errors,
	);
	if (!bySeverity) {
		return;
	}
	for (const [key, valueItem] of Object.entries(bySeverity)) {
		numberValidator(valueItem, `${path}.by_severity.${key}`, errors);
	}
}

function ledgerSnapshotValidator(
	value: unknown,
	path: string,
	errors: ValidationErrors,
): void {
	const record = expectRecord(value, path, errors);
	if (!record) {
		return;
	}
	numberValidator(record.round, `${path}.round`, errors);
	stringValidator(record.status, `${path}.status`, errors);
	ledgerCountsValidator(record.counts, `${path}.counts`, errors);
	const bySeverity = expectRecord(
		record.by_severity,
		`${path}.by_severity`,
		errors,
	);
	if (bySeverity) {
		for (const [key, valueItem] of Object.entries(bySeverity)) {
			ledgerSeverityCountsValidator(
				valueItem,
				`${path}.by_severity.${key}`,
				errors,
			);
		}
	}
	if (!Array.isArray(record.round_summaries)) {
		push(errors, `${path}.round_summaries`, "must be an array.");
	} else {
		for (let index = 0; index < record.round_summaries.length; index += 1) {
			ledgerRoundSummaryValidator(
				record.round_summaries[index],
				`${path}.round_summaries[${index}]`,
				errors,
			);
		}
	}
}

function handoffSummaryValidator(
	value: unknown,
	path: string,
	errors: ValidationErrors,
): void {
	const record = expectRecord(value, path, errors);
	if (!record) {
		return;
	}
	stringValidator(record.state, `${path}.state`, errors);
	numberValidator(record.actionable_count, `${path}.actionable_count`, errors);
	stringValidator(record.severity_summary, `${path}.severity_summary`, errors);
}

function reviewDiffSummaryValidator(
	value: unknown,
	path: string,
	errors: ValidationErrors,
): void {
	const record = expectRecord(value, path, errors);
	if (!record) {
		return;
	}
	numberValidator(record.included_count, `${path}.included_count`, errors);
	numberValidator(record.excluded_count, `${path}.excluded_count`, errors);
	numberValidator(record.total_lines, `${path}.total_lines`, errors);
	optional(
		record.diff_warning,
		booleanValidator,
		`${path}.diff_warning`,
		errors,
	);
	optional(record.threshold, numberValidator, `${path}.threshold`, errors);
}

function rereviewClassificationValidator(
	value: unknown,
	path: string,
	errors: ValidationErrors,
): void {
	const record = expectRecord(value, path, errors);
	if (!record) {
		return;
	}
	stringArrayValidator(record.resolved, `${path}.resolved`, errors);
	stringArrayValidator(record.still_open, `${path}.still_open`, errors);
	if (!Array.isArray(record.new_findings)) {
		push(errors, `${path}.new_findings`, "must be an array.");
		return;
	}
	for (let index = 0; index < record.new_findings.length; index += 1) {
		const valueItem = record.new_findings[index];
		if (valueItem !== undefined) {
			stringValidator(valueItem, `${path}.new_findings[${index}]`, errors);
		}
	}
}

function reviewResultValidator(
	value: unknown,
	path: string,
	errors: ValidationErrors,
): void {
	const record = expectRecord(value, path, errors);
	if (!record) {
		return;
	}
	stringValidator(record.status, `${path}.status`, errors);
	stringValidator(record.action, `${path}.action`, errors);
	stringValidator(record.change_id, `${path}.change_id`, errors);
	if (record.review !== null) {
		reviewPayloadValidator(record.review, `${path}.review`, errors);
	}
	if (record.ledger !== null) {
		ledgerSnapshotValidator(record.ledger, `${path}.ledger`, errors);
	}
	if (record.autofix !== null && record.autofix !== undefined) {
		const autofix = expectRecord(record.autofix, `${path}.autofix`, errors);
		if (autofix) {
			numberValidator(
				autofix.total_rounds,
				`${path}.autofix.total_rounds`,
				errors,
			);
			stringValidator(autofix.result, `${path}.autofix.result`, errors);
			if (!Array.isArray(autofix.round_scores)) {
				push(errors, `${path}.autofix.round_scores`, "must be an array.");
			}
			if (!Array.isArray(autofix.divergence_warnings)) {
				push(
					errors,
					`${path}.autofix.divergence_warnings`,
					"must be an array.",
				);
			}
		}
	}
	if (record.handoff !== null) {
		handoffSummaryValidator(record.handoff, `${path}.handoff`, errors);
	}
	optional(
		record.diff_summary,
		reviewDiffSummaryValidator,
		`${path}.diff_summary`,
		errors,
	);
	optional(
		record.diff_total_lines,
		numberValidator,
		`${path}.diff_total_lines`,
		errors,
	);
	optional(record.warning, stringValidator, `${path}.warning`, errors);
	optional(
		record.ledger_recovery,
		stringValidator,
		`${path}.ledger_recovery`,
		errors,
	);
	if (
		record.rereview_classification !== null &&
		record.rereview_classification !== undefined
	) {
		rereviewClassificationValidator(
			record.rereview_classification,
			`${path}.rereview_classification`,
			errors,
		);
	}
	if (record.error !== undefined && record.error !== null) {
		stringValidator(record.error, `${path}.error`, errors);
	}
}

function runHistoryEntryValidator(
	value: unknown,
	path: string,
	errors: ValidationErrors,
): void {
	const record = expectRecord(value, path, errors);
	if (!record) {
		return;
	}
	stringValidator(record.from, `${path}.from`, errors);
	stringValidator(record.to, `${path}.to`, errors);
	stringValidator(record.event, `${path}.event`, errors);
	stringValidator(record.timestamp, `${path}.timestamp`, errors);
}

function runAgentsValidator(
	value: unknown,
	path: string,
	errors: ValidationErrors,
): void {
	const record = expectRecord(value, path, errors);
	if (!record) {
		return;
	}
	stringValidator(record.main, `${path}.main`, errors);
	stringValidator(record.review, `${path}.review`, errors);
}

function runStateValidator(
	value: unknown,
	path: string,
	errors: ValidationErrors,
): void {
	const record = expectRecord(value, path, errors);
	if (!record) {
		return;
	}
	stringValidator(record.run_id, `${path}.run_id`, errors);
	nullOrStringValidator(record.change_name, `${path}.change_name`, errors);
	stringValidator(record.current_phase, `${path}.current_phase`, errors);
	stringValidator(record.status, `${path}.status`, errors);
	stringArrayValidator(record.allowed_events, `${path}.allowed_events`, errors);
	if (record.source === null) {
		// ok
	} else {
		sourceMetadataValidator(record.source, `${path}.source`, errors);
	}
	stringValidator(record.project_id, `${path}.project_id`, errors);
	stringValidator(record.repo_name, `${path}.repo_name`, errors);
	stringValidator(record.repo_path, `${path}.repo_path`, errors);
	stringValidator(record.branch_name, `${path}.branch_name`, errors);
	stringValidator(record.worktree_path, `${path}.worktree_path`, errors);
	runAgentsValidator(record.agents, `${path}.agents`, errors);
	nullOrStringValidator(
		record.last_summary_path,
		`${path}.last_summary_path`,
		errors,
	);
	stringValidator(record.created_at, `${path}.created_at`, errors);
	stringValidator(record.updated_at, `${path}.updated_at`, errors);
	if (!Array.isArray(record.history)) {
		push(errors, `${path}.history`, "must be an array.");
	} else {
		for (let index = 0; index < record.history.length; index += 1) {
			runHistoryEntryValidator(
				record.history[index],
				`${path}.history[${index}]`,
				errors,
			);
		}
	}
	if (
		record.run_kind !== undefined &&
		record.run_kind !== "change" &&
		record.run_kind !== "synthetic"
	) {
		push(errors, `${path}.run_kind`, "must be change or synthetic.");
	}
}

function createSubIssueInputItemValidator(
	value: unknown,
	path: string,
	errors: ValidationErrors,
): void {
	const record = expectRecord(value, path, errors);
	if (!record) {
		return;
	}
	numberValidator(record.phase_number, `${path}.phase_number`, errors);
	nonEmptyStringValidator(record.title, `${path}.title`, errors);
	stringValidator(record.description, `${path}.description`, errors);
	stringArrayValidator(record.requirements, `${path}.requirements`, errors);
	stringArrayValidator(
		record.acceptance_criteria,
		`${path}.acceptance_criteria`,
		errors,
	);
	numberValidator(record.phase_total, `${path}.phase_total`, errors);
}

function createSubIssuesInputValidator(
	value: unknown,
	path: string,
	errors: ValidationErrors,
): void {
	const record = expectRecord(value, path, errors);
	if (!record) {
		return;
	}
	numberValidator(
		record.parent_issue_number,
		`${path}.parent_issue_number`,
		errors,
	);
	nonEmptyStringValidator(record.repo, `${path}.repo`, errors);
	nonEmptyStringValidator(
		record.run_timestamp,
		`${path}.run_timestamp`,
		errors,
	);
	if (!Array.isArray(record.sub_features) || record.sub_features.length === 0) {
		push(errors, `${path}.sub_features`, "must be a non-empty array.");
	} else {
		for (let index = 0; index < record.sub_features.length; index += 1) {
			createSubIssueInputItemValidator(
				record.sub_features[index],
				`${path}.sub_features[${index}]`,
				errors,
			);
		}
	}
	optional(
		record.skip_comment,
		booleanValidator,
		`${path}.skip_comment`,
		errors,
	);
}

function createSubIssueCreatedValidator(
	value: unknown,
	path: string,
	errors: ValidationErrors,
): void {
	const record = expectRecord(value, path, errors);
	if (!record) {
		return;
	}
	numberValidator(record.phase_number, `${path}.phase_number`, errors);
	numberValidator(record.issue_number, `${path}.issue_number`, errors);
	stringValidator(record.issue_url, `${path}.issue_url`, errors);
	stringValidator(record.title, `${path}.title`, errors);
}

function createSubIssueFailedValidator(
	value: unknown,
	path: string,
	errors: ValidationErrors,
): void {
	const record = expectRecord(value, path, errors);
	if (!record) {
		return;
	}
	numberValidator(record.phase_number, `${path}.phase_number`, errors);
	stringValidator(record.title, `${path}.title`, errors);
	stringValidator(record.error, `${path}.error`, errors);
}

function createSubIssuesResultValidator(
	value: unknown,
	path: string,
	errors: ValidationErrors,
): void {
	const record = expectRecord(value, path, errors);
	if (!record) {
		return;
	}
	if (!Array.isArray(record.created)) {
		push(errors, `${path}.created`, "must be an array.");
	} else {
		for (let index = 0; index < record.created.length; index += 1) {
			createSubIssueCreatedValidator(
				record.created[index],
				`${path}.created[${index}]`,
				errors,
			);
		}
	}
	if (!Array.isArray(record.failed)) {
		push(errors, `${path}.failed`, "must be an array.");
	} else {
		for (let index = 0; index < record.failed.length; index += 1) {
			createSubIssueFailedValidator(
				record.failed[index],
				`${path}.failed[${index}]`,
				errors,
			);
		}
	}
	booleanValidator(
		record.summary_comment_posted,
		`${path}.summary_comment_posted`,
		errors,
	);
	numberValidator(
		record.parent_issue_number,
		`${path}.parent_issue_number`,
		errors,
	);
}

export const schemaValidators: Readonly<Record<SchemaId, SchemaValidator>> = {
	"issue-metadata": issueMetadataValidator,
	"source-metadata": sourceMetadataValidator,
	"proposal-source": proposalSourceValidator,
	"diff-summary": diffSummaryValidator,
	"design-artifact-next": designArtifactNextValidator,
	"design-artifact-validate": designArtifactValidateValidator,
	"analyze-project": analyzeProjectValidator,
	"init-project": initProjectValidator,
	"review-apply-result": reviewResultValidator,
	"review-design-result": reviewResultValidator,
	"review-proposal-result": reviewResultValidator,
	"run-state": runStateValidator,
	"create-sub-issues-input": createSubIssuesInputValidator,
	"create-sub-issues-result": createSubIssuesResultValidator,
};

export function schemaIds(): readonly SchemaId[] {
	return Object.keys(schemaValidators) as SchemaId[];
}

export function validateSchemaValue(
	schemaId: SchemaId,
	value: unknown,
): readonly string[] {
	const errors: string[] = [];
	schemaValidators[schemaId](value, "$", errors);
	return errors;
}

export function assertSchemaValue<T>(
	schemaId: SchemaId,
	value: T,
	label = "payload",
): T {
	const errors = validateSchemaValue(schemaId, value);
	if (errors.length > 0) {
		throw new Error(
			`${label} does not satisfy schema '${schemaId}': ${errors.join(" ")}`,
		);
	}
	return value;
}

export function parseSchemaJson<T>(
	schemaId: SchemaId,
	raw: string,
	label = "payload",
): T {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw) as unknown;
	} catch (error) {
		throw new Error(`${label} is not valid JSON`, { cause: error });
	}
	return assertSchemaValue(schemaId, parsed as T, label);
}

export function stringifySchemaJson<T>(
	schemaId: SchemaId,
	value: T,
	options: { pretty?: boolean } = {},
): string {
	assertSchemaValue(schemaId, value, "payload");
	return options.pretty === false
		? JSON.stringify(value)
		: JSON.stringify(value, null, 2);
}

export type {
	AnalyzeProjectResult,
	CreateSubIssueCreated,
	CreateSubIssueFailed,
	CreateSubIssueInputItem,
	CreateSubIssuesInput,
	CreateSubIssuesResult,
	DesignArtifactNextResult,
	DesignArtifactValidateResult,
	DiffSummary,
	HandoffSummary,
	InitProjectResult,
	IssueMetadata,
	LedgerCounts,
	LedgerRoundSummary,
	LedgerSeverityCounts,
	LedgerSnapshot,
	ProposalSource,
	ReviewDiffSummary,
	ReviewFinding,
	ReviewPayload,
	ReviewResult,
	RereviewClassification,
	SourceMetadata,
	RunAgents,
	RunHistoryEntry,
	RunState,
};
