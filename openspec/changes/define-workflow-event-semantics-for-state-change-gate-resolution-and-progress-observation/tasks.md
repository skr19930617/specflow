## 1. Author Workflow Observation Event Contract ✓

> Define the transport-agnostic observation-event spec with a fixed catalog, common envelope, payload schemas, and behavioral guarantees.

- [x] 1.1 Translate decisions D1-D9 into a requirement map for lifecycle, phase, gate, and progress observation events.
- [x] 1.2 Define the common envelope fields, nullability rules, and reference semantics for event, phase, gate, artifact, bundle, and causal context data.
- [x] 1.3 Enumerate the closed 15-event catalog and specify per-event payload schemas with all allowed status and outcome values.
- [x] 1.4 Add scenarios for per-run ordering, at-least-once delivery, bit-identical re-emission, bounded replay, disjointness from surface events, and coupled cause-to-effect ordering.

## 2. Bind Run-State Transitions To Observation Events ✓

> Update workflow-run-state so authoritative transitions consistently emit the required observation events without changing snapshot ownership.

> Depends on: author-workflow-observation-event-contract

- [x] 2.1 Map run-state transitions to the lifecycle and phase observation events they must emit, including explicit 1:N transition-to-event cases.
- [x] 2.2 Add delta requirements that bind transition emission and snapshot consistency to the new observation contract while preserving canonical run-state authority.
- [x] 2.3 State that the run-state CLI remains snapshot-only and carries no transport or history-serving responsibility.

## 3. Bind Gate Semantics To Observation Events ✓

> Update workflow-gate-semantics so gate lifecycle changes emit ordered observation events while gate records remain authoritative.

> Depends on: author-workflow-observation-event-contract

- [x] 3.1 Map gate open, resolve, and reject lifecycle changes to the corresponding observation events and single-terminal-per-gate rules.
- [x] 3.2 Add ordering requirements that gate events are emitted before any phase or lifecycle effects they directly cause.
- [x] 3.3 Reinforce that gate records stay authoritative and observation events are notification-side effects only.

## 4. Validate Observation Event Cross-Spec Consistency ✓

> Prove the three spec deltas agree on names, ordering, replay, and transition-to-event pairings and pass change validation.

> Depends on: bind-run-state-transitions-to-observation-events, bind-gate-semantics-to-observation-events

- [x] 4.1 Cross-check event names, envelope rules, causal context semantics, replay subset, and coupled ordering language across all three delta files.
- [x] 4.2 Verify every completion condition from C-obs-catalog through C-coupled-order is covered by explicit requirements and scenarios.
- [x] 4.3 Run openspec change validation and resolve any schema, naming, or traceability failures until the change passes cleanly.

## 5. Prepare Review And Archive Package ✓

> Package the validated spec-only change for review, archive, and downstream consumer announcement.

> Depends on: validate-observation-event-cross-spec-consistency

- [x] 5.1 Prepare review notes summarizing scope, non-goals, authoritative boundaries, and the reasons the contract stays transport-agnostic.
- [x] 5.2 Confirm the archive package includes all three deltas together and documents that no runtime migration or data migration is required.
- [x] 5.3 Draft downstream handoff notes for future transport, publisher, consumer, and spec-consistency follow-up changes.
