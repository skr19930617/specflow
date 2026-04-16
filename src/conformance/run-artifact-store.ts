// Conformance test factory for RunArtifactStore implementations.
// External runtimes import this to validate their adapter against the contract.

import type { RunArtifactStore } from "../lib/artifact-store.js";
import { ArtifactStoreError, runRef } from "../lib/artifact-types.js";

export interface ConformanceTestContext {
	readonly describe: (name: string, fn: () => void) => void;
	readonly it: (name: string, fn: () => void | Promise<void>) => void;
	readonly expect: (value: unknown) => {
		toBe(expected: unknown): void;
		toEqual(expected: unknown): void;
		toBeTruthy(): void;
		toBeFalsy(): void;
	};
}

export function runArtifactStoreConformance(
	store: RunArtifactStore,
	ctx: ConformanceTestContext,
): void {
	const { describe, it, expect } = ctx;

	describe("RunArtifactStore conformance", () => {
		it("read-after-write round-trip returns identical content", async () => {
			const ref = runRef("conformance-test-1");
			const content = '{"run_id":"conformance-test-1","status":"active"}';
			await store.write(ref, content);
			const result = await store.read(ref);
			expect(result).toBe(content);
		});

		it("exists returns true after write", async () => {
			const ref = runRef("conformance-test-exists");
			await store.write(ref, '{"run_id":"conformance-test-exists"}');
			const result = await store.exists(ref);
			expect(result).toBeTruthy();
		});

		it("exists returns false for non-existent run", async () => {
			const ref = runRef("conformance-never-written");
			const result = await store.exists(ref);
			expect(result).toBeFalsy();
		});

		it("read of non-existent run rejects with ArtifactStoreError not_found", async () => {
			const ref = runRef("conformance-not-found");
			try {
				await store.read(ref);
				throw new Error("Expected rejection");
			} catch (e) {
				expect(e instanceof ArtifactStoreError).toBeTruthy();
				if (e instanceof ArtifactStoreError) {
					expect(e.kind).toBe("not_found");
				}
			}
		});

		it("list filters by changeId", async () => {
			const refA = runRef("conformance-change-a-1");
			const refB = runRef("conformance-change-b-1");
			await store.write(refA, '{"run_id":"conformance-change-a-1"}');
			await store.write(refB, '{"run_id":"conformance-change-b-1"}');

			const filtered = await store.list({ changeId: "conformance-change-a" });
			const runIds = filtered.map((r) => r.runId);
			expect(runIds).toEqual(["conformance-change-a-1"]);
		});

		it("list without filter returns all runs", async () => {
			const ref1 = runRef("conformance-all-x-1");
			const ref2 = runRef("conformance-all-y-1");
			await store.write(ref1, '{"run_id":"conformance-all-x-1"}');
			await store.write(ref2, '{"run_id":"conformance-all-y-1"}');

			const all = await store.list();
			const runIds = all.map((r) => r.runId);
			expect(runIds.includes("conformance-all-x-1")).toBeTruthy();
			expect(runIds.includes("conformance-all-y-1")).toBeTruthy();
		});

		it("overwrite replaces content", async () => {
			const ref = runRef("conformance-overwrite-1");
			await store.write(ref, '{"version":1}');
			await store.write(ref, '{"version":2}');
			const result = await store.read(ref);
			expect(result).toBe('{"version":2}');
		});
	});
}
