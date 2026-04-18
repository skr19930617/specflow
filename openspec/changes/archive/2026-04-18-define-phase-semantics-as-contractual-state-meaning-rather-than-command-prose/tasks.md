## 1. Create Phase Semantics Baseline ✓

> Establish a spec-level authority that defines the six-role meaning of every canonical workflow phase, including terminal phases.

- [x] 1.1 Extract the canonical phase set and vocabulary constraints from the owning baseline specs
- [x] 1.2 Define the six mandatory phase roles, terminal sentinels, and delegation boundary classifications for the new baseline
- [x] 1.3 Enumerate all 21 phases with per-phase values for inputs, outputs, completion, branching, and delegation
- [x] 1.4 Archive the change so the new phase-semantics baseline exists and validates cleanly

## 2. Ground Phase Contract Types ✓

> Make the PhaseContract baseline an explicit lossless encoding of phase-semantics without adding new interface fields.

> Depends on: create-phase-semantics-baseline

- [x] 2.1 Map the six semantic roles onto existing PhaseContract fields and document the lossless encoding requirement
- [x] 2.2 Declare cliCommands a normative encoding of deterministic work rather than an adapter-private detail
- [x] 2.3 Align the baseline wording with the no-new-fields constraint and the phase-semantics authority model

## 3. Ground Phase Contract Structure ✓

> Anchor PhaseIODescriptor and GateCondition in the phase-semantics role model while preserving the current structural surface.

> Depends on: create-phase-semantics-baseline

- [x] 3.1 Define how required inputs and expected outputs are expressed through PhaseIODescriptor
- [x] 3.2 Define how branching and gate conditions are expressed through GateCondition using existing vocabulary only
- [x] 3.3 Clarify the discriminated-union extension policy and cross-references back to phase-semantics

## 4. Reconcile Phase Contract Registry Data ✓

> Make the TypeScript phase contract registry recover every phase-semantics role from existing fields for all 21 phases.

> Depends on: create-phase-semantics-baseline

- [x] 4.1 Audit every phaseContractData entry against the per-phase semantics matrix
- [x] 4.2 Update existing encoding fields for inputs, outputs, events, gates, delegation, terminal markers, and next-phase metadata
- [x] 4.3 Normalize explicit empty-set and terminal-sentinel encodings for terminal and purely agent-delegated phases
- [x] 4.4 Record any intentional residual disagreements as Accepted Spec Conflicts with rationale and follow-up references

## 5. Reconcile Slash Command Prose ✓

> Remove factual disagreements between slash command templates and phase-semantics while leaving broader prose redesign out of scope.

> Depends on: create-phase-semantics-baseline

- [x] 5.1 Audit command templates for incorrect inputs, outputs, branching, or delegation claims
- [x] 5.2 Correct factual mismatches so command prose references phase meaning instead of redefining it incorrectly
- [x] 5.3 Capture any large unresolved prose gaps as Accepted Spec Conflicts with follow-up references

## 6. Align Phase Contract Tests ✓

> Update value-level tests so they validate the reconciled registry data without changing the public structure of the test suite.

> Depends on: reconcile-phase-contract-registry-data

- [x] 6.1 Update assertions that lock in old PhaseContract values to match the reconciled registry data
- [x] 6.2 Preserve the current test structure and add only minimal losslessness coverage if required
- [x] 6.3 Run the phase-contract test targets and confirm green assertions after the data sweep

## 7. Validate Phase Semantics Rollout ✓

> Prove that the new semantic authority, encodings, data, prose, and tests are mutually consistent and ready for review.

> Depends on: ground-phase-contract-types, ground-phase-contract-structure, reconcile-phase-contract-registry-data, reconcile-slash-command-prose, align-phase-contract-tests

- [x] 7.1 Run openspec validate and spec verification across the archived baselines and reconciled artifacts
- [x] 7.2 Confirm that any Accepted Spec Conflicts are fully documented or that no unresolved divergences remain
- [x] 7.3 Assemble review evidence showing tests are green and the change is ready for design and apply review gates
