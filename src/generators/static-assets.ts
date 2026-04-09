import { copyPath } from "../lib/fs.js";
import { fromDistribution, fromRepo } from "../lib/paths.js";

export function renderStaticAssets(): void {
  copyPath(fromRepo("assets/global/claude-settings.json"), fromDistribution("global/claude-settings.json"));
}
