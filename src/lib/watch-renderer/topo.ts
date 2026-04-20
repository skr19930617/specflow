// Topological order over `depends_on` for task-graph bundle rendering.
//
// The watcher renders bundles top-to-bottom in a "dependencies before their
// dependents" order. Kahn-style traversal with a deterministic tie-break by
// the bundle's own insertion order (== generation order from the planner)
// keeps the render stable across redraws.

export interface TopoNode {
	readonly id: string;
	readonly depends_on: readonly string[];
}

/**
 * Return nodes in topological order. Cycles are tolerated: any node still
 * unresolved after the Kahn traversal is appended at the end in its original
 * position, so the renderer degrades to a best-effort listing rather than
 * throwing.
 */
export function topologicalOrder<T extends TopoNode>(
	nodes: readonly T[],
): readonly T[] {
	if (nodes.length === 0) return [];
	const indexById = new Map<string, number>();
	nodes.forEach((n, i) => {
		indexById.set(n.id, i);
	});

	const inDegree: number[] = nodes.map(() => 0);
	const outEdges: number[][] = nodes.map(() => []);
	for (let i = 0; i < nodes.length; i++) {
		const n = nodes[i];
		for (const dep of n.depends_on) {
			const depIdx = indexById.get(dep);
			if (depIdx === undefined) continue; // unknown dep, ignore
			inDegree[i]++;
			outEdges[depIdx].push(i);
		}
	}

	const queue: number[] = [];
	for (let i = 0; i < nodes.length; i++) {
		if (inDegree[i] === 0) queue.push(i);
	}
	// Preserve insertion order tie-break.
	queue.sort((a, b) => a - b);

	const visited = new Set<number>();
	const out: T[] = [];
	while (queue.length > 0) {
		const idx = queue.shift() as number;
		if (visited.has(idx)) continue;
		visited.add(idx);
		out.push(nodes[idx]);
		const nexts = outEdges[idx].slice();
		nexts.sort((a, b) => a - b);
		for (const next of nexts) {
			inDegree[next]--;
			if (inDegree[next] === 0 && !visited.has(next)) queue.push(next);
		}
	}

	if (out.length < nodes.length) {
		for (let i = 0; i < nodes.length; i++) {
			if (!visited.has(i)) out.push(nodes[i]);
		}
	}

	return out;
}
