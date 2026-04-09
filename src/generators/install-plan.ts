import { writeText } from "../lib/fs.js";
import { fromRepo } from "../lib/paths.js";
import type { InstallPlan } from "../types/contracts.js";

export function renderInstallPlan(plan: InstallPlan): void {
  writeText(fromRepo("dist/install-plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
}
