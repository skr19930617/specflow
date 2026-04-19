## 1. Lock Observability Contract Deltas ✓

> Define the additive autofix progress contract across existing specs before any runtime wiring begins.

- [x] 1.1 Add the additive autofix payload contract to review_completed without expanding the closed event catalog
- [x] 1.2 Specify snapshot fields, run_id plus phase pathing, stale-heartbeat abandoned classification, and ledger-over-event-over-snapshot authority precedence
- [x] 1.3 Define autofix heartbeat and stale-threshold config keys with invalid-to-default fallback semantics aligned to existing review config behavior
- [x] 1.4 Document the canonical slash-command background plus polling pattern and terminal-only finalization rule

## 2. Wire Shared Schemas And Types ✓

> Encode the new autofix event payload and progress snapshot contracts in shared runtime schemas and types.

> Depends on: contract-observability-deltas

- [x] 2.1 Extend observation event contract types to support optional autofix payloads on review_completed
- [x] 2.2 Add snapshot schema definitions for loop_state, terminal_outcome, counters, heartbeat_at, and ledger_round_id
- [x] 2.3 Export shared validation and serialization helpers so CLI and runtime code consume one contract shape

## 3. Add Snapshot And Heartbeat Runtime Support ✓

> Provide reusable runtime support for config-backed autofix progress snapshots keyed by run and phase.

> Depends on: schema-and-type-wiring

- [x] 3.1 Extend readReviewConfig to expose autofix_heartbeat_seconds and autofix_stale_threshold_seconds with default values 30 and 120
- [x] 3.2 Implement deterministic run-artifact-store path resolution for autofix-progress-<phase>.json under a run_id-scoped location
- [x] 3.3 Build snapshot write and heartbeat refresh helpers that update non-terminal loop state without emitting extra events
- [x] 3.4 Derive snapshot counters and ledger_round_id references from the review ledger while preserving ledger authority

## 4. Instrument Autofix Loop CLIs ✓

> Make design and apply autofix loops emit round progress events and snapshot transitions at each boundary and on exit.

> Depends on: schema-and-type-wiring, runtime-snapshot-and-config

- [x] 4.1 Wire round-start review_completed emissions with loop_state starting or in_progress for the design and apply autofix loops
- [x] 4.2 Wire round-end review_completed emissions with awaiting_review or terminal loop states for both CLIs
- [x] 4.3 Emit the single terminal review_completed event on loop exit and synchronize final snapshot writes
- [x] 4.4 Preserve existing severity-aware gate, loop handoff semantics, LOOP_JSON output, and stderr diagnostics while integrating heartbeat lifecycle management

## 5. Update Slash Command Guides ✓

> Document the canonical background plus polling autofix-loop behavior for chat surfaces and distribute the updated guides.

> Depends on: schema-and-type-wiring

- [x] 5.1 Rewrite the review_design Auto-fix Loop section to require background launch, snapshot or event polling, and terminal-state finalization
- [x] 5.2 Rewrite the review_apply Auto-fix Loop section to require background launch, snapshot or event polling, and terminal-state finalization
- [x] 5.3 Document round rendering and the stale-heartbeat abandoned rule in the generated command guidance
- [x] 5.4 Regenerate distributed command artifacts from the updated templates

## 6. Verify Contract And Runtime Behavior ✓

> Prove the observability change is additive, end-to-end functional, and non-regressive for single-round review flows.

> Depends on: cli-autofix-loop-observability, slash-command-polling-guides

- [x] 6.1 Run openspec validate and specflow-spec-verify to confirm spec and contract consistency
- [x] 6.2 Update or regenerate snapshot tests for the slash-command template outputs
- [x] 6.3 Exercise a multi-round autofix loop to verify 2N+1 review_completed events and a visible run-artifact snapshot at the deterministic phase path
- [x] 6.4 Exercise process-kill and single-round review cases to confirm abandoned derivation and payload.autofix equals null for non-autofix reviews
