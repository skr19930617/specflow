import { AssetType, type TemplateAssetContract } from "../types/contracts.js";

export const templateContracts: readonly TemplateAssetContract[] = [
	{
		id: "template-claude-md",
		type: AssetType.Template,
		filePath: "template/CLAUDE.md",
		sourcePath: "assets/template/CLAUDE.md",
	},
	{
		id: "template-mcp-json",
		type: AssetType.Template,
		filePath: "template/.mcp.json",
		sourcePath: "assets/template/.mcp.json",
	},
	{
		id: "template-specflow-config-env",
		type: AssetType.Template,
		filePath: "template/.specflow/config.env",
		sourcePath: "assets/template/.specflow/config.env",
	},
];
