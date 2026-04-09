import type { Registry, RegistryEntry, HandoffTargetEntry, AgentRoleEntry } from "./types.js";
import { AssetType } from "./types.js";

// ── Commands ─────────────────────────────────────────────────────────

const commands: readonly RegistryEntry[] = [
  {
    id: "specflow",
    type: AssetType.Command,
    filePath: "global/commands/specflow.md",
    slashCommandName: "/specflow",
    references: [],
    description: "Main entry: issue → proposal → clarify → validate",
  },
  {
    id: "specflow.design",
    type: AssetType.Command,
    filePath: "global/commands/specflow.design.md",
    slashCommandName: "/specflow.design",
    references: ["specflow.review_design"],
    description: "Design → tasks → Codex design review",
  },
  {
    id: "specflow.apply",
    type: AssetType.Command,
    filePath: "global/commands/specflow.apply.md",
    slashCommandName: "/specflow.apply",
    references: [],
    description: "Implement → Codex impl review",
  },
  {
    id: "specflow.approve",
    type: AssetType.Command,
    filePath: "global/commands/specflow.approve.md",
    slashCommandName: "/specflow.approve",
    references: [],
    description: "Commit → push → PR",
  },
  {
    id: "specflow.reject",
    type: AssetType.Command,
    filePath: "global/commands/specflow.reject.md",
    slashCommandName: "/specflow.reject",
    references: [],
    description: "Discard all changes",
  },
  {
    id: "specflow.review_design",
    type: AssetType.Command,
    filePath: "global/commands/specflow.review_design.md",
    slashCommandName: "/specflow.review_design",
    references: [
      "prompt:review_design_prompt",
      "prompt:review_design_rereview_prompt",
      "prompt:fix_design_prompt",
      "handoff:specflow.apply",
      "handoff:specflow.reject",
      "handoff:specflow.fix_design",
    ],
    description: "Codex design/tasks review + ledger + auto-fix loop",
  },
  {
    id: "specflow.review_apply",
    type: AssetType.Command,
    filePath: "global/commands/specflow.review_apply.md",
    slashCommandName: "/specflow.review_apply",
    references: [
      "prompt:review_apply_prompt",
      "prompt:review_apply_rereview_prompt",
      "handoff:specflow.approve",
      "handoff:specflow.fix_apply",
      "handoff:specflow.reject",
    ],
    description: "Codex impl review + ledger + auto-fix loop",
  },
  {
    id: "specflow.fix_design",
    type: AssetType.Command,
    filePath: "global/commands/specflow.fix_design.md",
    slashCommandName: "/specflow.fix_design",
    references: [
      "handoff:specflow.apply",
      "handoff:specflow.fix_design",
      "handoff:specflow.reject",
    ],
    description: "Fix design review findings → re-review",
  },
  {
    id: "specflow.fix_apply",
    type: AssetType.Command,
    filePath: "global/commands/specflow.fix_apply.md",
    slashCommandName: "/specflow.fix_apply",
    references: [
      "handoff:specflow.approve",
      "handoff:specflow.fix_apply",
      "handoff:specflow.reject",
    ],
    description: "Fix impl review findings → re-review",
  },
  {
    id: "specflow.explore",
    type: AssetType.Command,
    filePath: "global/commands/specflow.explore.md",
    slashCommandName: "/specflow.explore",
    references: [],
    description: "OpenSpec explore → GitHub issue",
  },
  {
    id: "specflow.spec",
    type: AssetType.Command,
    filePath: "global/commands/specflow.spec.md",
    slashCommandName: "/specflow.spec",
    references: [],
    description: "Baseline spec generation from existing codebase",
  },
  {
    id: "specflow.decompose",
    type: AssetType.Command,
    filePath: "global/commands/specflow.decompose.md",
    slashCommandName: "/specflow.decompose",
    references: [],
    description: "Decompose spec into sub-issues",
  },
  {
    id: "specflow.dashboard",
    type: AssetType.Command,
    filePath: "global/commands/specflow.dashboard.md",
    slashCommandName: "/specflow.dashboard",
    references: [],
    description: "Review ledger dashboard",
  },
  {
    id: "specflow.setup",
    type: AssetType.Command,
    filePath: "global/commands/specflow.setup.md",
    slashCommandName: "/specflow.setup",
    references: [],
    description: "Interactive CLAUDE.md configuration",
  },
  {
    id: "specflow.license",
    type: AssetType.Command,
    filePath: "global/commands/specflow.license.md",
    slashCommandName: "/specflow.license",
    references: [],
    description: "Generate license file",
  },
  {
    id: "specflow.readme",
    type: AssetType.Command,
    filePath: "global/commands/specflow.readme.md",
    slashCommandName: "/specflow.readme",
    references: [],
    description: "Generate/update README",
  },
];

// ── Prompts ──────────────────────────────────────────────────────────

const prompts: readonly RegistryEntry[] = [
  {
    id: "review_design_prompt",
    type: AssetType.Prompt,
    filePath: "global/prompts/review_design_prompt.md",
    references: [],
    description: "Initial design review prompt",
  },
  {
    id: "review_design_rereview_prompt",
    type: AssetType.Prompt,
    filePath: "global/prompts/review_design_rereview_prompt.md",
    references: [],
    description: "Design re-review prompt",
  },
  {
    id: "fix_design_prompt",
    type: AssetType.Prompt,
    filePath: "global/prompts/fix_design_prompt.md",
    references: [],
    description: "Design auto-fix prompt",
  },
  {
    id: "review_apply_prompt",
    type: AssetType.Prompt,
    filePath: "global/prompts/review_apply_prompt.md",
    references: [],
    description: "Initial implementation review prompt",
  },
  {
    id: "review_apply_rereview_prompt",
    type: AssetType.Prompt,
    filePath: "global/prompts/review_apply_rereview_prompt.md",
    references: [],
    description: "Implementation re-review prompt",
  },
];

// ── Orchestrators ────────────────────────────────────────────────────

const orchestrators: readonly RegistryEntry[] = [
  {
    id: "specflow-analyze",
    type: AssetType.Orchestrator,
    filePath: "bin/specflow-analyze",
    references: [],
    description: "Spec analysis orchestrator",
  },
  {
    id: "specflow-create-sub-issues",
    type: AssetType.Orchestrator,
    filePath: "bin/specflow-create-sub-issues",
    references: [],
    description: "GitHub sub-issue creation",
  },
  {
    id: "specflow-design-artifacts",
    type: AssetType.Orchestrator,
    filePath: "bin/specflow-design-artifacts",
    references: [],
    description: "Design artifact generation",
  },
  {
    id: "specflow-fetch-issue",
    type: AssetType.Orchestrator,
    filePath: "bin/specflow-fetch-issue",
    references: [],
    description: "GitHub issue fetcher",
  },
  {
    id: "specflow-filter-diff",
    type: AssetType.Orchestrator,
    filePath: "bin/specflow-filter-diff",
    references: [],
    description: "Diff filtering utility",
  },
  {
    id: "specflow-init",
    type: AssetType.Orchestrator,
    filePath: "bin/specflow-init",
    references: [],
    description: "Project initialization",
  },
  {
    id: "specflow-install",
    type: AssetType.Orchestrator,
    filePath: "bin/specflow-install",
    references: [],
    description: "Asset installation to ~/.config/specflow",
  },
  {
    id: "specflow-review-apply",
    type: AssetType.Orchestrator,
    filePath: "bin/specflow-review-apply",
    references: [
      "prompt:review_apply_prompt",
      "prompt:review_apply_rereview_prompt",
    ],
    description: "Implementation review orchestrator",
  },
  {
    id: "specflow-review-design",
    type: AssetType.Orchestrator,
    filePath: "bin/specflow-review-design",
    references: [
      "prompt:review_design_prompt",
      "prompt:review_design_rereview_prompt",
      "prompt:fix_design_prompt",
    ],
    description: "Design review orchestrator",
  },
  {
    id: "specflow-run",
    type: AssetType.Orchestrator,
    filePath: "bin/specflow-run",
    references: [],
    description: "Workflow runner",
  },
];

// ── Handoff Targets ──────────────────────────────────────────────────

const handoffTargets: readonly HandoffTargetEntry[] = [
  {
    id: "handoff:specflow.apply",
    type: AssetType.HandoffTarget,
    filePath: "global/commands/specflow.apply.md",
    targetCommandId: "specflow.apply",
    references: ["specflow.apply"],
    description: "Handoff to implementation",
  },
  {
    id: "handoff:specflow.approve",
    type: AssetType.HandoffTarget,
    filePath: "global/commands/specflow.approve.md",
    targetCommandId: "specflow.approve",
    references: ["specflow.approve"],
    description: "Handoff to approval",
  },
  {
    id: "handoff:specflow.reject",
    type: AssetType.HandoffTarget,
    filePath: "global/commands/specflow.reject.md",
    targetCommandId: "specflow.reject",
    references: ["specflow.reject"],
    description: "Handoff to reject",
  },
  {
    id: "handoff:specflow.fix_design",
    type: AssetType.HandoffTarget,
    filePath: "global/commands/specflow.fix_design.md",
    targetCommandId: "specflow.fix_design",
    references: ["specflow.fix_design"],
    description: "Handoff to design fix",
  },
  {
    id: "handoff:specflow.fix_apply",
    type: AssetType.HandoffTarget,
    filePath: "global/commands/specflow.fix_apply.md",
    targetCommandId: "specflow.fix_apply",
    references: ["specflow.fix_apply"],
    description: "Handoff to apply fix",
  },
];

// ── Agent Roles ──────────────────────────────────────────────────────

const agentRoles: readonly AgentRoleEntry[] = [
  {
    id: "role:reviewer",
    type: AssetType.AgentRole,
    filePath: "src/registry.ts",
    references: [],
    description: "Codex-based code/design reviewer",
  },
  {
    id: "role:fixer",
    type: AssetType.AgentRole,
    filePath: "src/registry.ts",
    references: [],
    description: "Codex-based auto-fixer",
  },
  {
    id: "role:orchestrator",
    type: AssetType.AgentRole,
    filePath: "src/registry.ts",
    references: [],
    description: "Bash orchestrator for multi-step workflows",
  },
];

// ── Exported Registry ────────────────────────────────────────────────

export const registry: Registry = {
  commands,
  prompts,
  orchestrators,
  handoffTargets,
  agentRoles,
};
