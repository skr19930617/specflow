import { AssetType, type PromptContract } from "../types/contracts.js";

function prompt(id: string): PromptContract {
  return {
    id,
    type: AssetType.Prompt,
    filePath: `global/prompts/${id}.md`,
    legacySourcePath: `legacy/v1/global/prompts/${id}.md`,
    references: [],
  };
}

export const promptContracts: readonly PromptContract[] = [
  prompt("review_design_prompt"),
  prompt("review_design_rereview_prompt"),
  prompt("fix_design_prompt"),
  prompt("review_apply_prompt"),
  prompt("review_apply_rereview_prompt"),
];
