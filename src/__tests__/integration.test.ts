import { describe, it, expect } from "vitest";
import { runValidation } from "../validate.js";
import { registry } from "../registry.js";
import { generateManifest } from "../manifest.js";
import { readFileSync, existsSync, rmSync } from "node:fs";

describe("integration: full pipeline", () => {
  it("validates the real registry without errors", () => {
    const errors = runValidation();
    expect(errors).toEqual([]);
  });

  it("generates a manifest with all five asset groups", async () => {
    const manifestPath = "dist/manifest.json";
    if (existsSync(manifestPath)) rmSync(manifestPath);

    await generateManifest(registry);

    expect(existsSync(manifestPath)).toBe(true);
    const content = readFileSync(manifestPath, "utf-8");
    const manifest = JSON.parse(content);

    expect(manifest).toHaveProperty("commands");
    expect(manifest).toHaveProperty("prompts");
    expect(manifest).toHaveProperty("orchestrators");
    expect(manifest).toHaveProperty("handoffTargets");
    expect(manifest).toHaveProperty("agentRoles");
    expect(manifest).toHaveProperty("metadata");

    expect(manifest.commands.length).toBe(registry.commands.length);
    expect(manifest.prompts.length).toBe(registry.prompts.length);
    expect(manifest.orchestrators.length).toBe(registry.orchestrators.length);
    expect(manifest.handoffTargets.length).toBe(registry.handoffTargets.length);
    expect(manifest.agentRoles.length).toBe(registry.agentRoles.length);

    expect(manifest.metadata).toHaveProperty("generatedAt");
    expect(manifest.metadata).toHaveProperty("registryVersion");
    expect(manifest.metadata).toHaveProperty("gitCommit");
  });

  it("produces deterministic manifest output (excluding generatedAt)", async () => {
    await generateManifest(registry);
    const first = readFileSync("dist/manifest.json", "utf-8");
    const firstParsed = JSON.parse(first);

    await generateManifest(registry);
    const second = readFileSync("dist/manifest.json", "utf-8");
    const secondParsed = JSON.parse(second);

    // Remove generatedAt for comparison
    delete firstParsed.metadata.generatedAt;
    delete secondParsed.metadata.generatedAt;

    expect(firstParsed).toEqual(secondParsed);
  });
});
