// Store interfaces for artifact I/O abstraction.
// Core modules depend on these interfaces, never on filesystem paths or I/O primitives.
// All methods are async (Promise-based) to support DB-backed and network-backed adapters.

import type {
	ChangeArtifactQuery,
	ChangeArtifactRef,
	RunArtifactQuery,
	RunArtifactRef,
} from "./artifact-types.js";

export interface ChangeArtifactStore {
	read(ref: ChangeArtifactRef): Promise<string>;
	write(ref: ChangeArtifactRef, content: string): Promise<void>;
	exists(ref: ChangeArtifactRef): Promise<boolean>;
	list(query: ChangeArtifactQuery): Promise<readonly ChangeArtifactRef[]>;
	listChanges(): Promise<readonly string[]>;
	changeExists(changeId: string): Promise<boolean>;
}

export interface RunArtifactStore {
	read(ref: RunArtifactRef): Promise<string>;
	write(ref: RunArtifactRef, content: string): Promise<void>;
	exists(ref: RunArtifactRef): Promise<boolean>;
	list(query?: RunArtifactQuery): Promise<readonly RunArtifactRef[]>;
}
