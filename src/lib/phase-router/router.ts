// PhaseRouter — deterministic phase-to-action router for server-side
// workflow orchestration. Holds no per-runId locks. Mutates nothing on the
// RunArtifactStore — the only side effect across the entire PhaseRouter
// surface is gated surface event emission (synchronous, deduped).

import type { RunHistoryEntry, RunState } from "../../types/contracts.js";
import type { RunArtifactStore } from "../artifact-store.js";
import { runRef } from "../artifact-types.js";
import { deriveAction } from "./derive-action.js";
import {
	InconsistentRunStateError,
	MissingContractError,
	RunReadError,
} from "./errors.js";
import type {
	PhaseAction,
	PhaseContract,
	PhaseContractRegistry,
	SurfaceEvent,
	SurfaceEventSink,
} from "./types.js";

export interface PhaseRouterDeps {
	readonly store: RunArtifactStore;
	readonly eventSink: SurfaceEventSink;
	readonly contracts: PhaseContractRegistry;
	/** Injectable clock for deterministic emitted_at in tests. */
	readonly now?: () => Date;
}

/**
 * Per-runId dedup state.
 *
 * `entryAt` is the ISO timestamp of the most recent transition into the
 * current phase. When the run re-enters the same phase, `entryAt` advances
 * and `emitted` is reset. This naturally satisfies:
 *   - repeated nextAction in the same entry → no duplicate emission
 *   - run re-enters the same gated phase → emission happens again
 */
interface DedupEntry {
	readonly entryAt: string;
	readonly emitted: Set<string>;
}

export class PhaseRouter {
	private readonly store: RunArtifactStore;
	private readonly eventSink: SurfaceEventSink;
	private readonly contracts: PhaseContractRegistry;
	private readonly now: () => Date;
	private readonly dedup: Map<string, DedupEntry> = new Map();

	constructor(deps: PhaseRouterDeps) {
		this.store = deps.store;
		this.eventSink = deps.eventSink;
		this.contracts = deps.contracts;
		this.now = deps.now ?? (() => new Date());
	}

	/**
	 * Return the PhaseContract for the run's current phase.
	 * Throws on missing/malformed contract, read failure, or inconsistent
	 * run state — never emits.
	 */
	currentPhase(runId: string): PhaseContract {
		const run = this.readRun(runId);
		const contract = this.resolveContract(run);
		this.assertConsistent(runId, run, contract);
		return contract;
	}

	/**
	 * Return the next PhaseAction the orchestrator should take.
	 * For gated phases, synchronously emits the gated surface event to the
	 * sink (deduped by (runId, phase-entry, event_kind)) before returning.
	 *
	 * Read-only with respect to RunArtifactStore: advance actions do NOT
	 * cause the router to write to the store — the orchestrator is
	 * responsible for store.advance.
	 */
	nextAction(runId: string): PhaseAction {
		const run = this.readRun(runId);
		const contract = this.resolveContract(run);
		this.assertConsistent(runId, run, contract);
		const action = deriveAction(contract);

		if (action.kind === "await_user") {
			const entryAt = this.currentEntryAt(run);
			if (!this.hasEmitted(runId, entryAt, action.event_kind)) {
				const event: SurfaceEvent = {
					run_id: runId,
					phase: contract.phase,
					event_kind: action.event_kind,
					emitted_at: this.now().toISOString(),
				};
				this.eventSink.emit(event);
				this.recordEmitted(runId, entryAt, action.event_kind);
			}
		}
		return action;
	}

	// --- internals ---

	private readRun(runId: string): RunState {
		let raw: string;
		try {
			raw = this.store.read(runRef(runId));
		} catch (cause) {
			throw new RunReadError(runId, cause);
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch (cause) {
			throw new RunReadError(runId, cause);
		}
		if (
			parsed === null ||
			typeof parsed !== "object" ||
			typeof (parsed as { current_phase?: unknown }).current_phase !== "string"
		) {
			throw new RunReadError(
				runId,
				new Error("run.json missing required field: current_phase"),
			);
		}
		const run = parsed as RunState;
		if (!Array.isArray(run.history)) {
			throw new RunReadError(
				runId,
				new Error("run.json missing required field: history"),
			);
		}
		for (let i = 0; i < run.history.length; i++) {
			const entry = run.history[i] as Partial<RunHistoryEntry> | undefined;
			if (
				entry === null ||
				typeof entry !== "object" ||
				typeof entry.to !== "string" ||
				typeof entry.timestamp !== "string"
			) {
				throw new RunReadError(
					runId,
					new Error(
						`run.json history[${i}] missing required string fields: to, timestamp`,
					),
				);
			}
		}
		return run;
	}

	private resolveContract(run: RunState): PhaseContract {
		const contract = this.contracts.get(run.current_phase);
		if (!contract) {
			throw new MissingContractError(run.current_phase);
		}
		return contract;
	}

	private assertConsistent(
		runId: string,
		run: RunState,
		contract: PhaseContract,
	): void {
		if (contract.phase !== run.current_phase) {
			throw new InconsistentRunStateError(
				runId,
				`contract.phase "${contract.phase}" does not match run.current_phase "${run.current_phase}"`,
			);
		}
		if (contract.terminal === true && contract.gated === true) {
			throw new InconsistentRunStateError(
				runId,
				`phase "${contract.phase}" has both terminal=true and gated=true`,
			);
		}
	}

	private currentEntryAt(run: RunState): string {
		for (let i = run.history.length - 1; i >= 0; i--) {
			const entry = run.history[i] as RunHistoryEntry;
			if (entry.to === run.current_phase) {
				return entry.timestamp;
			}
		}
		throw new InconsistentRunStateError(
			run.run_id,
			`no history entry transitions into current_phase "${run.current_phase}"`,
		);
	}

	private hasEmitted(
		runId: string,
		entryAt: string,
		eventKind: string,
	): boolean {
		const entry = this.dedup.get(runId);
		if (!entry || entry.entryAt !== entryAt) {
			return false;
		}
		return entry.emitted.has(eventKind);
	}

	private recordEmitted(
		runId: string,
		entryAt: string,
		eventKind: string,
	): void {
		const existing = this.dedup.get(runId);
		if (!existing || existing.entryAt !== entryAt) {
			this.dedup.set(runId, { entryAt, emitted: new Set([eventKind]) });
			return;
		}
		existing.emitted.add(eventKind);
	}
}
