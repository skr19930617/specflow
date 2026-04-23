// Task graph types — bundle-based structure for specflow-owned task planning.

// Bundle status superset. `subagent_failed` and `integration_rejected` are
// introduced by apply-worktree-isolation: they are terminal-for-invocation (the
// apply fails fast and stops) but NOT terminal at the run level — only
// /specflow.fix_apply or an operator reset can return the bundle to `pending`.
// They are bundle-only; child tasks never carry these values.
export type BundleStatus =
	| "pending"
	| "in_progress"
	| "done"
	| "skipped"
	| "subagent_failed"
	| "integration_rejected";

export type TaskStatus = "pending" | "in_progress" | "done" | "skipped";

export interface Task {
	readonly id: string;
	readonly title: string;
	readonly status: TaskStatus;
}

export interface Bundle {
	readonly id: string;
	readonly title: string;
	readonly goal: string;
	readonly depends_on: readonly string[];
	readonly inputs: readonly string[];
	readonly outputs: readonly string[];
	readonly status: BundleStatus;
	readonly tasks: readonly Task[];
	readonly owner_capabilities: readonly string[];
	readonly size_score?: number;
}

export interface TaskGraph {
	readonly version: string;
	readonly change_id: string;
	readonly bundles: readonly Bundle[];
	readonly generated_at: string;
	readonly generated_from: string;
}
