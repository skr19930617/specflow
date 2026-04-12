## MODIFIED Requirements

### Requirement: Apply review operates on filtered git diffs and an implementation ledger
`specflow-review-apply` SHALL obtain the implementation diff via the injected
`WorkspaceContext.filteredDiff()` method instead of calling `specflow-filter-diff`
directly, and SHALL persist implementation review state in `review-ledger.json`.

#### Scenario: Apply review filters the diff via WorkspaceContext
- **WHEN** `specflow-review-apply review <CHANGE_ID>` runs
- **THEN** it SHALL call `WorkspaceContext.filteredDiff()` with appropriate exclude globs
- **AND** it SHALL pass the filtered diff and `proposal.md` content into the review prompt

#### Scenario: Apply review handles empty diff from WorkspaceContext
- **WHEN** `WorkspaceContext.filteredDiff()` returns `summary: "empty"`
- **THEN** it SHALL skip the review and report that no reviewable changes were found

#### Scenario: Apply review warns on large diffs from WorkspaceContext
- **WHEN** `WorkspaceContext.filteredDiff()` returns a `DiffSummary` with `total_lines` exceeding the configured threshold
- **THEN** it SHALL set the `diff_warning` flag and follow the existing warning flow
