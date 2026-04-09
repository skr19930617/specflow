import { copyPath } from "../lib/fs.js";
import { fromRepo } from "../lib/paths.js";

export function renderReleasePackage(): void {
  copyPath(fromRepo("global"), fromRepo("dist/package/global"));
  copyPath(fromRepo("template"), fromRepo("dist/package/template"));
}
