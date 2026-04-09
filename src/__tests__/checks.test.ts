import { describe, it, expect } from "vitest";
import type { Registry, RegistryEntry, HandoffTargetEntry, AgentRoleEntry } from "../types.js";
import { AssetType } from "../types.js";
import { checkUniqueIds } from "../checks/unique-ids.js";
import { checkUniqueSlashNames } from "../checks/unique-slash-names.js";
import { checkPromptRefs } from "../checks/prompt-refs.js";
import { checkHandoffTargets } from "../checks/handoff-targets.js";
import { checkAgentRoles } from "../checks/agent-roles.js";

function makeEntry(overrides: Partial<RegistryEntry> & { id: string }): RegistryEntry {
  return {
    type: AssetType.Command,
    filePath: `test/${overrides.id}.md`,
    references: [],
    ...overrides,
  };
}

function makeHandoff(overrides: Partial<HandoffTargetEntry> & { id: string; targetCommandId: string }): HandoffTargetEntry {
  return {
    type: AssetType.HandoffTarget,
    filePath: `test/${overrides.id}.md`,
    references: [overrides.targetCommandId],
    ...overrides,
  };
}

function makeRole(id: string): AgentRoleEntry {
  return {
    id,
    type: AssetType.AgentRole,
    filePath: "src/registry.ts",
    references: [],
  };
}

function emptyRegistry(overrides: Partial<Registry> = {}): Registry {
  return {
    commands: [],
    prompts: [],
    orchestrators: [],
    handoffTargets: [],
    agentRoles: [],
    ...overrides,
  };
}

// ── unique-ids ───────────────────────────────────────────────────────

describe("checkUniqueIds", () => {
  it("passes with unique IDs", () => {
    const reg = emptyRegistry({
      commands: [makeEntry({ id: "cmd-a" }), makeEntry({ id: "cmd-b" })],
    });
    expect(checkUniqueIds(reg)).toEqual([]);
  });

  it("detects duplicate IDs within a group", () => {
    const reg = emptyRegistry({
      commands: [
        makeEntry({ id: "cmd-a", filePath: "a.md" }),
        makeEntry({ id: "cmd-a", filePath: "b.md" }),
      ],
    });
    const errors = checkUniqueIds(reg);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.check).toBe("unique-ids");
    expect(errors[0]!.id).toBe("cmd-a");
  });
});

// ── unique-slash-names ───────────────────────────────────────────────

describe("checkUniqueSlashNames", () => {
  it("passes with unique slash names", () => {
    const reg = emptyRegistry({
      commands: [
        makeEntry({ id: "a", slashCommandName: "/a" }),
        makeEntry({ id: "b", slashCommandName: "/b" }),
      ],
    });
    expect(checkUniqueSlashNames(reg)).toEqual([]);
  });

  it("detects duplicate slash names", () => {
    const reg = emptyRegistry({
      commands: [
        makeEntry({ id: "a", slashCommandName: "/same" }),
        makeEntry({ id: "b", slashCommandName: "/same" }),
      ],
    });
    const errors = checkUniqueSlashNames(reg);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.check).toBe("unique-slash-names");
  });

  it("ignores entries without slash names", () => {
    const reg = emptyRegistry({
      commands: [makeEntry({ id: "a" }), makeEntry({ id: "b" })],
    });
    expect(checkUniqueSlashNames(reg)).toEqual([]);
  });
});

// ── prompt-refs ──────────────────────────────────────────────────────

describe("checkPromptRefs", () => {
  it("passes when all prompt refs exist", () => {
    const reg = emptyRegistry({
      commands: [makeEntry({ id: "cmd", references: ["prompt:my-prompt"] })],
      prompts: [makeEntry({ id: "my-prompt", type: AssetType.Prompt })],
    });
    expect(checkPromptRefs(reg)).toEqual([]);
  });

  it("detects missing prompt refs", () => {
    const reg = emptyRegistry({
      commands: [makeEntry({ id: "cmd", references: ["prompt:nonexistent"] })],
      prompts: [],
    });
    const errors = checkPromptRefs(reg);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.check).toBe("prompt-ref-exists");
  });

  it("ignores non-prompt refs", () => {
    const reg = emptyRegistry({
      commands: [makeEntry({ id: "cmd", references: ["handoff:something"] })],
    });
    expect(checkPromptRefs(reg)).toEqual([]);
  });
});

// ── handoff-targets ──────────────────────────────────────────────────

describe("checkHandoffTargets", () => {
  it("passes when handoff refs and targets are valid", () => {
    const reg = emptyRegistry({
      commands: [
        makeEntry({ id: "source", references: ["handoff:target-cmd"] }),
        makeEntry({ id: "target-cmd" }),
      ],
      handoffTargets: [
        makeHandoff({ id: "handoff:target-cmd", targetCommandId: "target-cmd" }),
      ],
    });
    expect(checkHandoffTargets(reg)).toEqual([]);
  });

  it("detects missing handoff target entry", () => {
    const reg = emptyRegistry({
      commands: [makeEntry({ id: "source", references: ["handoff:missing"] })],
      handoffTargets: [],
    });
    const errors = checkHandoffTargets(reg);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.check).toBe("handoff-target-exists");
  });

  it("detects handoff target pointing to non-existent command", () => {
    const reg = emptyRegistry({
      commands: [makeEntry({ id: "source" })],
      handoffTargets: [
        makeHandoff({ id: "handoff:ghost", targetCommandId: "ghost" }),
      ],
    });
    const errors = checkHandoffTargets(reg);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.check).toBe("handoff-target-resolves");
  });
});

// ── agent-roles ──────────────────────────────────────────────────────

describe("checkAgentRoles", () => {
  it("passes when all role refs are valid", () => {
    const reg = emptyRegistry({
      commands: [makeEntry({ id: "cmd", references: ["role:reviewer"] })],
      agentRoles: [makeRole("role:reviewer")],
    });
    expect(checkAgentRoles(reg)).toEqual([]);
  });

  it("detects invalid role refs", () => {
    const reg = emptyRegistry({
      commands: [makeEntry({ id: "cmd", references: ["role:unknown"] })],
      agentRoles: [makeRole("role:reviewer")],
    });
    const errors = checkAgentRoles(reg);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.check).toBe("agent-role-valid");
  });

  it("ignores non-role refs", () => {
    const reg = emptyRegistry({
      commands: [makeEntry({ id: "cmd", references: ["prompt:something"] })],
    });
    expect(checkAgentRoles(reg)).toEqual([]);
  });
});
