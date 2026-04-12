## 1. Extract shared issue URL pattern

- [x] 1.1 Create `src/lib/issue-url.ts` exporting `ISSUE_URL_PATTERN` regex and a `matchIssueUrl(input: string)` helper that returns parsed host/owner/repo/number or null
- [x] 1.2 Update `src/bin/specflow-fetch-issue.ts` to import `ISSUE_URL_PATTERN` from the shared module instead of defining it locally
- [x] 1.3 Add unit tests for `matchIssueUrl` covering: valid github.com URL, GitHub Enterprise URL, PR URL (no match), shorthand ref (no match), plain text (no match)

## 2. Add raw input normalization to specflow-prepare-change

- [x] 2.1 Add `normalizeRawInput(rawInput: string)` function to `src/lib/proposal-source.ts` that classifies input via `matchIssueUrl`, fetches issue if URL, and returns a `ProposalSource` object
- [x] 2.2 Update argument parsing in `src/bin/specflow-prepare-change.ts` to accept 0-2 positional arguments plus optional `--source-file`, implementing the disambiguation rules: without `--source-file` (1 arg = raw-input, 2 args = change-id + raw-input, 3+ = error); with `--source-file` (0 args = derive change-id from file, 1 arg passing slug validation = change-id, 1 arg failing slug validation = "Conflicting inputs", 2+ args = "Conflicting inputs")
- [x] 2.3 Add `deriveChangeIdFromSource(source)` (or equivalent) and call it only after `normalizeRawInput(rawInput)` completes so single-argument URL mode slugs the fetched issue title and single-argument inline mode slugs sanitized inline text instead of the raw token
- [x] 2.4 Add deprecation warning to stderr when `--source-file` is used
- [x] 2.5 Add validation for rejected invocation shapes: no input, conflicting inputs, too many args, empty input
- [x] 2.6 Update `HELP_TEXT` to document the new positional argument form
- [x] 2.7 Wire the new raw input path into the existing `ensureChangeExists → ensureBranch → ensureProposalDraft → ensureRunStarted → ensureProposalPhase` pipeline, ensuring both `specflow-prepare-change <issue-url>` and `specflow-prepare-change <inline-text>` call `openspec new change <CHANGE_ID>` when the derived change does not exist and that the internal temp file for `specflow-run start --source-file` is written to `os.tmpdir()` and cleaned up
- [x] 2.8 Route deprecated `--source-file` inputs through the same in-memory `ProposalSource → proposal rendering → run start` pipeline so issue-backed and inline-backed source JSON preserve identical persisted `run.json` source metadata (`kind`, `provider`, `reference`, `title`, `body`) and seeded proposal artifacts apart from the deprecation warning

## 3. Update command guide body

- [x] 3.1 Update Step 3 content in `src/contracts/command-bodies.ts` to replace temp file creation with direct `specflow-prepare-change [<CHANGE_ID>] <raw-input>` invocation
- [x] 3.2 Remove the `/tmp/specflow-proposal-source.json` writing instructions and the `Target shape` JSON block from Step 3
- [x] 3.3 Verify generated `specflow.md` output no longer references `/tmp/specflow-proposal-source.json`

## 4. Tests

- [x] 4.1 Add integration tests for `specflow-prepare-change <issue-url>` that mock `specflow-fetch-issue`, derive `CHANGE_ID` from the fetched issue title after normalization, invoke `openspec new change <CHANGE_ID>` when the change does not exist, and persist issue-backed source metadata in `run.json`
- [x] 4.2 Add integration tests for `specflow-prepare-change <inline-text>` that derive `CHANGE_ID` from sanitized inline text after normalization, invoke `openspec new change <CHANGE_ID>` when the change does not exist, and persist inline-backed source metadata in `run.json`
- [x] 4.3 Add tests for deprecated `--source-file` path for both issue-backed and inline-backed source JSON fixtures, verifying the deprecation warning on stderr, unchanged persisted source metadata (`kind`, `provider`, `reference`, `title`, `body`) in `run.json`, and unchanged seeded proposal artifacts
- [x] 4.4 Add tests for all rejected invocation shapes: no input (error), empty input (error), fetch failure (error), too many args without `--source-file` (3+ positional → "Too many arguments"), and deprecated-path-specific conflicting-input rejections: `<CHANGE_ID> <raw-input> --source-file <path>` (2+ positional → "Conflicting inputs"), `<issue-url> --source-file <path>` (1 positional failing slug validation → "Conflicting inputs"), `"text with spaces" --source-file <path>` (1 positional with whitespace → "Conflicting inputs")
- [x] 4.4a Add tests for allowed deprecated-path shapes: `--source-file <path>` alone (derive change-id from file), and `<CHANGE_ID> --source-file <path>` (explicit change-id from positional slug)
- [x] 4.4b Add test for existing scaffold-only change reuse: when `openspec/changes/<CHANGE_ID>/` exists with `.openspec.yaml` but no `proposal.md`, verify that `openspec new change` is NOT called, `proposal.md` is seeded, and the run state ends in `proposal_draft`
- [x] 4.5 Add a transition test verifying that `--source-file` and positional issue URL input produce equivalent normalized source metadata in `run.json` (`kind`, `provider`, `reference`, `title`, `body`) and equivalent seeded proposal artifacts for the same issue, aside from the deprecation warning
- [x] 4.6 Add a transition test verifying that `--source-file` and positional inline-text input produce equivalent normalized source metadata in `run.json` (`kind`, `provider`, `reference`, `title`, `body`) and equivalent seeded proposal artifacts for the same inline input, aside from the deprecation warning

## 5. Update generated guide and verify

- [x] 5.1 Regenerate slash command guides (`specflow-generate-commands`) and verify the `specflow.md` output
- [x] 5.2 Run the full test suite and confirm CI checks pass
