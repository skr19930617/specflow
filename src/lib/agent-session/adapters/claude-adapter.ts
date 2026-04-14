// Claude adapter — per-send spawns with --session-id for context continuity.
// Each send spawns `claude -p --session-id specflow-${changeId}`, waits for
// exit, and parses stdout. No long-running process is maintained.

import { spawnSync } from "node:child_process";
import type { SessionErrorKind } from "../errors.js";
import type { AgentConfig, AgentMessage, AgentResponse } from "../types.js";
import { resolveCommand } from "../../process.js";
import type { ProviderAdapter, ProviderHandle } from "./types.js";

/** Track handle-level liveness (not process liveness). */
const aliveHandles = new Set<string>();

function handleKey(h: ProviderHandle): string {
	return `${h.provider}:${h.changeId}:${h.sessionId}`;
}

export class ClaudeAdapter implements ProviderAdapter {
	readonly provider = "claude" as const;

	start(changeId: string, _config: AgentConfig): ProviderHandle {
		const sessionId = `specflow-${changeId}`;
		const handle: ProviderHandle = {
			provider: "claude",
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
		const claude = resolveCommand("SPECFLOW_CLAUDE", "claude");
		const args = [
			"-p",
			"--dangerously-skip-permissions",
			"--session-id",
			handle.sessionId,
		];
		const result = spawnSync(claude, args, {
			cwd: process.cwd(),
			input: message.prompt,
			encoding: "utf8",
			stdio: ["pipe", "pipe", "pipe"],
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
			// Check for auth failures in stderr.
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
				message: `claude exited with code ${result.status}: ${stderr}`,
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
