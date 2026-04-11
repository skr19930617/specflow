import {
	AssetType,
	type CommandContract,
	type CommandHook,
} from "../types/contracts.js";
import { commandBodies } from "./command-bodies.js";

function hook(title: string, description: string, shell: string): CommandHook {
	return { title, description, shell };
}

function command(
	id: string,
	description: string,
	references: readonly string[],
	runHooks: readonly CommandHook[] = [],
): CommandContract {
	return {
		id,
		type: AssetType.Command,
		description,
		slashCommandName: `/${id}` as const,
		filePath: `global/commands/${id}.md`,
		acceptedArguments: "$ARGUMENTS",
		references,
		runHooks,
		body: commandBodies[id],
	};
}

export const commandContracts: readonly CommandContract[] = [
	command(
		"specflow",
		"URL またはインライン仕様記述から local proposal entry → scope → clarify → proposal review → spec delta draft → validate を厳格に実行",
		[],
		[
			hook(
				"Proposal Entry",
				"Use the shared local helper to materialize proposal.md and enter proposal_draft.",
				'specflow-prepare-change [<CHANGE_ID>] --source-file "/tmp/specflow-proposal-source.json"',
			),
		],
	),
	command(
		"specflow.design",
		"spec_ready から design/tasks artifacts を生成し、design review gate を通して design_ready に進める",
		["specflow.review_design"],
		[
			hook(
				"Spec Acceptance",
				"Before generating design artifacts, only advance the run when spec validation has reached spec_ready.",
				[
					'CURRENT_PHASE="$(specflow-run get-field "<CHANGE_ID>" current_phase 2>/dev/null || true)"',
					'if [[ "$CURRENT_PHASE" == "spec_ready" ]]; then',
					'  specflow-run advance "<CHANGE_ID>" accept_spec',
					"fi",
				].join("\n"),
			),
		],
	),
	command(
		"specflow.apply",
		"design_ready から実装を適用し、review gate を通過したら apply_ready に進める",
		[],
		[
			hook(
				"Design Acceptance",
				"Advance the run into apply only after design has reached design_ready.",
				[
					'CURRENT_PHASE="$(specflow-run get-field "<CHANGE_ID>" current_phase 2>/dev/null || true)"',
					'if [[ "$CURRENT_PHASE" == "design_ready" ]]; then',
					'  specflow-run advance "<CHANGE_ID>" accept_design',
					"fi",
				].join("\n"),
			),
		],
	),
	command(
		"specflow.approve",
		"実装を承認し、Archive → コミット → Push → PR 作成",
		[],
		[
			hook(
				"Apply Acceptance",
				"When approve completes successfully, store the final summary path (archived when available) and advance the run to approved.",
				[
					'FINAL_SUMMARY_PATH="$' +
						'{ARCHIVED_FEATURE_DIR:-$FEATURE_DIR}/approval-summary.md"',
					'specflow-run update-field "<CHANGE_ID>" last_summary_path "$FINAL_SUMMARY_PATH"',
					'specflow-run advance "<CHANGE_ID>" accept_apply',
				].join("\n"),
			),
		],
	),
	command("specflow.reject", "実装を破棄し、全変更をリセットする", []),
	command(
		"specflow.review_design",
		"Codex design/tasks review を実行し、ledger 更新・auto-fix loop・handoff を管理",
		[
			"prompt:review_design_prompt",
			"prompt:review_design_rereview_prompt",
			"prompt:fix_design_prompt",
			"handoff:specflow.apply",
			"handoff:specflow.reject",
			"handoff:specflow.fix_design",
		],
	),
	command(
		"specflow.review_apply",
		"Codex impl review を実行し、ledger 更新・auto-fix loop・handoff を管理",
		[
			"prompt:review_apply_prompt",
			"prompt:review_apply_rereview_prompt",
			"handoff:specflow.approve",
			"handoff:specflow.fix_apply",
			"handoff:specflow.reject",
		],
	),
	command(
		"specflow.fix_design",
		"Design/Tasks のレビュー指摘を修正し、再度 Codex review を実行",
		[
			"handoff:specflow.apply",
			"handoff:specflow.fix_design",
			"handoff:specflow.reject",
		],
		[
			hook(
				"Design Revision Loop",
				"Record the design self-transition before re-reviewing.",
				'specflow-run advance "<CHANGE_ID>" revise_design',
			),
		],
	),
	command(
		"specflow.fix_apply",
		"レビュー指摘を修正し、再度 Codex review を実行",
		[
			"handoff:specflow.approve",
			"handoff:specflow.fix_apply",
			"handoff:specflow.reject",
		],
		[
			hook(
				"Apply Revision Loop",
				"Record the apply self-transition before re-reviewing.",
				'specflow-run advance "<CHANGE_ID>" revise_apply',
			),
		],
	),
	command(
		"specflow.explore",
		"openspec explore ベースの自由対話 → GitHub issue 起票",
		[],
		[
			hook(
				"Explore Branch",
				"Optionally capture explore branch transitions when using a synthetic run id.",
				[
					'SYNTHETIC_RUN_ID="_explore_$(date +%Y%m%d-%H%M%S)"',
					'specflow-run start "$SYNTHETIC_RUN_ID" --run-kind synthetic',
					'specflow-run advance "$SYNTHETIC_RUN_ID" explore_start',
					"# ... exploration ...",
					'specflow-run advance "$SYNTHETIC_RUN_ID" explore_complete',
				].join("\n"),
			),
		],
	),
	command(
		"specflow.spec",
		"既存コードベースを解析し、openspec/specs/ にベースライン spec を一括生成",
		[],
		[
			hook(
				"Spec Bootstrap Branch",
				"Optionally capture spec bootstrap transitions when using a synthetic run id.",
				[
					'SYNTHETIC_RUN_ID="_spec_$(date +%Y%m%d-%H%M%S)"',
					'specflow-run start "$SYNTHETIC_RUN_ID" --run-kind synthetic',
					'specflow-run advance "$SYNTHETIC_RUN_ID" spec_bootstrap_start',
					"# ... baseline spec generation ...",
					'specflow-run advance "$SYNTHETIC_RUN_ID" spec_bootstrap_complete',
				].join("\n"),
			),
		],
	),
	command(
		"specflow.decompose",
		"specの複雑さを分析し、issue-linked specはGitHub sub-issueに分解、inline specは警告を表示",
		[],
	),
	command(
		"specflow.dashboard",
		"全featureのレビュー台帳を集計し、ダッシュボードとして表示・保存",
		[],
	),
	command(
		"specflow.setup",
		"CLAUDE.md をインタラクティブに設定（Tech Stack, Commands, Code Style）",
		[],
	),
	command(
		"specflow.license",
		"プロジェクト解析に基づいてライセンスファイルを生成",
		[],
	),
	command(
		"specflow.readme",
		"プロジェクト解析に基づいて OSS 風 README を生成・更新",
		[],
	),
];
