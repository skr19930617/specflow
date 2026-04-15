import {
	AssetType,
	type ContractsBundle,
	type InstallCopyContract,
	type InstallLinkContract,
	type InstallSettingsMergeContract,
} from "../types/contracts.js";
import { commandContracts } from "./commands.js";
import { orchestratorContracts } from "./orchestrators.js";
import { promptContracts } from "./prompts.js";
import { templateContracts } from "./templates.js";
import { workflowContract } from "./workflow.js";

const installCopies: readonly InstallCopyContract[] = [
	{
		id: "copy-template-dir",
		type: AssetType.InstallerAsset,
		sourcePath: "template",
		targetPath: "$HOME/.config/specflow/template",
		sourceKind: "directory",
	},
	{
		id: "copy-global-prompts",
		type: AssetType.InstallerAsset,
		sourcePath: "global/prompts",
		targetPath: "$HOME/.config/specflow/global/prompts",
		sourceKind: "directory",
	},
	{
		id: "copy-global-workflow",
		type: AssetType.InstallerAsset,
		sourcePath: "global/workflow",
		targetPath: "$HOME/.config/specflow/global/workflow",
		sourceKind: "directory",
	},
	{
		id: "copy-global-claude-settings",
		type: AssetType.InstallerAsset,
		sourcePath: "global/claude-settings.json",
		targetPath: "$HOME/.config/specflow/global/claude-settings.json",
		sourceKind: "file",
	},
	{
		id: "copy-generated-commands",
		type: AssetType.InstallerAsset,
		sourcePath: "global/commands",
		targetPath: "$HOME/.config/specflow/global/commands",
		sourceKind: "directory",
	},
	{
		id: "copy-global-schemas",
		type: AssetType.InstallerAsset,
		sourcePath: "global/schemas",
		targetPath: "$HOME/.config/specflow/global/schemas",
		sourceKind: "directory",
	},
];

const installLinks: readonly InstallLinkContract[] = orchestratorContracts.map(
	(orchestrator) => ({
		id: `link-${orchestrator.id}`,
		type: AssetType.InstallerAsset,
		sourcePath: orchestrator.filePath,
		targetPath: `$HOME/bin/${orchestrator.id}`,
	}),
);

const installSettingsMerge: InstallSettingsMergeContract = {
	id: "merge-claude-settings",
	type: AssetType.InstallerAsset,
	sourcePath: "global/claude-settings.json",
	targetPath: "$HOME/.claude/settings.json",
};

export const contracts: ContractsBundle = {
	commands: commandContracts,
	prompts: promptContracts,
	orchestrators: orchestratorContracts,
	workflow: workflowContract,
	templates: templateContracts,
	installCopies,
	installLinks,
	installSettingsMerge,
};
