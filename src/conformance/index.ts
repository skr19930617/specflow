// Conformance test suite barrel export.
// External runtimes import these factories to validate their adapter implementations.

export { changeArtifactStoreConformance } from "./change-artifact-store.js";
export type { ConformanceTestContext } from "./run-artifact-store.js";
export { runArtifactStoreConformance } from "./run-artifact-store.js";
