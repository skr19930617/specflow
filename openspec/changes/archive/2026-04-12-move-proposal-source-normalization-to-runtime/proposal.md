## Why

Proposal source normalization (converting raw user input into a structured source JSON) is currently a surface-level responsibility of the `/specflow` slash command guide — the guide explicitly requires writing `/tmp/specflow-proposal-source.json` before calling `specflow-prepare-change`. This leaks adapter-specific details (temp file path, file-write behavior) into the command contract, couples normalization to the UI surface, and makes it harder for future external runtimes to reuse the proposal entry contract.

Source: https://github.com/skr19930617/specflow/issues/110

## What Changes

- `specflow-prepare-change` accepts raw input via a positional argument instead of requiring `--source-file`. The CLI auto-detects the input mode: if the argument matches the supported URL pattern (see Invocation Contract below), it internally calls `specflow-fetch-issue` to resolve the issue; otherwise it treats the argument as inline feature text. `--source-file` is deprecated but retained for backward compatibility — this is an **additive change with deprecation**, not an immediate breaking migration.
- The `/specflow` slash command guide no longer requires writing `/tmp/specflow-proposal-source.json` as a surface step — the guide passes raw input directly to `specflow-prepare-change`
- The `slash-command-guides` spec scenario for proposal guide entry is updated to reflect the new `specflow-prepare-change` invocation contract (no `--source-file` in the surface step)
- Temp file usage, if any, is confined to `specflow-prepare-change` internal implementation (local adapter detail, not visible to callers)
- `specflow-fetch-issue` CLI contract is unchanged — it remains a standalone tool, now also invoked internally by `specflow-prepare-change`
- Run-state `source` persistence is maintained — the normalized source metadata continues to be stored in `run.json`

### Invocation Contract

New primary form:

```
specflow-prepare-change [<CHANGE_ID>] <raw-input>
```

**Auto-detection rule**: `<raw-input>` is classified as an issue URL if and only if it matches `https://<host>/<owner>/<repo>/issues/<number>` (same pattern as `specflow-fetch-issue`). All other non-empty strings are treated as inline feature text.

**Supported invocation shapes:**

| Shape | Behavior |
|-------|----------|
| `specflow-prepare-change <change-id> <issue-url>` | Fetch issue, normalize, create change |
| `specflow-prepare-change <change-id> <inline-text>` | Normalize inline text, create change |
| `specflow-prepare-change <issue-url>` | Derive change-id from issue, fetch and normalize |
| `specflow-prepare-change <inline-text>` | Derive change-id from text, normalize |
| `specflow-prepare-change <change-id> --source-file <path>` | **(deprecated)** Read pre-normalized JSON file |

**Rejected invocation shapes (exit non-zero with error message):**

| Shape | Error |
|-------|-------|
| No arguments and no `--source-file` | "Missing required input: provide a raw input argument or --source-file" |
| Both positional `<raw-input>` and `--source-file` provided | "Conflicting inputs: provide either a raw input argument or --source-file, not both" |
| More than 2 positional arguments | "Too many arguments: expected [CHANGE_ID] \<raw-input\>" |
| `<raw-input>` is empty or whitespace-only | "Empty input: provide a non-empty raw input" |
| Issue URL fetch fails (network error, 404, etc.) | "Issue fetch failed: \<specflow-fetch-issue error\>. Verify the URL and try again." |

**Argument disambiguation**: When exactly 2 positional arguments are provided, the first is always interpreted as `<CHANGE_ID>` and the second as `<raw-input>`. When exactly 1 positional argument is provided and no `--source-file` flag is present, the argument is interpreted as `<raw-input>` and the change-id is derived from it.

**Deprecation behavior**: When `--source-file` is used, the CLI emits a deprecation warning to stderr: `"Warning: --source-file is deprecated. Pass raw input as a positional argument instead."` The deprecated path continues to function identically to the current behavior until a future removal release.

**Non-goals for URL detection**: GitHub Enterprise URLs (non-github.com hosts) are supported (delegated to `specflow-fetch-issue` which already handles `GH_HOST`). Pull request URLs, issue comment URLs, and shorthand references (e.g., `#123`, `owner/repo#123`) are NOT supported and are treated as inline text.

### Migration Classification

This is an **additive change with deprecation**, not an immediate breaking migration:
- The new positional-argument form is the recommended path going forward
- `--source-file` continues to work with a deprecation warning
- Command contracts and generated guides use the new positional form
- `--source-file` removal is deferred to a future proposal
- Transition tests verify both invocation forms produce equivalent output

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `slash-command-guides`: The proposal guide entry scenario changes — `specflow-prepare-change` invocation no longer requires a `--source-file` flag pointing to a pre-written temp file; the guide passes raw input directly as a positional argument
- `utility-cli-suite`: The `specflow-prepare-change` requirement changes — it accepts raw input as a positional argument (auto-detected as issue URL or inline text) and normalizes internally, rather than requiring a pre-normalized `--source-file`. `--source-file` is deprecated with a warning.

## Impact

- `src/bin/specflow-prepare-change.ts` — CLI interface changes to accept raw input modes with auto-detection and deprecation warning
- `src/lib/` — Source normalization logic moves from slash command guide responsibility to `specflow-prepare-change` internals
- Generated `specflow.md` command guide — Step 3 (Proposal Creation) no longer documents temp file creation
- `commandContracts` registry — The `specflow` contract body sections are updated to use the new invocation form
- Run-state source persistence contract is unchanged
