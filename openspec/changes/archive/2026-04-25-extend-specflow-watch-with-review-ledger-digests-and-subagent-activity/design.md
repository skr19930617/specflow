## Context

`specflow-watch` is a standalone terminal TUI for a single specflow run. It is structured as three pure layers:

1. **Artifact readers** — `src/lib/specflow-watch/artifact-readers.ts` exposes tolerant readers that return a tagged `ArtifactReadResult<T>` with `kind ∈ {ok, absent, unreadable, malformed}` for each input file.
2. **Model builder** — constructs the in-memory model the renderer consumes from the reader results. Run-state is the only mandatory input; all other sources degrade gracefully.
3. **Renderer** — the TUI in `src/bin/specflow-watch.ts` renders sections (Run header, Review round, Task graph, Approval summary, Recent events), redraws on filesystem changes, and exits on `q` / `Ctrl+C`.

The Review round section currently derives entirely from `autofix-progress-<family>.json`. The review-ledger data — `openspec/changes/<change>/review-ledger-design.json` and `openspec/changes/<change>/review-ledger.json` — is already persisted by the review orchestration layer (`src/lib/review-ledger.ts`, types in `src/types/contracts.ts`) but is never read by the watcher. Operators therefore see round/progress counters but not the actual review outcome.

This change is a strictly additive widening of the read model: new tolerant readers for the two ledger files and the two review-result files (summary source), a new optional digest sub-model attached to the Review section, and new renderer lines below the existing progress lines. Nothing about the run model, review-orchestration contracts, observation events, or the watcher's read-only boundary changes.

Spec delta: `openspec/changes/extend-specflow-watch-with-review-ledger-digests-and-subagent-activity/specs/realtime-progress-ui/spec.md` (two ADDED requirements for the digest + narrow-terminal behavior, two MODIFIED requirements extending the read-artifact contract and the degradation rules).

## Goals / Non-Goals

**Goals:**
- Add tolerant readers for `review-ledger-design.json` and `review-ledger.json`, matching the existing `ArtifactReadResult<T>` contract (`ok` / `absent` / `unreadable` / `malformed`).
- Select the ledger file by current review family, reusing the existing family rule from `selectActiveAutofixPhase`.
- Build a digest sub-model from the **latest persisted ledger state** (the ledger's own "latest round" — the last `round_summaries` entry plus the ledger's open findings) that carries: decision, total/open/new/resolved counts, severity breakdown over open findings, a `SummaryState` for the latest round narrative (sourced from `review-result-<family>.json` with round-match validation against the ledger), top-3 open findings.
- Rank the top-3 open findings by `severity` (CRITICAL/HIGH > MEDIUM > LOW — `critical` maps to the same rank as `high`), then `latest_round` DESC, then `id` ASC as deterministic tie-breaker.
- Render digest lines below the existing Review section progress lines with a compact format; auto-collapse the findings list and truncate other digest lines with `…` when the terminal is narrower than 80 columns.
- Preserve the existing snapshot-based progress rendering and all graceful-degradation rules for non-ledger sources.
- Maintain the watcher's strictly read-only boundary (no `specflow-run advance`, no file writes).

**Non-Goals:**
- Rendering any raw ledger JSON or a full ledger browser.
- Aggregating counts across multiple rounds (digest draws from the latest round only).
- Surfacing "subagent activity" mentioned in the issue's title (explicitly out of scope for this change — a separate proposal if needed).
- Changing `ReviewLedger`, `LedgerSnapshot`, or `LedgerRoundSummary` shapes, or the review orchestration / persistence contracts.
- Modifying review-result persistence (the watcher only reads `review-result-<family>.json` as a summary source; it does not write or alter it).
- Modifying the observation-events stream, run-state schema, or task-graph contract.
- Rewriting the existing Review round section behavior (snapshot-derived progress remains intact).
- Adding any network / daemon / IPC behavior to `specflow-watch`.

## Decisions

### D1. Source of the "latest" digest state is the ledger's last round_summary + open findings

The spec references the "latest `LedgerSnapshot`". In code, `LedgerSnapshot` is an in-memory view (`src/types/contracts.ts:434`) produced by the helper `ledgerSnapshot(ledger)` (`src/lib/review-ledger.ts:750`); it is not a distinct on-disk record. The **persisted** ledger (`ReviewLedger` at `src/types/contracts.ts:393`) carries:
- `latest_decision` at the top level
- `round_summaries: readonly LedgerRoundSummary[]` — each round's counters, decision, stop_reason, etc.
- `findings: readonly ReviewFinding[]` — full finding history with `status`, `severity`, `origin_round`, `latest_round`

The digest SHALL be built from:
- **Decision** (single source of truth): `ledger.latest_decision` is the authoritative decision field. If `ledger.latest_decision` is present, it SHALL be used unconditionally. If `ledger.latest_decision` is absent or empty, fall back to `round_summaries[len-1].decision`. If both are empty, render `Decision: (none)`. Additionally, when both `ledger.latest_decision` and `round_summaries[len-1].decision` are present and they disagree, the reader SHALL return `malformed` with a reason describing the decision parity violation — this prevents silently rendering stale or inconsistent decision data.
- **Counts (total / open / new / resolved)**: read from `round_summaries[len-1]` (the last entry represents the latest round). This matches the ledger's own persisted counters and avoids recomputing anything the persistence layer already established.
- **Severity breakdown over open findings**: filter `ledger.findings` by `status ∈ {open, new}`, then group by `severity`. Findings with `severity === "critical"` are aggregated into the `high` count — the existing review-orchestration contract treats `critical` and `high` as the same blocking tier, and the digest display uses `HIGH n | MEDIUM n | LOW n` without a separate CRITICAL column. This ensures `critical` findings are never understated or hidden. Unknown severities (not `critical`, `high`, `medium`, or `low`) are also aggregated into the `high` count as a safe default. Does **not** use `round_summaries[*].by_severity` because that dict mixes all statuses.
- **Latest summary text**: the persisted `LedgerRoundSummary` does not carry a free-form `summary` string. The narrative summary is sourced from a separate artifact: `review-result-design.json` or `review-result.json` (family-mapped, same selection rule as the ledger). The watcher SHALL add a tolerant reader for the review-result file (same `ArtifactReadResult<T>` contract). `ReviewResultSummary` SHALL extract both `summary?: string` and `round_index?: number` from the review-result file. The model builder SHALL validate that the review-result's `round_index` matches the ledger's latest round (`round_summaries.length`) before accepting the summary as current. This prevents pairing a newer ledger state with a stale narrative from an older round. The `summaryState` field on `LedgerDigest` (see D4) uses a discriminated union to represent the outcome:
  - `{ kind: "available", text: string }` — review-result is present, has a `summary` field, and its `round_index` matches the ledger's latest round (or `round_index` is absent in the review-result, in which case the match is assumed — the watcher cannot distinguish "no round_index field" from "matches" and accepts it optimistically).
  - `{ kind: "stale", text: string, resultRound: number, ledgerRound: number }` — review-result has a `summary` and a `round_index`, but the `round_index` does not match the ledger's latest round. The renderer SHALL show `Latest summary (stale — round <resultRound>):` followed by the text, so the operator knows the narrative may not reflect the current ledger state.
  - `{ kind: "absent" }` — review-result file is absent, lacks a `summary` field, or `summary` is empty. The renderer SHALL omit the `Latest summary:` line entirely.
  - `{ kind: "warning", reason: string }` — review-result file is unreadable or malformed. The renderer SHALL show `Review summary unreadable: <reason>` as a distinct warning line, so the operator can distinguish a broken summary source from a legitimately absent one.
  This satisfies the spec's "Latest round summary missing elides the line" scenario for the `absent` case, surfaces staleness explicitly for the `stale` case, and separates broken sources from missing ones for the `warning` case.
- **Top-3 open findings**: filter `ledger.findings` by `status ∈ {open, new}`, sort per the ranking rule, take the first three.

**Alternative considered**: call `ledgerSnapshot(ledger)` from `review-ledger.ts`. Rejected for two reasons — it pulls all `round_summaries` through, which the digest doesn't need, and it adds a coupling from the watcher to orchestration helper code. The watcher should only depend on shape types (`ReviewLedger`, `LedgerRoundSummary`, `ReviewFinding`), not orchestration logic.

### D2. Parser uses a read-only validator against the full ReviewLedger schema

`src/lib/review-ledger.ts`'s `readLedger` does **not** fit the watcher because it has side effects (renames corrupt files to `.corrupt` paths and falls back to backups). The watcher must remain strictly read-only.

A new reader in `artifact-readers.ts` SHALL:
1. Check `existsSync(path)`; `absent` on miss.
2. Read the file with `readFileSync`; `unreadable` on I/O error.
3. `JSON.parse`; `malformed` on parse failure.
4. Run a **watcher-local** validator that validates parsed JSON against the full `ReviewLedger` contract schema — all required fields (`feature_id`, `phase`, `findings` array with required `ReviewFinding` fields, `round_summaries` array with required `LedgerRoundSummary` fields, optional `latest_decision`). A ledger that does not conform to the full schema SHALL be returned as `malformed` with a reason describing the schema violation. This ensures schema-invalid ledgers trigger the spec-required inline warning path rather than silently rendering partial data.
5. Return `{ kind: "ok", value: ledger }` only when the full schema validates.

The validator is side-effect-free (no file renames, no backup fallbacks) — the only difference from `validateLedger` in `review-ledger.ts` is the absence of write-side recovery logic and the tagged-result return type.

**Alternative considered**: a loose validator scoped to only the fields the digest renders. Rejected because the spec requires the malformed-ledger warning path to activate when the ledger "does not conform to the ledger schema" — a loose validator would accept schema-invalid ledgers and hide drift.

**Alternative considered**: reuse `parseJson<ReviewLedger>` from `review-ledger.ts`. Rejected because it throws instead of returning tagged results, conflating malformed with unreadable.

### D3. Ledger selection reuses `selectActiveAutofixPhase` family rule

A new helper `selectActiveReviewLedger(currentPhase): "design" | "apply" | null` mirrors `selectActiveAutofixPhase` (`artifact-readers.ts:115`). The same switch values (`design_draft / design_review / design_ready` → design; `apply_draft / apply_review / apply_ready / approved` → apply; else `null`) are used so snapshot and digest stay phase-consistent.

**Alternative considered**: derive the ledger family from the already-selected autofix phase rather than current_phase. Rejected because the two selection rules happen to be 1:1 today but are conceptually independent — keeping them parallel prevents accidental drift.

### D4. Digest lives on the Review section model with independent snapshot and digest sub-states

The Review section model SHALL use a composite state with **independent** sub-states for the snapshot progress layer and the ledger digest layer. Each sub-state tracks its own availability independently so that:
- snapshot-only (ledger absent/malformed) renders the progress view plus a digest placeholder or warning;
- ledger-only (snapshot absent) renders a snapshot placeholder plus the digest;
- both present renders both layers;
- mixed warning states (e.g., snapshot ok + ledger malformed) render independently.

```ts
/** Independent state for each layer of the Review section. */
type ReviewLayerState<T> =
  | { readonly kind: "ok"; readonly value: T }
  | { readonly kind: "placeholder"; readonly message: string }
  | { readonly kind: "warning"; readonly message: string }
  | { readonly kind: "hidden" };

/** Discriminated state for the latest-round narrative summary. */
type SummaryState =
  | { readonly kind: "available"; readonly text: string }
  | { readonly kind: "stale"; readonly text: string; readonly resultRound: number; readonly ledgerRound: number }
  | { readonly kind: "absent" }
  | { readonly kind: "warning"; readonly reason: string };

interface LedgerDigest {
  decision: string;                      // "(none)" when unavailable
  counts: { total: number; open: number; new_count: number; resolved: number };
  openSeverity: { high: number; medium: number; low: number };  // "critical" and unknown severities aggregated into "high"
  summaryState: SummaryState;            // replaces latestSummary: string | null
  topOpen: readonly {                    // up to 3 entries; "critical" findings display as "HIGH"
    severity: "HIGH" | "MEDIUM" | "LOW";
    title: string;
    id: string;
  }[];
}

interface ReviewSectionModel {
  // ... existing fields (round_index, max_rounds, loop_state, etc.)
  readonly snapshotState: ReviewLayerState<SnapshotProgressModel>;
  readonly digestState: ReviewLayerState<LedgerDigest>;
}
```

The renderer evaluates `snapshotState` and `digestState` independently:
- `snapshotState.kind === "ok"` → render existing progress lines.
- `snapshotState.kind === "placeholder"` → render snapshot placeholder (existing behavior).
- `snapshotState.kind === "warning"` → render snapshot warning (existing behavior).
- `snapshotState.kind === "hidden"` → render nothing for the snapshot layer.
- `digestState.kind === "ok"` → render the 4–5 digest lines plus the top-3 block. The summary line renders according to `summaryState.kind`: `available` → `Latest summary: <text>`, `stale` → `Latest summary (stale — round <N>): <text>`, `absent` → line omitted, `warning` → `Review summary unreadable: <reason>`.
- `digestState.kind === "placeholder"` → render `No review digest yet`.
- `digestState.kind === "warning"` → render `Review ledger unreadable: <reason>` or `Review ledger malformed: <reason>`.
- `digestState.kind === "hidden"` → render nothing for the digest layer (phase is outside review families; no ledger is applicable).

When `selectActiveReviewLedger(currentPhase)` returns `null` (non-review phase), `digestState` SHALL be `{ kind: "hidden" }`. This distinguishes "active review family with no digest yet" (`placeholder`) from "phase is outside review families" (`hidden`). The `placeholder` state is reserved for review-family phases where the ledger file is absent or has zero `round_summaries`.

Both layers render in sequence (snapshot first, then digest) regardless of the other layer's state. This ensures that a digest warning never suppresses the snapshot view, and a snapshot placeholder never suppresses the digest.

**Alternative considered**: a single `LedgerDigest | null` field with inline `warning` and `placeholder` flags. Rejected because it conflates snapshot and digest availability into one state path, risking suppression of the digest when the snapshot is absent or vice versa (see R1-F02).

**Alternative considered**: a separate Review Ledger section. Rejected — the issue explicitly asks for the progress view and digest to share one section with two layers, and splitting them would break the family-aware phase visibility that the existing Review round section already handles.

### D5. Narrow-terminal handling is a rendering-layer concern, not a model concern

The model produces the full digest regardless of terminal width. The renderer reads `process.stdout.columns` (with a sensible default of 80 when unavailable) and applies:
- `columns < 80`: drop the `Open findings:` header and all finding rows; for other lines, truncate to `columns` characters, replacing the tail with `…` when truncation occurs.
- `columns >= 80`: render all lines in full; no truncation applied to digest lines specifically.

Keeping width-dependent logic in the renderer means model snapshots stay stable for testing and the terminal resize path only redraws; it does not invalidate cached data.

**Alternative considered**: compute a "narrow" digest variant in the model. Rejected — that couples the model to terminal dimensions and complicates test fixtures.

### D6. Ranking implementation: stable sort with explicit tie-breakers

```ts
function rankOpenFindings(findings: readonly ReviewFinding[]): readonly ReviewFinding[] {
  const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 0, medium: 1, low: 2 };
  return [...findings]
    .filter(f => f.status === "open" || f.status === "new")
    .sort((a, b) => {
      const sa = SEVERITY_RANK[a.severity ?? "low"] ?? 0;
      const sb = SEVERITY_RANK[b.severity ?? "low"] ?? 0;
      if (sa !== sb) return sa - sb;
      const ra = a.latest_round ?? 0;
      const rb = b.latest_round ?? 0;
      if (ra !== rb) return rb - ra; // DESC
      return (a.id ?? "").localeCompare(b.id ?? "");
    });
}
```

`critical` maps to rank 0 (same as `high`) because the existing review-orchestration contract treats both as blocking severities. Unknown severities also default to rank 0 (the highest tier) to prevent understating unrecognized severity values. In the top-3 display, findings with `severity === "critical"` render as `HIGH` to match the digest's three-tier display format. `id` ASC uses `localeCompare` so lexicographic ordering of `RN-FNN` is deterministic across runtimes.

### D7. Filesystem watch: watch the ledger paths alongside existing sources

The filesystem-watch layer already watches a set of paths keyed off run + change. Two entries are appended to that set per run — the design and apply ledger paths — gated by whether the run's change directory resolves. The polling-fallback tick (≈2 s) inspects mtime/size on the same paths. Missing files are handled exclusively through the tolerant reader at redraw time; no special "file deleted" watch event is needed.

### D8. No new observation events

The watcher must not emit observation events (it is read-only by contract). Digest rendering fetches data on every redraw; no new event kinds are introduced.

## Concerns

Each concern below corresponds to a vertical slice and maps cleanly to test-layer boundaries.

- **C-Reader** — tolerant readers for the two ledger files and the two review-result files (summary source). Resolves the "no ledger access" problem in the current watcher. Owns the `ArtifactReadResult<ReviewLedger>` contract expansion and the `ArtifactReadResult<ReviewResultSummary>` for the review-result reader.
- **C-Select** — ledger-family selection helper (`selectActiveReviewLedger`). Resolves "which ledger for which phase" consistently with the existing snapshot family rule. Owns one pure function plus tests for every phase value.
- **C-Digest-Model** — digest sub-model builder consuming a reader result and a ledger (when present). Resolves "shape of digest data exposed to renderer". Owns the `ReviewLayerState<LedgerDigest>` type (including the `hidden` kind for non-review phases), `SummaryState` derivation (round-match validation, stale detection, warning vs absent discrimination), severity aggregation over open findings (including `critical` → `high` mapping), ranking (with `critical` at rank 0 alongside `high`), decision parity validation, and the independent digest state derivation (ok / placeholder / warning / hidden). Also owns the composite `ReviewSectionModel` with independent `snapshotState` and `digestState` sub-states, ensuring ledger-only, snapshot-only, hidden, and mixed warning/placeholder combinations are all representable.
- **C-Digest-Render** — renderer updates to the Review section. Resolves "compact digest below progress" UX. Owns line formatting, the narrow-terminal collapse/truncation rules, and placeholder/warning rendering.
- **C-Integration** — wire readers → model → renderer inside `src/bin/specflow-watch.ts`, plus filesystem-watch path expansion. Resolves "digest actually appears end-to-end". Owns the integration seams.

## State / Lifecycle

- **Canonical state** (unchanged): on-disk `review-ledger-design.json` / `review-ledger.json` files written exclusively by review orchestration. The watcher never owns or mutates this state.
- **Derived state** (new):
  - `LedgerDigest` — computed per redraw from the current ledger reader result, the last `round_summaries` entry, and the open-findings slice. Cached nowhere across redraws; the model rebuilds it each cycle from the fresh reader output.
  - The digest's `hidden` / `placeholder` / `warning` / normal render flags are derived state, not persisted.
- **Lifecycle boundaries**:
  - Digest becomes visible as soon as the run's `current_phase` enters a review family **and** the ledger reader returns `ok` with at least one `round_summaries` entry.
  - Digest remains visible during `design_ready` / `apply_ready` / `approved` (adjacent completed-family phases) per the existing family rule.
  - Digest disappears when `current_phase` leaves the review families (e.g., `spec_draft`, `proposal_clarify`).
  - Watcher terminal-state behavior (staying open after `run.status` transitions out of `active`) continues to apply — the final digest snapshot remains rendered using the last successful ledger read.
- **Persistence-sensitive state**: none introduced. The watcher writes no new files, no cache directory, no lock file.

## Contracts / Interfaces

Interfaces between layers (readers → model → renderer → external services):

- **Reader → Model** (extended):
  ```ts
  readDesignReviewLedger(projectRoot, changeName): ArtifactReadResult<ReviewLedger>
  readApplyReviewLedger(projectRoot, changeName): ArtifactReadResult<ReviewLedger>
  readDesignReviewResult(projectRoot, changeName): ArtifactReadResult<ReviewResultSummary>
  readApplyReviewResult(projectRoot, changeName): ArtifactReadResult<ReviewResultSummary>
  selectActiveReviewLedger(currentPhase): "design" | "apply" | null
  ```
  All readers accept a change name (not a run id) because the artifacts live under `openspec/changes/<change>/`, consistent with `taskGraphPath`. `ReviewResultSummary` is a minimal type containing `{ summary?: string; round_index?: number }` — the watcher extracts the narrative summary and the round indicator, and ignores other fields. The `round_index` enables the model builder to validate that the summary corresponds to the ledger's latest round (see D1).

- **Model → Renderer** (extended): the existing Review section model is replaced with a composite model carrying independent layer states:
  ```ts
  interface ReviewSectionModel {
    // ... existing fields (round_index, max_rounds, loop_state, etc.)
    readonly snapshotState: ReviewLayerState<SnapshotProgressModel>;
    readonly digestState: ReviewLayerState<LedgerDigest>;
  }
  ```
  `ReviewLayerState<T>`, `LedgerDigest`, and `ReviewSectionModel` shapes are defined in D4.

- **External contracts consumed**:
  - `ReviewLedger` from `src/types/contracts.ts:393`.
  - `LedgerRoundSummary` from `src/types/contracts.ts:374`.
  - `ReviewFinding` from `src/types/contracts.ts:358`.
  - No helper functions from `src/lib/review-ledger.ts` are imported (see D1/D2 for rationale).

- **Inputs/outputs other bundles depend on**: none. The watcher is a terminal consumer; no downstream bundle reads from it.

## Persistence / Ownership

- **Data ownership** (unchanged):
  - `review-ledger-design.json` / `review-ledger.json` are owned by review orchestration. The watcher is a read-only consumer. Spec `artifact-ownership-model` already enumerates these files.
  - The watcher owns no new artifacts.
- **Storage mechanisms**: filesystem reads only; no database, no shared memory, no cache directory.
- **Artifact ownership in this change**: the delta spec at `openspec/changes/<change>/specs/realtime-progress-ui/spec.md` is owned by this change. No new artifact files are introduced in `openspec/specs/`.

## Integration Points

- **External systems**: none. No network, no daemon, no IPC.
- **Cross-layer dependency points**:
  - Watcher depends on review-orchestration's persistence schema (`ReviewLedger`). A breaking schema change would require synchronized spec updates (tracked by `review-orchestration` and `artifact-ownership-model` specs).
  - Watcher depends on `review-orchestration`'s ledger filename convention (`review-ledger-design.json` / `review-ledger.json`). Any rename must update the delta spec here.
- **Regeneration / retry / save / restore boundaries**:
  - The watcher's polling fallback (≈2 s) replaces "save/restore" semantics for the digest — the next poll rebuilds the digest from disk, so malformed or partial ledger writes recover on the next successful write.
  - No retry logic inside the watcher; one read attempt per redraw per source.

## Ordering / Dependency Notes

Foundational → dependent ordering:

1. **C-Reader** and **C-Select** are foundational (pure functions over types). They can land in parallel, or in sequence — neither depends on the other.
2. **C-Digest-Model** depends on C-Reader and C-Select for its inputs. It should land after both.
3. **C-Digest-Render** depends on C-Digest-Model's `LedgerDigest` type. It can be developed in parallel against a stubbed model type, but integration lands after C-Digest-Model.
4. **C-Integration** depends on all of the above and lands last.

Tests at each layer are independent:
- C-Reader and C-Select tests land with their implementations (TDD).
- C-Digest-Model tests consume small handcrafted `ReviewLedger` fixtures.
- C-Digest-Render tests consume `LedgerDigest` fixtures directly.
- C-Integration uses a tmp-dir fixture run with an on-disk ledger and asserts the rendered output.

## Completion Conditions

A concern is complete when:

- **C-Reader**: `readDesignReviewLedger` / `readApplyReviewLedger` and `readDesignReviewResult` / `readApplyReviewResult` exist, unit tests cover every `ArtifactReadResult` variant (ok / absent / unreadable / malformed / empty `round_summaries` for ledger; ok / absent / unreadable / malformed / missing-summary-field / missing-round-index for review-result), decision parity validation rejects ledgers where `latest_decision` disagrees with the last round summary's decision, and `src/tests/specflow-watch-readers.test.ts` extends accordingly. `ReviewResultSummary` includes both `summary?: string` and `round_index?: number`.
- **C-Select**: `selectActiveReviewLedger` exists with exhaustive phase-value coverage including a branch for each phase listed in `selectActiveAutofixPhase`, and a parity test asserting the two selectors agree on the family mapping.
- **C-Digest-Model**: `buildDigestState(readerResult, reviewResultReaderResult, ledgerRoundCount, activeFamily)` exists returning `ReviewLayerState<LedgerDigest>` and covers all observable digest states (hidden for non-review phases, absent placeholder, unreadable warning, malformed warning, empty-ledger placeholder, populated digest with all `SummaryState` variants). The composite `ReviewSectionModel` builder produces independent `snapshotState` and `digestState` sub-states with tests for: ledger-only (snapshot absent + digest ok), snapshot-only (snapshot ok + digest absent), both present, hidden (non-review phase), mixed warning/placeholder combinations (e.g., snapshot ok + digest malformed, snapshot absent + digest ok). Open-findings ranking tests verify severity → latest_round → id ordering including ties, and SHALL include test cases for `critical` severity findings ranking at the same level as `high` (not below `low`) and for unknown severity values defaulting to rank 0. Severity aggregation tests SHALL verify that `critical` findings are counted under `openSeverity.high` and that `critical` findings in `topOpen` display as `"HIGH"`. `summaryState` tests SHALL cover: `available` (round-matched summary), `stale` (round-mismatched summary with both round numbers preserved), `absent` (review-result absent or no summary field), `warning` (review-result unreadable/malformed). When `round_index` is absent from the review-result, the summary is accepted optimistically as `available`.
- **C-Digest-Render**: renderer unit tests assert the exact line sequence for each independent layer state combination (snapshot ok + digest ok, snapshot placeholder + digest ok, snapshot ok + digest warning, digest hidden for non-review phases, etc.), plus narrow-terminal (`columns < 80`) collapse/truncate behavior, plus wide-terminal full rendering. Confirms both layers render independently — a digest warning does not suppress the snapshot view and vice versa. Confirms `hidden` state produces no output for that layer.
- **C-Integration**: a full TUI test (similar to `specflow-watch-integration.test.ts`) spins up a run with a ledger on disk, triggers a redraw, and asserts the digest lines appear below the existing Review section progress view. Filesystem-watch integration: updating the ledger triggers a redraw.

Independent reviewability:
- Readers / selector PRs can be reviewed with no UI context.
- Model PR can be reviewed against fixtures without a live TUI.
- Renderer PR can be reviewed via snapshot text fixtures.
- Integration PR is the only one that requires running the TUI.

## Risks / Trade-offs

- **Latest-round narrative field mismatch** → The persisted `LedgerRoundSummary` does not carry a `summary` string; free-form narrative lives in `ReviewPayload`. Mitigation: the watcher reads the `review-result-<family>.json` artifact as a separate tolerant reader to extract both the `summary` and `round_index` fields. The model builder validates that the review-result's `round_index` matches the ledger's latest round (`round_summaries.length`). When the rounds match (or `round_index` is absent in the review-result), `summaryState` is `available`. When they disagree, `summaryState` is `stale` and the renderer annotates the line with the round mismatch. When the review-result is absent or lacks a `summary` field, `summaryState` is `absent` and the line is omitted. When the review-result is unreadable or malformed, `summaryState` is `warning` with a reason, and the renderer shows a distinct warning line — this prevents a broken summary source from being indistinguishable from a legitimately absent one.
- **Decision parity violation** → If `ledger.latest_decision` and `round_summaries[len-1].decision` are both present but disagree, the watcher treats the ledger as `malformed` and shows an inline warning. This is deliberately strict — silent inconsistency in decision data is worse than a visible warning that prompts investigation.
- **Ledger schema drift** → If `ReviewLedger` evolves (new required fields), the watcher's full-schema validator will correctly reject the old shape as `malformed`, triggering the inline warning path. This is the desired behavior — the operator sees that the ledger format has changed. Mitigation: the warning message includes the specific schema violation to aid debugging.
- **Narrow-terminal visual regression** → Truncating lines with `…` changes alignment with the existing progress rows. Mitigation: existing progress rows are already tuned for 80-column rendering; the digest truncation applies below the same threshold, so both layers collapse in step. Snapshot tests lock this in.
- **Concurrent watcher race with ledger writer** → The orchestrator writes `review-ledger.json` atomically (`rename`), but a reader observing the file mid-write on some filesystems may see a truncated snapshot. Mitigation: the reader already handles malformed → inline warning path; the next poll recovers. No lock required because the watcher is strictly read-only.
- **Multiple active ledgers** → If a run somehow has both files on disk (e.g., after re-entering design from apply), only the family-mapped one is read. Mitigation: this is the same behavior as the existing autofix-snapshot selector, so operator expectations are consistent.
- **Performance** → Each redraw reads the ledger JSON and sorts findings. For typical ledgers (<100 findings), this is sub-millisecond. Mitigation: if large ledgers appear in the wild (1000+ findings), add a per-file mtime cache to skip re-parse when unchanged — deferred unless measured regressions appear.
- **Test flakiness from fs watchers** → Adding two more watched paths slightly increases exposure to the existing polling-fallback flakiness in the filesystem-watch layer. Mitigation: the polling fallback already exists; adding paths does not change the failure mode.

## Migration Plan

- **Rollout**: non-breaking, additive. New behavior appears the next time an operator runs `specflow-watch` on a run that has a ledger on disk.
- **Compatibility**: runs that predate the change have no ledger files — the watcher renders `No review digest yet` and all other sections unchanged.
- **Rollback**: revert the PR; the watcher falls back to pre-change rendering with no data loss (nothing persists).
- **No migrations required**: no schema changes, no data migrations, no config changes.

## Open Questions

1. ~~**Latest summary source**~~ — **Resolved**: the watcher reads `review-result-design.json` / `review-result.json` (family-mapped) as a separate tolerant reader to extract the `summary` and `round_index` fields. The model validates `round_index` against the ledger's latest round to prevent stale-narrative pairing. The `summaryState` discriminated union (D1/D4) distinguishes `available`, `stale`, `absent`, and `warning` — each with distinct renderer behavior. This avoids deferring the acceptance criterion to a Phase 2 and ensures broken/stale/absent summary sources are never conflated.
2. ~~**`critical` severity handling**~~ — **Resolved**: `critical` findings map to the same rank as `high` in D6 (rank 0), are aggregated into the `high` count in the severity breakdown (D1), and render as `HIGH` in the top-3 findings display (D4). Unknown severities also default to rank 0 and aggregate into `high`. This ensures `critical` findings are never understated, hidden from the top-3 list, or ranked below `low`. The digest retains the three-tier `HIGH | MEDIUM | LOW` display format — a separate `CRITICAL` display tier can be added in a future change if needed.
3. **Title truncation cap** — the top-3 findings display finding titles unbounded. On 80–120 column terminals this is fine; on wider terminals it is fine; on <80 columns the entire block is collapsed. Is an explicit per-row title cap (e.g., 60 chars) worth adding even on wide terminals for consistency? (Preference: no cap in Phase 1; revisit if long titles appear.)
