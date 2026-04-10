import { copyPath } from "../lib/fs.js";
import { fromRepo } from "../lib/paths.js";
import { packagedTemplatePathFor } from "../lib/template-files.js";
import type { TemplateAssetContract } from "../types/contracts.js";

export function renderTemplates(
	templates: readonly TemplateAssetContract[],
): void {
	for (const template of templates) {
		copyPath(
			fromRepo(template.sourcePath),
			fromRepo(`dist/package/${template.filePath}`),
		);
		const packagedPath = packagedTemplatePathFor(template.filePath);
		if (packagedPath) {
			copyPath(
				fromRepo(template.sourcePath),
				fromRepo(`dist/package/${packagedPath}`),
			);
		}
	}
}
