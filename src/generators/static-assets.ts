import { copyPath } from "../lib/fs.js";
import { fromRepo } from "../lib/paths.js";

export function renderStaticAssets(): void {
  copyPath(fromRepo("legacy/v1/global/claude-settings.json"), fromRepo("global/claude-settings.json"));
  copyPath(fromRepo("legacy/v1/template"), fromRepo("template"));
}
