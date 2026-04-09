import { copyPath } from "../lib/fs.js";
import { fromRepo } from "../lib/paths.js";
import type { PromptContract } from "../types/contracts.js";

export function renderPrompts(prompts: readonly PromptContract[]): void {
  for (const prompt of prompts) {
    copyPath(fromRepo(prompt.legacySourcePath), fromRepo(prompt.filePath));
  }
}
