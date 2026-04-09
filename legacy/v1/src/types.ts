// ── Asset Types ──────────────────────────────────────────────────────

export const AssetType = {
  Command: "command",
  Prompt: "prompt",
  Orchestrator: "orchestrator",
  HandoffTarget: "handoffTarget",
  AgentRole: "agentRole",
} as const;

export type AssetType = (typeof AssetType)[keyof typeof AssetType];

// ── Registry Entry ───────────────────────────────────────────────────

export interface RegistryEntry {
  readonly id: string;
  readonly type: AssetType;
  readonly filePath: string;
  readonly references: readonly string[];
  readonly slashCommandName?: string;
  readonly description?: string;
}

export interface HandoffTargetEntry extends RegistryEntry {
  readonly type: typeof AssetType.HandoffTarget;
  readonly targetCommandId: string;
}

export interface AgentRoleEntry extends RegistryEntry {
  readonly type: typeof AssetType.AgentRole;
}

// ── Registry ─────────────────────────────────────────────────────────

export interface Registry {
  readonly commands: readonly RegistryEntry[];
  readonly prompts: readonly RegistryEntry[];
  readonly orchestrators: readonly RegistryEntry[];
  readonly handoffTargets: readonly HandoffTargetEntry[];
  readonly agentRoles: readonly AgentRoleEntry[];
}

// ── Validation ───────────────────────────────────────────────────────

export interface ValidationError {
  readonly id: string;
  readonly type: AssetType | "registry";
  readonly check: string;
  readonly message: string;
  readonly filePath: string;
}

export type Checker = (registry: Registry) => readonly ValidationError[];

// ── Manifest ─────────────────────────────────────────────────────────

export interface ManifestMetadata {
  readonly generatedAt: string;
  readonly registryVersion: string;
  readonly gitCommit: string;
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
  readonly handoffTargets: readonly ManifestEntry[];
  readonly agentRoles: readonly ManifestEntry[];
  readonly metadata: ManifestMetadata;
}
