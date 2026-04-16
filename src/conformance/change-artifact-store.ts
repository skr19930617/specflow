// Conformance test factory for ChangeArtifactStore implementations.
// External runtimes import this to validate their adapter against the contract.

import type { ChangeArtifactStore } from "../lib/artifact-store.js";
import {
	ArtifactStoreError,
	ChangeArtifactType,
	changeRef,
} from "../lib/artifact-types.js";

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

export function changeArtifactStoreConformance(
	store: ChangeArtifactStore,
	ctx: ConformanceTestContext,
): void {
	const { describe, it, expect } = ctx;

	describe("ChangeArtifactStore conformance", () => {
		it("read-after-write round-trip returns identical content", async () => {
			const ref = changeRef(
				"conformance-change-1",
				ChangeArtifactType.Proposal,
			);
			const content = "# Proposal\n\nConformance test proposal.";
			await store.write(ref, content);
			const result = await store.read(ref);
			expect(result).toBe(content);
		});

		it("exists returns true after write", async () => {
			const ref = changeRef(
				"conformance-change-exists",
				ChangeArtifactType.Design,
			);
			await store.write(ref, "# Design\n\nTest.");
			const result = await store.exists(ref);
			expect(result).toBeTruthy();
		});

		it("exists returns false before write", async () => {
			const ref = changeRef(
				"conformance-change-never",
				ChangeArtifactType.Tasks,
			);
			const result = await store.exists(ref);
			expect(result).toBeFalsy();
		});

		it("read of non-existent artifact rejects with not_found", async () => {
			const ref = changeRef(
				"conformance-change-missing",
				ChangeArtifactType.Proposal,
			);
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

		it("list returns refs for existing artifacts", async () => {
			const ref = changeRef(
				"conformance-change-list",
				ChangeArtifactType.Proposal,
			);
			await store.write(ref, "# Test");
			const refs = await store.list({
				changeId: "conformance-change-list",
				type: ChangeArtifactType.Proposal,
			});
			expect(refs.length).toBe(1);
		});

		it("changeExists returns true after creating artifacts", async () => {
			const ref = changeRef(
				"conformance-change-ce",
				ChangeArtifactType.Proposal,
			);
			await store.write(ref, "# Test");
			const result = await store.changeExists("conformance-change-ce");
			expect(result).toBeTruthy();
		});
	});
}
