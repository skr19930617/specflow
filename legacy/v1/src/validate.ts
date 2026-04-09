import { registry } from "./registry.js";
import { generateManifest } from "./manifest.js";
import { checkUniqueIds } from "./checks/unique-ids.js";
import { checkUniqueSlashNames } from "./checks/unique-slash-names.js";
import { checkPromptRefs } from "./checks/prompt-refs.js";
import { checkHandoffTargets } from "./checks/handoff-targets.js";
import { checkAgentRoles } from "./checks/agent-roles.js";
import { checkCommandSyntax } from "./checks/command-syntax.js";
import { checkFileExists } from "./checks/file-exists.js";
import { checkRegistryCompleteness } from "./checks/registry-completeness.js";
import type { Checker, ValidationError } from "./types.js";

const checkers: readonly Checker[] = [
  checkUniqueIds,
  checkUniqueSlashNames,
  checkPromptRefs,
  checkHandoffTargets,
  checkAgentRoles,
  checkCommandSyntax,
  checkFileExists,
  checkRegistryCompleteness,
];

function runValidation(): readonly ValidationError[] {
  return checkers.flatMap((checker) => checker(registry));
}

function printSummary(): void {
  const totalAssets =
    registry.commands.length +
    registry.prompts.length +
    registry.orchestrators.length +
    registry.handoffTargets.length +
    registry.agentRoles.length;

  console.log("✅ Registry validation passed\n");
  console.log(`  Commands:        ${registry.commands.length}`);
  console.log(`  Prompts:         ${registry.prompts.length}`);
  console.log(`  Orchestrators:   ${registry.orchestrators.length}`);
  console.log(`  Handoff Targets: ${registry.handoffTargets.length}`);
  console.log(`  Agent Roles:     ${registry.agentRoles.length}`);
  console.log(`  Total:           ${totalAssets}`);
}

function printErrors(errors: readonly ValidationError[]): void {
  console.error(`❌ Registry validation failed with ${errors.length} error(s):\n`);
  for (const err of errors) {
    console.error(`  [${err.check}] ${err.id} (${err.type}) at ${err.filePath}`);
    console.error(`    → ${err.message}\n`);
  }
}

async function main(): Promise<void> {
  const errors = runValidation();

  if (errors.length > 0) {
    printErrors(errors);
    process.exit(1);
  }

  printSummary();
  await generateManifest(registry);
  console.log("\n📦 Manifest generated at dist/manifest.json");
}

main().catch((err: unknown) => {
  console.error("Unexpected error:", err);
  process.exit(2);
});

export { runValidation };
