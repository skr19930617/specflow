export const AssetType = {
  Command: "command",
  Prompt: "prompt",
  Orchestrator: "orchestrator",
  Workflow: "workflow",
  Template: "template",
  InstallerAsset: "installerAsset",
} as const;

export type AssetType = (typeof AssetType)[keyof typeof AssetType];

export interface ValidationError {
  readonly id: string;
  readonly type: AssetType | "contract";
  readonly message: string;
  readonly filePath: string;
  readonly check: string;
}

export interface CommandHook {
  readonly title: string;
  readonly description: string;
  readonly shell: string;
}

export interface CommandContract {
  readonly id: string;
  readonly type: typeof AssetType.Command;
  readonly description: string;
  readonly slashCommandName: `/${string}`;
  readonly filePath: string;
  readonly legacySourcePath: string;
  readonly acceptedArguments: string;
  readonly references: readonly string[];
  readonly runHooks: readonly CommandHook[];
}

export interface PromptContract {
  readonly id: string;
  readonly type: typeof AssetType.Prompt;
  readonly filePath: string;
  readonly legacySourcePath: string;
  readonly references: readonly string[];
}

export interface OrchestratorContract {
  readonly id: string;
  readonly type: typeof AssetType.Orchestrator;
  readonly filePath: string;
  readonly entryModule: string;
  readonly legacyFallbackPath?: string;
  readonly references: readonly string[];
}

export interface WorkflowTransition {
  readonly from: string;
  readonly event: string;
  readonly to: string;
}

export interface WorkflowContract {
  readonly id: string;
  readonly type: typeof AssetType.Workflow;
  readonly filePath: string;
  readonly version: string;
  readonly states: readonly string[];
  readonly events: readonly string[];
  readonly transitions: readonly WorkflowTransition[];
}

export interface TemplateAssetContract {
  readonly id: string;
  readonly type: typeof AssetType.Template;
  readonly filePath: string;
  readonly legacySourcePath: string;
}

export interface InstallLinkContract {
  readonly id: string;
  readonly type: typeof AssetType.InstallerAsset;
  readonly targetPath: string;
  readonly sourcePath: string;
}

export interface InstallCopyContract {
  readonly id: string;
  readonly type: typeof AssetType.InstallerAsset;
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly sourceKind: "file" | "directory";
}

export interface InstallSettingsMergeContract {
  readonly id: string;
  readonly type: typeof AssetType.InstallerAsset;
  readonly sourcePath: string;
  readonly targetPath: string;
}

export interface ContractsBundle {
  readonly commands: readonly CommandContract[];
  readonly prompts: readonly PromptContract[];
  readonly orchestrators: readonly OrchestratorContract[];
  readonly workflow: WorkflowContract;
  readonly templates: readonly TemplateAssetContract[];
  readonly installCopies: readonly InstallCopyContract[];
  readonly installLinks: readonly InstallLinkContract[];
  readonly installSettingsMerge: InstallSettingsMergeContract;
}

export interface ManifestEntry {
  readonly id: string;
  readonly type: AssetType;
  readonly filePath: string;
  readonly references: readonly string[];
}

export interface Manifest {
  readonly commands: readonly ManifestEntry[];
  readonly prompts: readonly ManifestEntry[];
  readonly orchestrators: readonly ManifestEntry[];
  readonly workflows: readonly ManifestEntry[];
  readonly templates: readonly ManifestEntry[];
  readonly installerAssets: readonly ManifestEntry[];
  readonly metadata: {
    readonly generatedAt: string;
    readonly gitCommit: string;
    readonly registryVersion: string;
  };
}

export interface InstallPlan {
  readonly copies: readonly InstallCopyContract[];
  readonly links: readonly InstallLinkContract[];
  readonly settingsMerge: InstallSettingsMergeContract;
}
