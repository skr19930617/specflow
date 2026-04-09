import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync, lstatSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { makeTempDir, removeTempDir, repoRoot, runNodeCli } from "./test-helpers.js";
import type { Manifest } from "../types/contracts.js";

test("manifest-driven installer deploys commands, links bins, and merges settings", () => {
  const tempHome = makeTempDir("specflow-home-");
  try {
    const settingsDir = join(tempHome, ".claude");
    mkdirSync(settingsDir, { recursive: true });
    writeFileSync(
      join(settingsDir, "settings.json"),
      JSON.stringify({ permissions: { allow: ["existing:rule"] } }, null, 2),
      "utf8",
    );

    const result = runNodeCli("specflow-install", [], repoRoot, { HOME: tempHome });
    assert.equal(result.status, 0, result.stderr);

    const manifest = JSON.parse(readFileSync(resolve(repoRoot, "dist/manifest.json"), "utf8")) as Manifest;
    const commandFiles = readdirSync(join(tempHome, ".claude/commands"));
    assert.equal(commandFiles.length, manifest.commands.length);

    const runLink = join(tempHome, "bin/specflow-run");
    assert.ok(existsSync(runLink));
    assert.ok(lstatSync(runLink).isSymbolicLink());

    const mergedSettings = JSON.parse(readFileSync(join(settingsDir, "settings.json"), "utf8")) as {
      permissions: { allow: string[] };
    };
    assert.ok(mergedSettings.permissions.allow.includes("existing:rule"));
    assert.ok(mergedSettings.permissions.allow.length >= 1);
  } finally {
    removeTempDir(tempHome);
  }
});
