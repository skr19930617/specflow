// Pure derivation of PhaseAction from PhaseContract metadata.
// No side effects, no I/O — unit-testable in isolation.

import { MalformedContractError } from "./errors.js";
import type { PhaseAction, PhaseContract, PhaseNextAction } from "./types.js";

const VALID_NEXT_ACTIONS: readonly PhaseNextAction[] = [
	"invoke_agent",
	"await_user",
	"advance",
	"terminal",
] as const;

export function isGated(contract: PhaseContract): boolean {
	return contract.gated === true;
}

export function isTerminal(contract: PhaseContract): boolean {
	return contract.terminal === true;
}

/**
 * Derive the PhaseAction for a contract.
 *
 * Precedence:
 *   terminal → gated (await_user) → invoke_agent → advance → throw
 *
 * Any shape violation (missing required scalars, unrecognized next_action,
 * missing kind-specific metadata, or contradictory flags) throws
 * MalformedContractError and emits no event.
 */
export function deriveAction(contract: PhaseContract): PhaseAction {
	// Validate required scalar fields first so callers get actionable errors.
	if (typeof contract.phase !== "string" || contract.phase.length === 0) {
		throw new MalformedContractError(
			String(contract.phase),
			"phase",
			"missing or empty",
		);
	}
	if (typeof contract.next_action !== "string") {
		throw new MalformedContractError(
			contract.phase,
			"next_action",
			"missing or not a string",
		);
	}
	if (!VALID_NEXT_ACTIONS.includes(contract.next_action)) {
		throw new MalformedContractError(
			contract.phase,
			"next_action",
			`unrecognized value: ${String(contract.next_action)}`,
		);
	}
	if (typeof contract.gated !== "boolean") {
		throw new MalformedContractError(
			contract.phase,
			"gated",
			"must be boolean",
		);
	}
	if (typeof contract.terminal !== "boolean") {
		throw new MalformedContractError(
			contract.phase,
			"terminal",
			"must be boolean",
		);
	}

	// Contradiction: terminal and gated cannot both be true.
	if (contract.terminal && contract.gated) {
		throw new MalformedContractError(
			contract.phase,
			"terminal/gated",
			"cannot both be true",
		);
	}

	// Terminal takes precedence.
	if (contract.terminal) {
		if (contract.next_action !== "terminal") {
			throw new MalformedContractError(
				contract.phase,
				"next_action",
				'terminal=true requires next_action="terminal"',
			);
		}
		if (typeof contract.terminal_reason !== "string") {
			throw new MalformedContractError(
				contract.phase,
				"terminal_reason",
				"required when terminal=true",
			);
		}
		return { kind: "terminal", reason: contract.terminal_reason };
	}

	// Gated: emission + await_user. Enforced by the router; here we just
	// derive the action value.
	if (contract.gated) {
		if (contract.next_action !== "await_user") {
			throw new MalformedContractError(
				contract.phase,
				"next_action",
				'gated=true requires next_action="await_user"',
			);
		}
		if (typeof contract.gated_event_kind !== "string") {
			throw new MalformedContractError(
				contract.phase,
				"gated_event_kind",
				"required when gated=true",
			);
		}
		if (typeof contract.gated_event_type !== "string") {
			throw new MalformedContractError(
				contract.phase,
				"gated_event_type",
				"required when gated=true",
			);
		}
		return { kind: "await_user", event_kind: contract.gated_event_kind };
	}

	// Non-terminal, non-gated: dispatch on next_action.
	// Exhaustive switch — TypeScript flags any new PhaseNextAction kind here.
	switch (contract.next_action) {
		case "invoke_agent": {
			if (typeof contract.agent !== "string") {
				throw new MalformedContractError(
					contract.phase,
					"agent",
					'required when next_action="invoke_agent"',
				);
			}
			return { kind: "invoke_agent", agent: contract.agent };
		}
		case "advance": {
			if (typeof contract.advance_event !== "string") {
				throw new MalformedContractError(
					contract.phase,
					"advance_event",
					'required when next_action="advance"',
				);
			}
			return { kind: "advance", event: contract.advance_event };
		}
		// The following two cases are belt-and-suspenders: the terminal/gated
		// guards above already consume any contract whose next_action is
		// "terminal" or "await_user" when the flags agree. These throws catch
		// the contradictory case where the flags lie (e.g. next_action="await_user"
		// with gated=false), which deriveAction must still reject explicitly.
		case "await_user":
			throw new MalformedContractError(
				contract.phase,
				"gated",
				'next_action="await_user" requires gated=true',
			);
		case "terminal":
			throw new MalformedContractError(
				contract.phase,
				"terminal",
				'next_action="terminal" requires terminal=true',
			);
	}
}
