import type { CommandBody } from "../types/contracts.js";

// Command prose lives in `assets/commands/<id>.md.tmpl` and is materialised by
// the template resolver at build time (see `src/contracts/template-resolver.ts`
// and the `resolveAllTemplates` call in `src/build.ts`). Each entry here only
// declares frontmatter metadata and a path to its template source; the
// resolver populates `sections` before `renderCommands()` consumes the
// contract.

function command(id: string, description: string): CommandBody {
	return {
		frontmatter: { description },
		sections: [],
		templatePath: `assets/commands/${id}.md.tmpl`,
	};
}

export const commandBodies: Record<string, CommandBody> = {
	"specflow.apply": command(
		"specflow.apply",
		"specflow で実装を適用し、実装レビューを実行",
	),
	"specflow.approve": command(
		"specflow.approve",
		"実装を承認し、Archive → コミット → Push → PR 作成",
	),
	"specflow.dashboard": command(
		"specflow.dashboard",
		"全featureのレビュー台帳を集計し、ダッシュボードとして表示・保存",
	),
	"specflow.decompose": command(
		"specflow.decompose",
		"specの複雑さを分析し、issue-linked specはGitHub sub-issueに分解、inline specは警告を表示",
	),
	"specflow.design": command(
		"specflow.design",
		"specflow で design/tasks artifacts を生成し、レビューを実行",
	),
	"specflow.explore": command(
		"specflow.explore",
		"openspec explore ベースの自由対話 → GitHub issue 起票",
	),
	"specflow.fix_apply": command(
		"specflow.fix_apply",
		"レビュー指摘を修正し、再度レビューを実行",
	),
	"specflow.fix_design": command(
		"specflow.fix_design",
		"Design/Tasks のレビュー指摘を修正し、再度レビューを実行",
	),
	"specflow.license": command(
		"specflow.license",
		"プロジェクト解析に基づいてライセンスファイルを生成",
	),
	specflow: command(
		"specflow",
		"URL またはインライン仕様記述から local proposal entry → clarify → challenge → reclarify → spec delta validate を実行",
	),
	"specflow.readme": command(
		"specflow.readme",
		"プロジェクト解析に基づいて OSS 風 README を生成・更新",
	),
	"specflow.reject": command(
		"specflow.reject",
		"実装を破棄し、全変更をリセットする",
	),
	"specflow.review_apply": command(
		"specflow.review_apply",
		"実装レビューを実行し、ledger 更新・auto-fix loop・handoff を管理",
	),
	"specflow.review_design": command(
		"specflow.review_design",
		"Design/tasks レビューを実行し、ledger 更新・auto-fix loop・handoff を管理",
	),
	"specflow.setup": command(
		"specflow.setup",
		"Repository profile を解析・生成し、CLAUDE.md を更新する",
	),
	"specflow.spec": command(
		"specflow.spec",
		"既存コードベースを解析し、openspec/specs/ にベースライン spec を一括生成",
	),
};
