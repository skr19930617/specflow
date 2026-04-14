// Disk-backed session metadata store for orphan cleanup.
// Persists session entries to .specflow/sessions/sessions.json using
// atomic writes (temp file + rename) per design risk R3.

import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { MainAgentName } from "../review-runtime.js";
import { atomicWriteText, ensureDir } from "../fs.js";

/** Persisted metadata for one session. */
export interface SessionMetadata {
	readonly changeId: string;
	readonly provider: MainAgentName;
	readonly pid: number;
	readonly sessionId: string;
	readonly createdAt: string;
}

/** Check whether a process is still alive. */
function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

/** Try to kill a process gracefully. */
function killProcess(pid: number): void {
	try {
		process.kill(pid, "SIGTERM");
	} catch {
		// Process already gone — ignore.
	}
}

export class SessionMetadataStore {
	private readonly filePath: string;
	private entries: Map<string, SessionMetadata>;

	constructor(repoRoot: string) {
		const dir = join(repoRoot, ".specflow", "sessions");
		ensureDir(dir);
		this.filePath = join(dir, "sessions.json");
		this.entries = this.load();
	}

	private load(): Map<string, SessionMetadata> {
		if (!existsSync(this.filePath)) {
			return new Map();
		}
		try {
			const raw = readFileSync(this.filePath, "utf8");
			const arr: readonly SessionMetadata[] = JSON.parse(raw);
			return new Map(arr.map((e) => [e.changeId, e]));
		} catch {
			// Corrupt file — start fresh.
			return new Map();
		}
	}

	private persist(): void {
		const arr = Array.from(this.entries.values());
		atomicWriteText(this.filePath, JSON.stringify(arr, null, 2));
	}

	/** Add a session entry. */
	add(entry: SessionMetadata): void {
		this.entries = new Map(this.entries).set(entry.changeId, entry);
		this.persist();
	}

	/** Remove a session entry by changeId. */
	remove(changeId: string): void {
		const next = new Map(this.entries);
		next.delete(changeId);
		this.entries = next;
		this.persist();
	}

	/** Get a session entry by changeId. */
	get(changeId: string): SessionMetadata | undefined {
		return this.entries.get(changeId);
	}

	/** List all entries. */
	all(): readonly SessionMetadata[] {
		return Array.from(this.entries.values());
	}

	/**
	 * Scan for and destroy stale sessions from a prior host-process lifecycle.
	 * Kills orphaned processes and removes their metadata entries.
	 */
	cleanup(): void {
		const staleIds: string[] = [];
		for (const entry of this.entries.values()) {
			if (isProcessAlive(entry.pid)) {
				// Process is still alive but belongs to a previous manager instance.
				killProcess(entry.pid);
			}
			staleIds.push(entry.changeId);
		}
		if (staleIds.length > 0) {
			let next = new Map(this.entries);
			for (const id of staleIds) {
				next = new Map(next);
				next.delete(id);
			}
			this.entries = next;
			this.persist();
		}
	}
}
