import { copyPath } from "../lib/fs.js";
import { fromRepo } from "../lib/paths.js";

export function renderStaticAssets(): void {
  copyPath(fromRepo("assets/global/claude-settings.json"), fromRepo("global/claude-settings.json"));
}
