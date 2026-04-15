// Compile-time drift guard for the CoreRunState / LocalRunState partition.
//
// The `RunState` type in `src/types/contracts.ts` is defined as
// `CoreRunState & LocalRunState`. External runtimes (DB-backed, server
// orchestrator) persist only `CoreRunState`; the local filesystem adapter
// persists both halves. This file fails the TypeScript build if the two
// halves stop being disjoint or stop exhaustively covering `RunState`.
//
// Tests run via `node --test` against compiled `.js`, so the runtime body is
// a no-op. The real assertions are the two `const` declarations below —
// TypeScript rejects the file if either `AssertEqual` constraint is violated.
//
// See `docs/architecture.md` and
// `openspec/specs/workflow-run-state/spec.md` for the contract rationale.

import test from "node:test";
import type {
	CoreRunState,
	LocalRunState,
	RunState,
} from "../types/contracts.js";

// Invariant-style equality: only resolves to `true` when A and B are mutually
// assignable. Any drift (missing key, extra key, overlapping key) collapses
// the type to `never`, which the concrete `true` literal assignment below
// cannot satisfy — producing a TS2322 error and failing `tsc --noEmit`.
type AssertEqual<A, B> = [A] extends [B]
	? [B] extends [A]
		? true
		: never
	: never;

// Disjointness: no field name appears in both halves.
const _disjoint: AssertEqual<keyof CoreRunState & keyof LocalRunState, never> =
	true;

// Exhaustiveness: every `RunState` key belongs to exactly one half.
// Tautological given the current `RunState = CoreRunState & LocalRunState`
// definition, but fails if `RunState` is ever redeclared as a flat
// interface with keys outside the partition.
const _exhaustive: AssertEqual<
	keyof RunState,
	keyof CoreRunState | keyof LocalRunState
> = true;

// Suppress unused-locals diagnostics while keeping the assignments live.
void _disjoint;
void _exhaustive;

// Runtime no-op so `node --test` and the project's test harness register the
// file without warning. The real guard is the pair of `const` assertions
// above, checked by `tsc --noEmit`.
test("run-state partition drift guard (compile-time)", () => {});
