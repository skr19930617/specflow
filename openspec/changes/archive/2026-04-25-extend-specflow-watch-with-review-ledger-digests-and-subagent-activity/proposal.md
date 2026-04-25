## Why

Source: [issue #183](https://github.com/skr19930617/specflow/issues/183) — `Extend specflow-watch with review ledger digests and subagent activity`.

The `specflow-watch` TUI currently resolves the active review family from `current_phase` and renders round/progress counters sourced from `autofix-progress-design_review.json` / `autofix-progress-apply_review.json`. However, it never reads `review-ledger-design.json` or `review-ledger.json`, so the operator can see *what round is running* but not *what the review concluded* — no decision, no finding totals, no severity distribution, no digest of active findings.

The review data contracts already persist rich result state (`ReviewResult`, `ReviewLedger`, `LedgerSnapshot`, `ReviewFinding`), and `specflow-watch` is already structured as tolerant artifact readers → pure model builder → pure renderer. Adding a ledger-backed digest is a natural, additive widening of the read model that meaningfully improves operator visibility without changing review-orchestration contracts, ledger persistence, or the write boundary (the watcher remains strictly read-only).

## What Changes

- **Extend artifact readers** — add tolerant readers (`ok` / `absent` / `unreadable` / `malformed`) for `openspec/changes/<change>/review-ledger-design.json` and `openspec/changes/<change>/review-ledger.json`, matching the existing tolerant-reader style.
- **Select ledger by review family** — reuse the existing family rule from the snapshot selector: `design_draft | design_review | design_ready` → design ledger; `apply_draft | apply_review | apply_ready | approved` → apply ledger; any other phase → no active ledger digest.
- **Preserve the existing progress layer** — snapshot-based round/loop_state/live/completed/manual-fix display stays unchanged.
- **Add a ledger digest layer** to the existing Review section, rendering (in this order):
  1. latest decision (e.g. `approve_with_findings`)
  2. counts `total / open / new / resolved`
  3. severity breakdown `HIGH n | MEDIUM n | LOW n`
  4. latest round summary text
  5. top 3 unresolved findings (severity + short title)
- **Degrade gracefully per source** — `snapshot-only` and `ledger-only` cases each still render their half. Run-state remains the only mandatory source. Specifically:
  - **Ledger absent** → single-line placeholder `No review digest yet` in the Review section, below the existing progress view.
  - **Ledger unreadable (I/O failure)** → inline warning line `Review ledger unreadable: <reason>` scoped to the Review section; other sections render normally.
  - **Ledger malformed (parse failure)** → inline warning line in the Review section; other sections render normally.
  - **Ledger present but zero `LedgerSnapshot` entries** → same `No review digest yet` placeholder as the absent case (operator-facing state is identical: no review outcome yet).
- **Keep compact** — render a *digest*, not full ledger content. The TUI does not become a ledger browser. No write paths, no contract changes, no observation-event changes.

**Clarified decisions:**

From the issue's own open questions:
- **Digest source** — latest round only. The digest mirrors the latest `LedgerSnapshot`'s fields; no cross-round aggregation.
- **Unresolved-findings ranking** — severity (`HIGH` > `MEDIUM` > `LOW`), then recency within the same severity. Top 3 open findings only.
- **Narrow-terminal behavior** — below an 80-column threshold, auto-collapse the top-3 open-findings list; retain the decision / counts / severity / summary lines.

From challenge-reclarify:
- **Severity breakdown set (C3)** — counts **open findings only** (status `open` / `new`), not resolved or overridden findings. The `Findings` line already carries `total | open | new | resolved`, so the severity breakdown focuses on what remains actionable.
- **Recency tie-break (C4)** — ranking within a severity uses `latest_round` DESC; ties broken by finding `id` ASC (e.g. `R3-F02` before `R3-F05`). `ReviewFinding` has no wall-clock timestamps, so `latest_round` is the authoritative recency signal.
- **Empty ledger handling (C5)** — a ledger file that parses but has zero `LedgerSnapshot` entries renders the same `No review digest yet` placeholder as the absent-file case.
- **Narrow-terminal overflow (C6)** — exact threshold is **80 columns**. Below 80: findings list is hidden, and the remaining decision / counts / severity / summary lines are truncated with an ellipsis (`…`) instead of wrapping, preserving alignment with existing progress rows.

**Title alignment note**: the issue title mentions "subagent activity" but the body focuses entirely on review ledger digests. This change scopes to the ledger digest only; any subagent-activity work is out of scope and would be a separate proposal.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `realtime-progress-ui`: add the ledger digest layer (new requirement), extend the read-only artifact contract to include the two review-ledger files, and extend graceful-degradation rules to cover ledger-present / ledger-absent / ledger-malformed combinations alongside the existing snapshot cases. The existing snapshot-based progress requirement and family selection rules stay intact.

## Impact

- **Code**
  - `src/lib/specflow-watch/artifact-readers.ts` — add `readDesignReviewLedger` / `readApplyReviewLedger` with tolerant status envelope.
  - watch model builder — extend the review section model with optional `ledgerDigest` fields (`decision`, `counts`, `severity`, `latestSummary`, `topUnresolved`).
  - watch renderer — render digest lines below existing progress lines; handle `No review digest yet` placeholder and malformed-ledger warnings.
  - `src/bin/specflow-watch.ts` (TUI entrypoint) — wire new readers → model → renderer path.
  - new unit + snapshot tests for ledger reader tolerance, digest rendering across family states, and the ledger-present/absent/malformed matrix.
- **Specs**
  - `openspec/changes/<change>/specs/realtime-progress-ui/spec.md` — delta adding digest requirement + extended degradation scenarios.
- **Contracts & dependencies**
  - Consumes existing `ReviewLedger` / `LedgerSnapshot` shapes from `src/lib/review-ledger.ts`; no schema changes.
  - No changes to `workflow-observation-events`, `run-artifact-store-conformance`, or `review-autofix-progress-observability`.
- **Out of scope** — subagent activity surfacing, write paths, full ledger browser UI, raw ledger JSON rendering, changes to review orchestration.
