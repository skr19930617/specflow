## Context

`specflow-prepare-change` currently requires a `--source-file` flag pointing to a pre-normalized JSON file. The `/specflow` slash command guide is responsible for:

1. Classifying user input (issue URL vs inline text)
2. Fetching the issue (if URL mode)
3. Writing `/tmp/specflow-proposal-source.json` with the normalized shape
4. Calling `specflow-prepare-change [CHANGE_ID] --source-file /tmp/specflow-proposal-source.json`

This design moves steps 1-3 into `specflow-prepare-change` itself, so the guide only needs to pass raw user input.

### Current flow

```
User → Guide (classify + normalize + write temp file) → specflow-prepare-change --source-file
```

### Target flow

```
User → Guide (pass raw input) → specflow-prepare-change [CHANGE_ID] <raw-input>
                                  ├─ classify input
                                  ├─ if URL → specflow-fetch-issue → normalize
                                  ├─ if text → normalize directly
                                  └─ if CHANGE_ID omitted → derive from canonical ProposalSource (issue title or inline text), then create change
```

### Key files

- `src/bin/specflow-prepare-change.ts` — CLI entry point (main change target)
- `src/lib/proposal-source.ts` — Source normalization utilities (reused, extended)
- `src/bin/specflow-fetch-issue.ts` — Issue fetch CLI (unchanged contract, invoked internally)
- `src/contracts/command-bodies.ts` — Command guide body content (Step 3 update)

## Goals / Non-Goals

**Goals:**

- `specflow-prepare-change` accepts raw input as a positional argument and normalizes internally
- The issue URL detection pattern is shared with `specflow-fetch-issue` (same regex)
- Single-argument raw-input mode derives `CHANGE_ID` after normalization/fetch, using the fetched issue title for URL mode and sanitized inline text for inline mode
- `--source-file` is deprecated with a warning but continues to function
- The `/specflow` command guide Step 3 passes raw input directly
- All error conditions in the proposal's rejected invocation table produce correct exit codes and messages

**Non-Goals:**

- Redesigning the `ProposalSource` type shape — it stays as-is
- Changing `specflow-fetch-issue` contract or implementation
- Removing `--source-file` in this change (deferred)
- Changing `specflow-run start` interface — it still receives source metadata

## Decisions

### Decision 1: Extend `specflow-prepare-change` argument parsing, don't wrap it

**Choice:** Modify the `main()` function's argument parser in `specflow-prepare-change.ts` to accept positional raw input alongside the existing flag-based path.

**Alternatives considered:**
- **(A) New CLI wrapper** (`specflow-enter-proposal`) that normalizes and then calls `specflow-prepare-change --source-file`. Rejected: adds another binary for a transitional purpose; the wrapper would itself need deprecation later.
- **(B) stdin-based input** where all modes pipe JSON through stdin. Rejected: requires callers to construct JSON, which is what we're trying to remove from the guide surface.

**Rationale:** Extending the existing CLI keeps the binary count stable, the `specflow-run start` call path unchanged, and the deprecation story simple (one flag, one binary).

### Decision 2: Reuse `ISSUE_PATTERN` regex from `specflow-fetch-issue`

**Choice:** Extract the issue URL regex (`/^https:\/\/([^\/]+)\/([^\/]+)\/([^\/]+)\/issues\/([0-9]+)(?:\/.*)?$/`) into a shared module (`src/lib/issue-url.ts`) and import it from both `specflow-fetch-issue.ts` and `specflow-prepare-change.ts`.

**Alternatives considered:**
- **(A) Duplicate the regex** in both files. Rejected: drift risk when one is updated without the other.
- **(B) Have `specflow-prepare-change` call `specflow-fetch-issue --check`** to probe URL validity. Rejected: adds a new flag to an unchanged contract, and subprocess overhead for a regex check.

**Rationale:** A shared constant ensures the auto-detection boundary matches exactly what `specflow-fetch-issue` accepts.

### Decision 3: Build `ProposalSource` inline instead of writing a temp file

**Choice:** `specflow-prepare-change` constructs the `ProposalSource` object in-process after classification and (optional) fetch. It passes the object directly to `renderSeededProposal()` and to `specflow-run start` via a temp file in an internal implementation detail (or via `--source-file` to the subprocess).

**Alternatives considered:**
- **(A) Change `specflow-run start` to accept inline JSON via `--source-json`** flag. Rejected: scope creep; `specflow-run` already accepts `--source-file` and that contract is outside this change.
- **(B) Pipe JSON via stdin to `specflow-run start`**. Rejected: `specflow-run` doesn't support stdin input; adding it is out of scope.

**Rationale:** The temp file between `specflow-prepare-change` and `specflow-run start` is an internal implementation detail — it's never exposed to the slash command guide or the caller. This satisfies the proposal's requirement that "temp file usage is confined to specflow-prepare-change internal implementation." Both the raw-input and deprecated `--source-file` paths converge on the same in-memory `ProposalSource` → proposal rendering → run-start pipeline so persisted `run.json` source metadata and generated proposal artifacts stay identical apart from the deprecation warning. That parity requirement applies to both issue-backed and inline-backed sources, including inline metadata such as `kind: "inline"`, `provider: "generic"`, `reference`, `title`, and `body`.

### Decision 4: Positional argument disambiguation via count (with `--source-file` interaction)

**Choice:** Use argument count and `--source-file` presence to disambiguate:

**When `--source-file` is NOT present:**
- 0 positional args → error ("Missing required input")
- 1 positional arg → it's `<raw-input>`, derive change-id from normalized source
- 2 positional args → first is `<CHANGE_ID>`, second is `<raw-input>`
- 3+ positional args → error ("Too many arguments")

**When `--source-file` IS present (deprecated path):**
- 0 positional args → allowed: read file, derive change-id from its content (current behavior)
- 1 positional arg that passes slug validation → allowed: arg is `<CHANGE_ID>`, source comes from file (current behavior)
- 1 positional arg that fails slug validation → error ("Conflicting inputs") — it looks like raw input, not a change-id
- 2+ positional args → error ("Conflicting inputs") — any arg beyond `<CHANGE_ID>` is raw input

**Slug validation rule:** A positional argument with `--source-file` is accepted as `<CHANGE_ID>` if and only if it is a valid change-id slug: it does NOT match the issue URL pattern and it does NOT contain whitespace. If the single positional arg matches the issue URL pattern (e.g., `specflow-prepare-change https://...issues/123 --source-file f.json`) or contains whitespace (e.g., `specflow-prepare-change "add user auth" --source-file f.json`), it is classified as raw input and the "Conflicting inputs" error is produced.

**Error reservation:** "Too many arguments" is reserved exclusively for the non-deprecated raw-input path (3+ positional args without `--source-file`). Any invocation combining `--source-file` with raw-input-like positional args produces "Conflicting inputs".

**Rationale:** This preserves the existing `--source-file` contract where the single positional arg is always `<CHANGE_ID>`, while the new positional-arg path uses the same count-based disambiguation. A change-id is always a slug (no spaces, no `://`), so there's no collision with URL or multi-word inline text.

### Decision 5: Derive omitted `CHANGE_ID` from normalized source, not from the raw token

**Choice:** When exactly one positional raw-input argument is provided, `specflow-prepare-change` first resolves the canonical `ProposalSource`, then derives `CHANGE_ID` from that normalized source. URL mode uses the fetched issue title as the slug seed, while inline mode uses the sanitized inline text. The derived slug then goes through the same `ensureChangeExists` / `openspec new change <CHANGE_ID>` path as an explicit change-id before proposal rendering and run-state persistence.

**Alternatives considered:**
- **(A) Derive directly from the raw argument before classification/fetch.** Rejected: a single issue URL would slugify the URL string instead of the fetched issue title, which violates the proposal's supported invocation behavior.
- **(B) Make one-argument mode normalize only and require a later manual change creation step.** Rejected: the proposal explicitly requires `specflow-prepare-change <issue-url>` and `specflow-prepare-change <inline-text>` to create the change when it does not already exist.

**Rationale:** The normalized `ProposalSource` is the canonical representation persisted into run state. Deriving from it keeps the single-argument path aligned with stored source metadata and ensures URL-mode derivation has access to the fetched title.

**Implementation note:** The raw-input execution order is `parse args → normalizeRawInput(rawInput)` (including `specflow-fetch-issue` for URL mode) `→ deriveChangeIdFromSource(source) if omitted → ensureChangeExists(changeId) → render proposal → ensureRunStarted`. The derivation step happens only after normalization/fetch has produced the canonical `ProposalSource`, and before any change creation or proposal rendering. This sequencing is required so `specflow-prepare-change <issue-url>` slugs the fetched issue title instead of the URL string, `specflow-prepare-change <inline-text>` slugs the sanitized inline text, and both one-argument forms still run `openspec new change <CHANGE_ID>` when the derived change directory is missing. The deprecated `--source-file` path deserializes into the same in-memory `ProposalSource` object and joins the same downstream pipeline before proposal rendering and run start so issue-backed and inline-backed sources persist identical `run.json` source metadata and seeded proposal artifacts apart from the deprecation warning.

### Decision 6: Update command contract body, not the contract registry shape

**Choice:** Only the `content` string of the `specflow` command's Step 3 body section changes. The `commandContracts` registry structure, rendering logic, and all other commands are untouched.

**Rationale:** The contract registry shape is orthogonal to this change. Only the guide body text references the invocation form.

## Risks / Trade-offs

**[Risk] Inline text containing URLs might be misclassified** → Mitigation: The auto-detection rule is strict — only full `https://<host>/<owner>/<repo>/issues/<number>` matches trigger URL mode. Partial URLs, PR URLs, and shorthand refs are treated as inline text per the spec.

**[Risk] `specflow-run start --source-file` still requires a file path** → Mitigation: `specflow-prepare-change` writes a temp file internally (e.g., to `os.tmpdir()`) and cleans it up after `specflow-run start` returns. This is invisible to callers.

**[Risk] Shared regex extraction changes import paths** → Mitigation: The new `src/lib/issue-url.ts` is a single-constant module. Both consumers import it; no existing public API changes.

**[Trade-off] Deprecated `--source-file` adds code weight** → Accepted: The deprecation path is simple (emit warning, proceed as before) and will be removed in a future change. The code overhead is ~5 lines.
