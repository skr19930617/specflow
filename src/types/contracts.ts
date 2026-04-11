export const AssetType = {
	Command: "command",
	Prompt: "prompt",
	Orchestrator: "orchestrator",
	Workflow: "workflow",
	Template: "template",
	InstallerAsset: "installerAsset",
} as const;

export type AssetType = (typeof AssetType)[keyof typeof AssetType];

export interface ValidationError {
	readonly id: string;
	readonly type: AssetType | "contract";
	readonly message: string;
	readonly filePath: string;
	readonly check: string;
}

export interface CommandHook {
	readonly title: string;
	readonly description: string;
	readonly shell: string;
}

export interface CommandSection {
	readonly title: string | null;
	readonly content: string;
}

export interface CommandBody {
	readonly frontmatter: Readonly<Record<string, string>>;
	readonly sections: readonly CommandSection[];
}

export interface CommandContract {
	readonly id: string;
	readonly type: typeof AssetType.Command;
	readonly description: string;
	readonly slashCommandName: `/${string}`;
	readonly filePath: string;
	readonly acceptedArguments: string;
	readonly references: readonly string[];
	readonly runHooks: readonly CommandHook[];
	readonly body: CommandBody;
}

export interface PromptContract {
	readonly id: string;
	readonly type: typeof AssetType.Prompt;
	readonly filePath: string;
	readonly sourcePath: string;
	readonly outputExample?: PromptTemplateValue;
	readonly references: readonly string[];
}

export interface OrchestratorContract {
	readonly id: string;
	readonly type: typeof AssetType.Orchestrator;
	readonly filePath: string;
	readonly entryModule: string;
	readonly stdinSchemaId?: SchemaId;
	readonly stdoutSchemaId?: SchemaId;
	readonly stderrSchemaId?: SchemaId;
	readonly references: readonly string[];
}

export interface WorkflowTransition {
	readonly from: string;
	readonly event: string;
	readonly to: string;
}

export interface WorkflowContract {
	readonly id: string;
	readonly type: typeof AssetType.Workflow;
	readonly filePath: string;
	readonly version: string;
	readonly states: readonly string[];
	readonly events: readonly string[];
	readonly transitions: readonly WorkflowTransition[];
}

export interface TemplateAssetContract {
	readonly id: string;
	readonly type: typeof AssetType.Template;
	readonly filePath: string;
	readonly sourcePath: string;
}

export interface InstallLinkContract {
	readonly id: string;
	readonly type: typeof AssetType.InstallerAsset;
	readonly targetPath: string;
	readonly sourcePath: string;
}

export interface InstallCopyContract {
	readonly id: string;
	readonly type: typeof AssetType.InstallerAsset;
	readonly sourcePath: string;
	readonly targetPath: string;
	readonly sourceKind: "file" | "directory";
}

export interface InstallSettingsMergeContract {
	readonly id: string;
	readonly type: typeof AssetType.InstallerAsset;
	readonly sourcePath: string;
	readonly targetPath: string;
}

export interface ContractsBundle {
	readonly commands: readonly CommandContract[];
	readonly prompts: readonly PromptContract[];
	readonly orchestrators: readonly OrchestratorContract[];
	readonly workflow: WorkflowContract;
	readonly templates: readonly TemplateAssetContract[];
	readonly installCopies: readonly InstallCopyContract[];
	readonly installLinks: readonly InstallLinkContract[];
	readonly installSettingsMerge: InstallSettingsMergeContract;
}

export interface ManifestEntry {
	readonly id: string;
	readonly type: AssetType;
	readonly filePath: string;
	readonly references: readonly string[];
}

export interface Manifest {
	readonly commands: readonly ManifestEntry[];
	readonly prompts: readonly ManifestEntry[];
	readonly orchestrators: readonly ManifestEntry[];
	readonly workflows: readonly ManifestEntry[];
	readonly templates: readonly ManifestEntry[];
	readonly installerAssets: readonly ManifestEntry[];
	readonly metadata: {
		readonly generatedAt: string;
		readonly gitCommit: string;
		readonly registryVersion: string;
	};
}

export interface InstallPlan {
	readonly copies: readonly InstallCopyContract[];
	readonly links: readonly InstallLinkContract[];
	readonly settingsMerge: InstallSettingsMergeContract;
}

export interface PromptRawValue {
	readonly kind: "raw";
	readonly value: string;
}

export type PromptTemplateValue =
	| string
	| number
	| boolean
	| null
	| PromptRawValue
	| readonly PromptTemplateValue[]
	| { readonly [key: string]: PromptTemplateValue };

export type SchemaId =
	| "issue-metadata"
	| "source-metadata"
	| "proposal-source"
	| "diff-summary"
	| "design-artifact-next"
	| "design-artifact-validate"
	| "analyze-project"
	| "init-project"
	| "review-apply-result"
	| "review-design-result"
	| "review-proposal-result"
	| "run-state"
	| "create-sub-issues-input"
	| "create-sub-issues-result"
	| "profile";

export type ReviewSeverity = "high" | "medium" | "low" | string;
export type ReviewFindingStatus =
	| "new"
	| "open"
	| "resolved"
	| "accepted_risk"
	| "ignored"
	| string;

export interface JsonMap {
	readonly [key: string]: unknown;
}

export interface IssueMetadata extends JsonMap {
	readonly number: number;
	readonly title: string;
	readonly body?: string;
	readonly url: string;
	readonly labels?: readonly JsonMap[];
	readonly assignees?: readonly JsonMap[];
	readonly author?: JsonMap | null;
	readonly state?: string;
}

export type SourceKind = "inline" | "url";
export type SourceProvider = "generic" | "github";

export interface SourceMetadata extends JsonMap {
	readonly kind: SourceKind;
	readonly provider: SourceProvider | null;
	readonly reference: string;
	readonly title: string | null;
}

export interface ProposalSource extends SourceMetadata {
	readonly body: string;
}

export type RunKind = "change" | "synthetic";

export interface RunHistoryEntry extends JsonMap {
	readonly from: string;
	readonly to: string;
	readonly event: string;
	readonly timestamp: string;
}

export interface RunAgents extends JsonMap {
	readonly main: string;
	readonly review: string;
}

export interface RunState extends JsonMap {
	readonly run_id: string;
	readonly change_name: string | null;
	readonly current_phase: string;
	readonly status: string;
	readonly allowed_events: readonly string[];
	readonly source: SourceMetadata | null;
	readonly project_id: string;
	readonly repo_name: string;
	readonly repo_path: string;
	readonly branch_name: string;
	readonly worktree_path: string;
	readonly agents: RunAgents;
	readonly last_summary_path: string | null;
	readonly created_at: string;
	readonly updated_at: string;
	readonly history: readonly RunHistoryEntry[];
	readonly run_kind?: RunKind;
}

export interface DiffExcludedEntry extends JsonMap {
	readonly file: string;
	readonly reason: string;
	readonly new_path?: string;
	readonly pattern?: string;
}

export interface DiffSummary extends JsonMap {
	readonly excluded: readonly DiffExcludedEntry[];
	readonly warnings: readonly string[];
	readonly included_count: number;
	readonly excluded_count: number;
	readonly total_lines: number;
	readonly diff_warning?: boolean;
}

export interface ReviewDiffSummary extends JsonMap {
	readonly included_count: number;
	readonly excluded_count: number;
	readonly total_lines: number;
	readonly diff_warning?: boolean;
	readonly threshold?: number;
}

export interface ReviewFinding extends JsonMap {
	readonly id?: string;
	readonly title?: string;
	readonly file?: string;
	readonly category?: string;
	readonly severity?: ReviewSeverity;
	readonly status?: ReviewFindingStatus;
	readonly relation?: string;
	readonly supersedes?: string | null;
	readonly notes?: string;
	readonly origin_round?: number;
	readonly latest_round?: number;
	readonly resolved_round?: number;
}

export interface LedgerRoundSummary extends JsonMap {
	readonly round: number;
	readonly total: number;
	readonly open: number;
	readonly new: number;
	readonly resolved: number;
	readonly overridden: number;
	readonly by_severity: Readonly<Record<string, number>>;
}

export interface ReviewLedger extends JsonMap {
	readonly feature_id: string;
	readonly phase: string;
	readonly current_round: number;
	readonly status: string;
	readonly max_finding_id: number;
	readonly findings: readonly ReviewFinding[];
	readonly round_summaries: readonly LedgerRoundSummary[];
}

export interface ReviewPayload extends JsonMap {
	readonly decision: string;
	readonly summary: string;
	readonly findings: readonly ReviewFinding[];
	readonly rereview_mode: boolean;
	readonly parse_error?: boolean;
	readonly raw_response?: string | null;
}

export interface LedgerCounts extends JsonMap {
	readonly total: number;
	readonly open: number;
	readonly new: number;
	readonly resolved: number;
	readonly overridden: number;
}

export interface LedgerSeverityCounts extends JsonMap {
	readonly open: number;
	readonly new: number;
	readonly resolved: number;
	readonly overridden: number;
}

export interface LedgerSnapshot extends JsonMap {
	readonly round: number;
	readonly status: string;
	readonly counts: LedgerCounts;
	readonly by_severity: Readonly<Record<string, LedgerSeverityCounts>>;
	readonly round_summaries: readonly LedgerRoundSummary[];
}

export interface HandoffSummary extends JsonMap {
	readonly state: string;
	readonly actionable_count: number;
	readonly severity_summary: string;
}

export interface AutofixRoundScore extends JsonMap {
	readonly round: number;
	readonly score: number;
	readonly unresolved_high: number;
	readonly new_high: number;
}

export interface DivergenceWarning extends JsonMap {
	readonly round: number;
	readonly type: string;
	readonly detail: string;
}

export interface AutofixSummary extends JsonMap {
	readonly total_rounds: number;
	readonly result: string;
	readonly round_scores: readonly AutofixRoundScore[];
	readonly divergence_warnings: readonly DivergenceWarning[];
}

export interface RereviewClassification extends JsonMap {
	readonly resolved: readonly string[];
	readonly still_open: readonly string[];
	readonly new_findings: readonly (string | undefined)[];
}

export interface ReviewResult extends JsonMap {
	readonly status: string;
	readonly action: string;
	readonly change_id: string;
	readonly review: ReviewPayload | null;
	readonly ledger: LedgerSnapshot | null;
	readonly autofix: AutofixSummary | null;
	readonly handoff: HandoffSummary | null;
	readonly diff_summary?: ReviewDiffSummary;
	readonly diff_total_lines?: number;
	readonly warning?: string;
	readonly ledger_recovery?: string;
	readonly rereview_classification?: RereviewClassification | null;
	readonly error?: string | null;
}

export interface DesignArtifactNextResult extends JsonMap {
	readonly status: "ready" | "complete" | "blocked" | "error";
	readonly artifactId?: string;
	readonly outputPath?: string;
	readonly template?: string;
	readonly instruction?: string;
	readonly dependencies?: readonly JsonMap[];
	readonly blocked?: readonly string[];
	readonly error?: string;
}

export interface DesignArtifactValidateResult extends JsonMap {
	readonly status: "valid" | "invalid" | "error";
	readonly items?: readonly JsonMap[];
	readonly error?: string;
}

export interface AnalyzeProjectResult extends JsonMap {
	readonly project_name: string;
	readonly description: string | null;
	readonly languages: readonly string[];
	readonly frameworks: readonly string[];
	readonly package_manager: string | null;
	readonly build_tools: readonly string[];
	readonly test_tools: readonly string[];
	readonly ci: JsonMap;
	readonly license: string | null;
	readonly git_remote: JsonMap;
	readonly openspec: JsonMap;
	readonly existing_readme: string | null;
	readonly file_structure: string;
	readonly bin_entries: readonly string[];
	readonly scripts: JsonMap;
	readonly config_files: readonly string[];
	readonly contributing: string | null;
	readonly keywords: readonly string[];
}

export interface InitProjectResult extends JsonMap {
	readonly mode: "init" | "update";
	readonly project_name: string | null;
	readonly location: string;
	readonly main_agent?: string;
	readonly review_agent?: string;
	readonly track_claude_dir?: boolean;
	readonly openspec_initialized?: boolean;
	readonly created_files: readonly string[];
	readonly updated_files: readonly string[];
	readonly installed_commands: readonly string[];
	readonly warnings: readonly string[];
}

export interface CreateSubIssueCreated extends JsonMap {
	readonly phase_number: number;
	readonly issue_number: number;
	readonly issue_url: string;
	readonly title: string;
}

export interface CreateSubIssueFailed extends JsonMap {
	readonly phase_number: number;
	readonly title: string;
	readonly error: string;
}

export interface CreateSubIssueInputItem extends JsonMap {
	readonly phase_number: number;
	readonly title: string;
	readonly description: string;
	readonly requirements: readonly string[];
	readonly acceptance_criteria: readonly string[];
	readonly phase_total: number;
}

export interface CreateSubIssuesInput extends JsonMap {
	readonly parent_issue_number: number;
	readonly repo: string;
	readonly run_timestamp: string;
	readonly sub_features: readonly CreateSubIssueInputItem[];
	readonly skip_comment?: boolean;
}

export interface CreateSubIssuesResult extends JsonMap {
	readonly created: readonly CreateSubIssueCreated[];
	readonly failed: readonly CreateSubIssueFailed[];
	readonly summary_comment_posted: boolean;
	readonly parent_issue_number: number;
}
