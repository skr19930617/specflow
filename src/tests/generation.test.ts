import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { contracts } from "../contracts/install.js";
import type { InstallPlan, Manifest } from "../types/contracts.js";

test("generated manifest and install plan reflect contracts", () => {
  const manifest = JSON.parse(readFileSync("dist/manifest.json", "utf8")) as Manifest;
  const installPlan = JSON.parse(readFileSync("dist/install-plan.json", "utf8")) as InstallPlan;

  assert.equal(manifest.commands.length, contracts.commands.length);
  assert.equal(manifest.prompts.length, contracts.prompts.length);
  assert.equal(manifest.orchestrators.length, contracts.orchestrators.length);
  assert.equal(manifest.workflows.length, 1);
  assert.equal(manifest.templates.length, contracts.templates.length);
  assert.equal(installPlan.links.length, contracts.installLinks.length);
  assert.equal(installPlan.copies.length, contracts.installCopies.length);
});

test("generated slash commands include run-state hook injections", () => {
  const specflow = readFileSync("global/commands/specflow.md", "utf8");
  const apply = readFileSync("global/commands/specflow.apply.md", "utf8");

  assert.ok(specflow.includes("## Run State Hooks"));
  assert.ok(specflow.includes("specflow-run start"));
  assert.ok(apply.includes("accept_design"));
});

test("command contracts render without legacy command source paths", async () => {
  const { contracts } = await import("../contracts/install.js");
  for (const command of contracts.commands) {
    assert.ok(command.body.sections.length > 0);
    assert.equal("legacySourcePath" in (command as unknown as Record<string, unknown>), false);
  }
});
