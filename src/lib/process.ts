import { execFileSync, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { SchemaId } from "../types/contracts.js";
import { stringifySchemaJson } from "./schemas.js";

export interface CommandResult {
	readonly stdout: string;
	readonly stderr: string;
	readonly status: number;
}

export interface CommandOptions {
	readonly cwd: string;
	readonly env?: NodeJS.ProcessEnv;
	readonly stdin?: string;
}

export function exec(
	command: string,
	args: readonly string[],
	cwd: string,
	env: NodeJS.ProcessEnv = process.env,
): string {
	return execFileSync(command, [...args], {
		cwd,
		env,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
}

export function tryExec(
	command: string,
	args: readonly string[],
	cwd: string,
	env: NodeJS.ProcessEnv = process.env,
	stdin?: string,
): CommandResult {
	const result = spawnSync(command, [...args], {
		cwd,
		env,
		input: stdin,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	return {
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
		status: result.status ?? 1,
	};
}

export function moduleRepoRoot(moduleUrl: string): string {
	return resolve(dirname(fileURLToPath(moduleUrl)), "../..");
}

export function resolveCommand(envName: string, fallback: string): string {
	return process.env[envName] || fallback;
}

export function fail(
	message: string,
	code = 1,
	stream: "stderr" | "stdout" = "stderr",
): never {
	const target = stream === "stdout" ? process.stdout : process.stderr;
	target.write(`${message}\n`);
	process.exit(code);
}

export function printJson(value: unknown): void {
	process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function printSchemaJson(
	schemaId: SchemaId,
	value: unknown,
	options: {
		stream?: "stdout" | "stderr";
		pretty?: boolean;
	} = {},
): void {
	const target =
		(options.stream ?? "stdout") === "stdout" ? process.stdout : process.stderr;
	target.write(
		`${stringifySchemaJson(schemaId, value, { pretty: options.pretty })}\n`,
	);
}
