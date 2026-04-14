// Codex adapter — per-send spawns with --session for context continuity.
// Each send spawns `codex exec --session specflow-${changeId}`, waits for
// exit, and parses stdout. No long-running process is maintained.

import { spawnSync } from "node:child_process";
import { resolveCommand } from "../../process.js";
import type { SessionErrorKind } from "../errors.js";
import type { AgentConfig, AgentMessage, AgentResponse } from "../types.js";
import type { ProviderAdapter, ProviderHandle } from "./types.js";

const aliveHandles = new Set<string>();

function handleKey(h: ProviderHandle): string {
	return `${h.provider}:${h.changeId}:${h.sessionId}`;
}

export class CodexAdapter implements ProviderAdapter {
	readonly provider = "codex" as const;

	start(changeId: string, _config: AgentConfig): ProviderHandle {
		const sessionId = `specflow-${changeId}`;
		const handle: ProviderHandle = {
			provider: "codex",
			changeId,
			sessionId,
		};
		aliveHandles.add(handleKey(handle));
		return handle;
	}

	async send(
		handle: ProviderHandle,
		message: AgentMessage,
		timeoutMs: number,
	): Promise<AgentResponse> {
		const codex = resolveCommand("SPECFLOW_CODEX", "codex");
		const args = [
			"exec",
			"--full-auto",
			"--session",
			handle.sessionId,
			message.prompt,
		];
		const result = spawnSync(codex, args, {
			cwd: process.cwd(),
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
			timeout: timeoutMs,
		});

		if (result.error) {
			const kind: SessionErrorKind =
				(result.error as NodeJS.ErrnoException).code === "ETIMEDOUT"
					? "Timeout"
					: "ProcessDied";
			aliveHandles.delete(handleKey(handle));
			throw { kind, message: String(result.error) };
		}

		if (result.status !== 0 && result.status !== null) {
			const stderr = result.stderr ?? "";
			if (
				stderr.includes("authentication") ||
				stderr.includes("unauthorized") ||
				stderr.includes("API key")
			) {
				aliveHandles.delete(handleKey(handle));
				throw { kind: "AuthFailure" as SessionErrorKind, message: stderr };
			}
			aliveHandles.delete(handleKey(handle));
			throw {
				kind: "ProcessDied" as SessionErrorKind,
				message: `codex exited with code ${result.status}: ${stderr}`,
			};
		}

		return {
			output: result.stdout ?? "",
			exitCode: result.status ?? undefined,
		};
	}

	stop(handle: ProviderHandle): void {
		aliveHandles.delete(handleKey(handle));
	}

	isAlive(handle: ProviderHandle): boolean {
		return aliveHandles.has(handleKey(handle));
	}
}
