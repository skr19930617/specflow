#!/usr/bin/env node
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const forced = process.env.SPECFLOW_FORCE_POSTINSTALL === "1";
const skipped = process.env.SPECFLOW_SKIP_AUTO_INSTALL === "1";
const globalInstall =
	process.env.npm_config_global === "true" ||
	process.env.npm_config_location === "global";

if (skipped || (!forced && !globalInstall)) {
	process.exit(0);
}

const installer = resolve(process.cwd(), "dist/bin/specflow-install.js");
if (!existsSync(installer)) {
	process.exit(0);
}

const result = spawnSync(process.execPath, [installer], {
	cwd: process.cwd(),
	stdio: "inherit",
	env: process.env,
});

process.exit(result.status ?? 1);
