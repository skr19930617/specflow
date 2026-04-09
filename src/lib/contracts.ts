import type {
  CommandContract,
  ContractsBundle,
  InstallCopyContract,
  InstallLinkContract,
  ManifestEntry,
  OrchestratorContract,
  PromptContract,
  TemplateAssetContract,
  ValidationError,
  WorkflowContract,
} from "../types/contracts.js";
import { AssetType } from "../types/contracts.js";
import { fromRepo } from "./paths.js";
import { existsSync, statSync } from "node:fs";

function validateUnique(
  kind: AssetType | "contract",
  fieldName: string,
  entries: readonly { id: string; filePath: string }[],
  selector: (entry: { id: string; filePath: string }) => string,
): ValidationError[] {
  const seen = new Map<string, string>();
  const errors: ValidationError[] = [];
  for (const entry of entries) {
    const value = selector(entry);
    const existing = seen.get(value);
    if (existing) {
      errors.push({
        id: entry.id,
        type: kind,
        check: `unique-${fieldName}`,
        filePath: entry.filePath,
        message: `${fieldName} "${value}" is duplicated by ${existing} and ${entry.id}.`,
      });
      continue;
    }
    seen.set(value, entry.id);
  }
  return errors;
}

function validateSourcePath(
  id: string,
  type: AssetType,
  filePath: string,
  sourcePath: string,
  check: string,
): ValidationError[] {
  if (existsSync(fromRepo(sourcePath))) {
    return [];
  }
  return [
    {
      id,
      type,
      check,
      filePath,
      message: `Required source path "${sourcePath}" does not exist.`,
    },
  ];
}

function validateCommandContracts(commands: readonly CommandContract[]): ValidationError[] {
  const errors: ValidationError[] = [];
  errors.push(...validateUnique(AssetType.Command, "id", commands, (entry) => entry.id));
  errors.push(...validateUnique(AssetType.Command, "slashCommandName", commands, (entry) => {
    const command = entry as CommandContract;
    return command.slashCommandName;
  }));

  for (const command of commands) {
    errors.push(
      ...validateSourcePath(
        command.id,
        AssetType.Command,
        command.filePath,
        command.legacySourcePath,
        "command-source-exists",
      ),
    );
  }

  return errors;
}

function validatePromptContracts(prompts: readonly PromptContract[]): ValidationError[] {
  const errors: ValidationError[] = [];
  errors.push(...validateUnique(AssetType.Prompt, "id", prompts, (entry) => entry.id));
  for (const prompt of prompts) {
    errors.push(
      ...validateSourcePath(
        prompt.id,
        AssetType.Prompt,
        prompt.filePath,
        prompt.legacySourcePath,
        "prompt-source-exists",
      ),
    );
  }
  return errors;
}

function validateOrchestratorContracts(orchestrators: readonly OrchestratorContract[]): ValidationError[] {
  const errors: ValidationError[] = [];
  errors.push(...validateUnique(AssetType.Orchestrator, "id", orchestrators, (entry) => entry.id));
  for (const orchestrator of orchestrators) {
    if (!orchestrator.legacyFallbackPath) {
      continue;
    }
    errors.push(
      ...validateSourcePath(
        orchestrator.id,
        AssetType.Orchestrator,
        orchestrator.filePath,
        orchestrator.legacyFallbackPath,
        "legacy-fallback-exists",
      ),
    );
  }
  return errors;
}

function validateWorkflowContract(workflow: WorkflowContract): ValidationError[] {
  const errors: ValidationError[] = [];
  const states = new Set(workflow.states);
  const events = new Set(workflow.events);
  if (states.size !== workflow.states.length) {
    errors.push({
      id: workflow.id,
      type: AssetType.Workflow,
      check: "unique-states",
      filePath: workflow.filePath,
      message: "Workflow states contain duplicates.",
    });
  }
  if (events.size !== workflow.events.length) {
    errors.push({
      id: workflow.id,
      type: AssetType.Workflow,
      check: "unique-events",
      filePath: workflow.filePath,
      message: "Workflow events contain duplicates.",
    });
  }
  for (const transition of workflow.transitions) {
    if (!states.has(transition.from) || !states.has(transition.to)) {
      errors.push({
        id: workflow.id,
        type: AssetType.Workflow,
        check: "transition-states-declared",
        filePath: workflow.filePath,
        message: `Transition ${transition.from} -> ${transition.to} references undeclared state.`,
      });
    }
    if (!events.has(transition.event)) {
      errors.push({
        id: workflow.id,
        type: AssetType.Workflow,
        check: "transition-events-declared",
        filePath: workflow.filePath,
        message: `Transition event "${transition.event}" is not declared in workflow.events.`,
      });
    }
  }
  return errors;
}

function validateTemplateContracts(templates: readonly TemplateAssetContract[]): ValidationError[] {
  const errors: ValidationError[] = [];
  errors.push(...validateUnique(AssetType.Template, "id", templates, (entry) => entry.id));
  for (const template of templates) {
    errors.push(
      ...validateSourcePath(
        template.id,
        AssetType.Template,
        template.filePath,
        template.legacySourcePath,
        "template-source-exists",
      ),
    );
  }
  return errors;
}

function validateInstallCopies(copies: readonly InstallCopyContract[]): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const copy of copies) {
    const sourceAbsPath = fromRepo(copy.sourcePath);
    if (!existsSync(sourceAbsPath)) {
      if (copy.sourcePath.startsWith("global/") || copy.sourcePath === "template") {
        continue;
      }
      errors.push({
        id: copy.id,
        type: AssetType.InstallerAsset,
        check: "install-copy-source-exists",
        filePath: copy.sourcePath,
        message: `Install copy source "${copy.sourcePath}" does not exist.`,
      });
      continue;
    }
    const stat = statSync(sourceAbsPath);
    const expectedDirectory = copy.sourceKind === "directory";
    if (expectedDirectory !== stat.isDirectory()) {
      errors.push({
        id: copy.id,
        type: AssetType.InstallerAsset,
        check: "install-copy-source-kind",
        filePath: copy.sourcePath,
        message: `Install copy source "${copy.sourcePath}" has unexpected kind.`,
      });
    }
  }
  return errors;
}

function validateInstallLinks(links: readonly InstallLinkContract[]): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const link of links) {
    if (existsSync(fromRepo(link.sourcePath))) {
      continue;
    }
    errors.push({
      id: link.id,
      type: AssetType.InstallerAsset,
      check: "install-link-source-exists",
      filePath: link.sourcePath,
      message: `Install link source "${link.sourcePath}" does not exist.`,
    });
  }
  return errors;
}

export function validateContracts(contracts: ContractsBundle): readonly ValidationError[] {
  const promptIds = new Set(contracts.prompts.map((prompt) => prompt.id));
  const commandIds = new Set(contracts.commands.map((command) => command.id));
  const orchestratorIds = new Set(contracts.orchestrators.map((orchestrator) => orchestrator.id));
  const referenceErrors: ValidationError[] = [];

  for (const command of contracts.commands) {
    for (const reference of command.references) {
      if (reference.startsWith("prompt:")) {
        const promptId = reference.slice("prompt:".length);
        if (!promptIds.has(promptId)) {
          referenceErrors.push({
            id: command.id,
            type: AssetType.Command,
            check: "prompt-reference-exists",
            filePath: command.filePath,
            message: `Prompt reference "${reference}" does not resolve.`,
          });
        }
        continue;
      }

      if (reference.startsWith("handoff:")) {
        const commandId = reference.slice("handoff:".length);
        if (!commandIds.has(commandId)) {
          referenceErrors.push({
            id: command.id,
            type: AssetType.Command,
            check: "handoff-reference-exists",
            filePath: command.filePath,
            message: `Handoff reference "${reference}" does not resolve to a command.`,
          });
        }
        continue;
      }

      if (!commandIds.has(reference) && !orchestratorIds.has(reference)) {
        referenceErrors.push({
          id: command.id,
          type: AssetType.Command,
          check: "asset-reference-exists",
          filePath: command.filePath,
          message: `Asset reference "${reference}" does not resolve.`,
        });
      }
    }
  }

  return [
    ...validateCommandContracts(contracts.commands),
    ...validatePromptContracts(contracts.prompts),
    ...validateOrchestratorContracts(contracts.orchestrators),
    ...validateWorkflowContract(contracts.workflow),
    ...validateTemplateContracts(contracts.templates),
    ...validateInstallCopies(contracts.installCopies),
    ...validateInstallLinks(contracts.installLinks),
    ...referenceErrors,
    ...(
      contracts.installSettingsMerge.sourcePath.startsWith("global/")
        ? []
        : validateSourcePath(
            contracts.installSettingsMerge.id,
            AssetType.InstallerAsset,
            contracts.installSettingsMerge.targetPath,
            contracts.installSettingsMerge.sourcePath,
            "install-settings-source-exists",
          )
    ),
  ];
}

function toManifestEntries(
  entries: readonly {
    id: string;
    type: AssetType;
    filePath: string;
    references?: readonly string[];
  }[],
): readonly ManifestEntry[] {
  return [...entries]
    .map((entry) => ({
      id: entry.id,
      type: entry.type,
      filePath: entry.filePath,
      references: [...(entry.references ?? [])].sort(),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function createManifest(contracts: ContractsBundle, generatedAt: string, gitCommit: string) {
  const installerAssets = [
    ...contracts.installCopies.map((entry) => ({
      id: entry.id,
      type: entry.type,
      filePath: entry.sourcePath,
      references: [] as readonly string[],
    })),
    ...contracts.installLinks.map((entry) => ({
      id: entry.id,
      type: entry.type,
      filePath: entry.sourcePath,
      references: [] as readonly string[],
    })),
    {
      id: contracts.installSettingsMerge.id,
      type: contracts.installSettingsMerge.type,
      filePath: contracts.installSettingsMerge.sourcePath,
      references: [] as readonly string[],
    },
  ];

  return {
    commands: toManifestEntries(contracts.commands),
    prompts: toManifestEntries(contracts.prompts),
    orchestrators: toManifestEntries(contracts.orchestrators),
    workflows: toManifestEntries([contracts.workflow]),
    templates: toManifestEntries(contracts.templates),
    installerAssets: toManifestEntries(installerAssets),
    metadata: {
      generatedAt,
      gitCommit,
      registryVersion: "2.0.0",
    },
  };
}
