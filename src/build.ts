import { contracts } from "./contracts/install.js";
import { renderCommands } from "./generators/commands.js";
import { renderInstallPlan } from "./generators/install-plan.js";
import { renderPrompts } from "./generators/prompts.js";
import { renderReadmeWorkflowDiagram } from "./generators/readme.js";
import { renderStaticAssets } from "./generators/static-assets.js";
import { renderTemplates } from "./generators/templates.js";
import { renderWorkflow } from "./generators/workflow.js";
import { createManifest, validateContracts } from "./lib/contracts.js";
import { writeText } from "./lib/fs.js";
import { fromRepo } from "./lib/paths.js";
import { exec } from "./lib/process.js";
import { renderWorkflowReadmeBlock } from "./lib/workflow-machine.js";

function gitCommit(): string {
	try {
		return exec("git", ["rev-parse", "--short", "HEAD"], process.cwd()).trim();
	} catch {
		return "unknown";
	}
}

function main(): void {
	const errors = validateContracts(contracts);
	if (errors.length > 0) {
		for (const error of errors) {
			console.error(
				`[${error.check}] ${error.id} (${error.type}) at ${error.filePath}`,
			);
			console.error(`  ${error.message}`);
		}
		process.exit(1);
	}

	renderWorkflow(contracts.workflow);
	renderReadmeWorkflowDiagram(renderWorkflowReadmeBlock());
	renderPrompts(contracts.prompts);
	renderCommands(contracts.commands);
	renderTemplates(contracts.templates);
	renderStaticAssets();

	const installPlan = {
		copies: contracts.installCopies,
		links: contracts.installLinks,
		settingsMerge: contracts.installSettingsMerge,
	} as const;
	renderInstallPlan(installPlan);

	const generatedAt = new Date().toISOString();
	const manifest = createManifest(contracts, generatedAt, gitCommit());
	writeText(
		fromRepo("dist/manifest.json"),
		`${JSON.stringify(manifest, null, 2)}\n`,
	);
	writeText(
		fromRepo("dist/contracts.json"),
		`${JSON.stringify(contracts, null, 2)}\n`,
	);
}

main();
