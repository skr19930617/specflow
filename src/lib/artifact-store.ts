// Store interfaces for artifact I/O abstraction.
// Core modules depend on these interfaces, never on filesystem paths or I/O primitives.

import type {
	ChangeArtifactQuery,
	ChangeArtifactRef,
	RunArtifactQuery,
	RunArtifactRef,
} from "./artifact-types.js";

export interface ChangeArtifactStore {
	read(ref: ChangeArtifactRef): string;
	write(ref: ChangeArtifactRef, content: string): void;
	exists(ref: ChangeArtifactRef): boolean;
	list(query: ChangeArtifactQuery): readonly ChangeArtifactRef[];
	listChanges(): readonly string[];
	changeExists(changeId: string): boolean;
}

export interface RunArtifactStore {
	read(ref: RunArtifactRef): string;
	write(ref: RunArtifactRef, content: string): void;
	exists(ref: RunArtifactRef): boolean;
	list(query?: RunArtifactQuery): readonly RunArtifactRef[];
}
