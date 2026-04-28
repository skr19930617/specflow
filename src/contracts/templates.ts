import { AssetType, type TemplateAssetContract } from "../types/contracts.js";

export const templateContracts: readonly TemplateAssetContract[] = [
	{
		id: "template-claude-md",
		type: AssetType.Template,
		filePath: "template/CLAUDE.md",
		sourcePath: "assets/template/CLAUDE.md",
	},
	{
		id: "template-gitignore",
		type: AssetType.Template,
		filePath: "template/.gitignore",
		sourcePath: "assets/template/.gitignore",
	},
	{
		id: "template-specflow-config-env",
		type: AssetType.Template,
		filePath: "template/.specflow/config.env",
		sourcePath: "assets/template/.specflow/config.env",
	},
	{
		id: "template-specflow-config-yaml",
		type: AssetType.Template,
		filePath: "template/.specflow/config.yaml",
		sourcePath: "assets/template/.specflow/config.yaml",
	},
];
