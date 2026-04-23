// Per-bundle execution mode assignment for apply-worktree-isolation.
//
// Assigns one of two modes to each bundle:
//   - `inline-main`: implemented directly by the main agent in the primary
//     workspace.
//   - `subagent-worktree`: dispatched to a subagent running inside a
//     dedicated ephemeral git worktree.
//
// The rule is intentionally the same as `bundle-subagent-execution`'s
// subagent-eligibility test: enabled + `size_score > threshold`. No
// additional signals (side-effect risk, lockfile touches, changed-path
// count) influence the decision in Phase 1.
//
// `subagent-shared` (a dispatched subagent without an isolated worktree) is
// NOT a supported mode. The enum is deliberately a two-value union.

import type { Bundle } from "../task-planner/types.js";
import type { DispatchConfig } from "./config.js";

export type BundleExecutionMode = "inline-main" | "subagent-worktree";

/**
 * Decide which execution mode a single bundle is assigned based solely on
 * its own subagent-eligibility. Returns `"subagent-worktree"` iff ALL of
 * these hold:
 *
 *   1. `config.enabled` is true
 *   2. `bundle.size_score` is defined
 *   3. `bundle.size_score > config.threshold`
 *
 * Otherwise returns `"inline-main"`. The rule is deterministic and has no
 * side effects — callers can safely evaluate it repeatedly.
 */
export function assignExecutionMode(
	bundle: Bundle,
	config: DispatchConfig,
): BundleExecutionMode {
	if (!config.enabled) return "inline-main";
	if (bundle.size_score === undefined) return "inline-main";
	if (bundle.size_score <= config.threshold) return "inline-main";
	return "subagent-worktree";
}
