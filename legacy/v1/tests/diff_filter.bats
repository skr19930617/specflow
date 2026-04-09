#!/usr/bin/env bats
# Tests for diff filtering (specflow-filter-diff)

load test_helper

@test "empty diff returns error status" {
  # Create a mock specflow-filter-diff that produces empty diff
  local mock_filter="${TEST_TEMP_DIR}/specflow-filter-diff"
  cat > "$mock_filter" <<'MOCK'
#!/usr/bin/env bash
# Simulate empty diff: write nothing to stdout, write JSON summary to stderr
echo '{"excluded":[],"warnings":[],"included_count":0,"excluded_count":0,"total_lines":0}' >&2
exit 0
MOCK
  chmod +x "$mock_filter"

  # Run the mock filter and capture its output
  local diff_file="${TEST_TEMP_DIR}/diff.txt"
  local summary_file="${TEST_TEMP_DIR}/summary.json"

  "$mock_filter" > "$diff_file" 2>"$summary_file" || true

  # diff file should be empty
  [ ! -s "$diff_file" ]

  # summary should be valid JSON
  local summary_json
  summary_json="$(cat "$summary_file")"
  echo "$summary_json" | jq empty

  # included_count should be 0
  local included_count
  included_count="$(echo "$summary_json" | jq -r '.included_count')"
  [ "$included_count" = "0" ]

  # total_lines should be 0
  local total_lines
  total_lines="$(echo "$summary_json" | jq -r '.total_lines')"
  [ "$total_lines" = "0" ]
}
