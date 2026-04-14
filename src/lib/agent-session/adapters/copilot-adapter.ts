// Copilot adapter — persistent child process with stdin/stdout shim.
// Unlike Claude/Codex, Copilot lacks native session IDs, so the "session"
// is the fact that the child process stays alive and retains its
// conversation context in memory.

import { type ChildProcess, spawn } from "node:child_process";
import type { SessionErrorKind } from "../errors.js";
import type { AgentConfig, AgentMessage, AgentResponse } from "../types.js";
import { resolveCommand } from "../../process.js";
import type { ProviderAdapter, ProviderHandle } from "./types.js";

/** Extended handle that tracks the live child process. */
interface CopilotHandle extends ProviderHandle {
	readonly pid: number;
}

/** Map from handle key to the live child process reference. */
const childProcesses = new Map<string, ChildProcess>();

function handleKey(h: ProviderHandle): string {
	return `${h.provider}:${h.changeId}:${h.sessionId}`;
}

export class CopilotAdapter implements ProviderAdapter {
	readonly provider = "copilot" as const;

	start(changeId: string, _config: AgentConfig): CopilotHandle {
		const sessionId = `specflow-${changeId}`;
		const copilot = resolveCommand("SPECFLOW_COPILOT", "copilot");
		const child = spawn(copilot, ["-p", "--allow-all-tools", "-s"], {
			cwd: process.cwd(),
			stdio: ["pipe", "pipe", "pipe"],
		});

		const handle: CopilotHandle = {
			provider: "copilot",
			changeId,
			sessionId,
			pid: child.pid ?? 0,
		};
		childProcesses.set(handleKey(handle), child);
		return handle;
	}

	async send(
		handle: ProviderHandle,
		message: AgentMessage,
		timeoutMs: number,
	): Promise<AgentResponse> {
		const key = handleKey(handle);
		const child = childProcesses.get(key);
		if (!child || child.exitCode !== null) {
			throw {
				kind: "ProcessDied" as SessionErrorKind,
				message: "Copilot child process is not running",
			};
		}

		return new Promise<AgentResponse>((resolve, reject) => {
			const chunks: Buffer[] = [];
			let settled = false;

			const timer = setTimeout(() => {
				if (!settled) {
					settled = true;
					reject({
						kind: "Timeout" as SessionErrorKind,
						message: `Copilot did not respond within ${timeoutMs}ms`,
					});
				}
			}, timeoutMs);

			const onData = (chunk: Buffer): void => {
				chunks.push(chunk);
				// Simple delimiter: look for a newline at the end indicating
				// the agent has finished its response. The exact framing
				// protocol is an implementation detail resolved during coding.
				const output = Buffer.concat(chunks).toString("utf8");
				if (output.endsWith("\n")) {
					if (!settled) {
						settled = true;
						clearTimeout(timer);
						child.stdout?.removeListener("data", onData);
						resolve({ output: output.trimEnd() });
					}
				}
			};

			const onError = (err: Error): void => {
				if (!settled) {
					settled = true;
					clearTimeout(timer);
					reject({
						kind: "ProcessDied" as SessionErrorKind,
						message: String(err),
					});
				}
			};

			child.stdout?.on("data", onData);
			child.once("error", onError);
			child.once("exit", () => {
				if (!settled) {
					settled = true;
					clearTimeout(timer);
					reject({
						kind: "ProcessDied" as SessionErrorKind,
						message: "Copilot child process exited unexpectedly",
					});
				}
			});

			// Write the message to stdin.
			child.stdin?.write(`${message.prompt}\n`);
		});
	}

	stop(handle: ProviderHandle): void {
		const key = handleKey(handle);
		const child = childProcesses.get(key);
		if (child) {
			try {
				child.kill("SIGTERM");
			} catch {
				// Already dead — ignore.
			}
			childProcesses.delete(key);
		}
	}

	isAlive(handle: ProviderHandle): boolean {
		const key = handleKey(handle);
		const child = childProcesses.get(key);
		return child !== undefined && child.exitCode === null;
	}

	/** Get the child PID for session metadata persistence. */
	getPid(handle: ProviderHandle): number {
		return (handle as CopilotHandle).pid;
	}
}
