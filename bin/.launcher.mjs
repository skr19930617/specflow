#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const invokedName = basename(process.argv[1]);
const target = resolve(here, "../dist/bin", `${invokedName}.js`);

if (!existsSync(target)) {
	process.stderr.write(
		`Error: ${target} not found. Run 'npm run build' first.\n`,
	);
	process.exit(1);
}

const result = spawnSync(process.execPath, [target, ...process.argv.slice(2)], {
	cwd: process.cwd(),
	stdio: "inherit",
	env: process.env,
});

process.exit(result.status ?? 1);
