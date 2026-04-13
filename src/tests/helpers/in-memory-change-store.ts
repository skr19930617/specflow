// In-memory ChangeArtifactStore for core-runtime tests.

import type { ChangeArtifactStore } from "../../lib/artifact-store.js";
import {
	ArtifactNotFoundError,
	type ChangeArtifactQuery,
	type ChangeArtifactRef,
	changeRef,
	isChangeArtifactType,
	UnknownArtifactTypeError,
} from "../../lib/artifact-types.js";

function keyFor(ref: ChangeArtifactRef): string {
	return "qualifier" in ref
		? `${ref.changeId}|${ref.type}|${ref.qualifier}`
		: `${ref.changeId}|${ref.type}`;
}

export interface InMemoryChangeArtifactStore extends ChangeArtifactStore {
	readonly seed: (ref: ChangeArtifactRef, content: string) => void;
}

export function createInMemoryChangeArtifactStore(): InMemoryChangeArtifactStore {
	const contents = new Map<string, string>();

	function ensureType(ref: ChangeArtifactRef): void {
		if (!isChangeArtifactType(ref.type)) {
			throw new UnknownArtifactTypeError(ref.type);
		}
	}

	return {
		read(ref: ChangeArtifactRef): string {
			ensureType(ref);
			const content = contents.get(keyFor(ref));
			if (content === undefined) {
				throw new ArtifactNotFoundError(ref);
			}
			return content;
		},
		write(ref: ChangeArtifactRef, content: string): void {
			ensureType(ref);
			contents.set(keyFor(ref), content);
		},
		exists(ref: ChangeArtifactRef): boolean {
			ensureType(ref);
			return contents.has(keyFor(ref));
		},
		list(query: ChangeArtifactQuery): readonly ChangeArtifactRef[] {
			const prefix = `${query.changeId}|${query.type}`;
			const refs: ChangeArtifactRef[] = [];
			for (const key of contents.keys()) {
				if (!key.startsWith(prefix)) continue;
				const rest = key.slice(prefix.length);
				if (rest === "") {
					refs.push(changeRef(query.changeId, query.type as never));
				} else if (rest.startsWith("|")) {
					const qualifier = rest.slice(1);
					refs.push(
						changeRef(query.changeId, query.type as never, qualifier as never),
					);
				}
			}
			return refs;
		},
		listChanges(): readonly string[] {
			const ids = new Set<string>();
			for (const key of contents.keys()) {
				const [changeId] = key.split("|");
				if (changeId) ids.add(changeId);
			}
			return Array.from(ids).sort();
		},
		changeExists(changeId: string): boolean {
			for (const key of contents.keys()) {
				if (key.startsWith(`${changeId}|`)) return true;
			}
			return false;
		},
		seed(ref: ChangeArtifactRef, content: string): void {
			ensureType(ref);
			contents.set(keyFor(ref), content);
		},
	};
}
