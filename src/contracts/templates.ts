import { AssetType, type TemplateAssetContract } from "../types/contracts.js";

export const templateContracts: readonly TemplateAssetContract[] = [
  {
    id: "template-claude-md",
    type: AssetType.Template,
    filePath: "template/CLAUDE.md",
    legacySourcePath: "legacy/v1/template/CLAUDE.md",
  },
  {
    id: "template-mcp-json",
    type: AssetType.Template,
    filePath: "template/.mcp.json",
    legacySourcePath: "legacy/v1/template/.mcp.json",
  },
  {
    id: "template-specflow-config-env",
    type: AssetType.Template,
    filePath: "template/.specflow/config.env",
    legacySourcePath: "legacy/v1/template/.specflow/config.env",
  },
];
