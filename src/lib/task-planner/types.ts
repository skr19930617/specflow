// Task graph types — bundle-based structure for specflow-owned task planning.

export type BundleStatus = "pending" | "in_progress" | "done" | "skipped";

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
}

export interface TaskGraph {
	readonly version: string;
	readonly change_id: string;
	readonly bundles: readonly Bundle[];
	readonly generated_at: string;
	readonly generated_from: string;
}
