#!/usr/bin/env bats
# Tests for ledger_match_findings

load test_helper

@test "same match by file+category+severity" {
  # Codex finding matches existing by file+category+severity => status becomes "open", relation "same"
  local ledger_json
  ledger_json="$(cat "${FIXTURES_DIR}/ledger_clean.json")"

  # Codex returns a finding that matches R1-F01 exactly (file, category, severity)
  local codex_findings='[{"id":"F1","severity":"high","category":"correctness","file":"src/main.sh","title":"Still missing error handling","detail":"..."}]'

  local result
  result="$(echo "$ledger_json" | ledger_match_findings "$codex_findings" 2)"

  # R1-F01 should be matched as "same" and remain open
  local matched_status
  matched_status="$(echo "$result" | jq -r '[.findings[] | select(.id == "R1-F01")][0].status')"
  [ "$matched_status" = "open" ]

  local matched_relation
  matched_relation="$(echo "$result" | jq -r '[.findings[] | select(.id == "R1-F01")][0].relation')"
  [ "$matched_relation" = "same" ]

  # R1-F02 (medium/completeness/utils.sh) is not matched by this codex finding => resolved
  local unmatched_status
  unmatched_status="$(echo "$result" | jq -r '[.findings[] | select(.id == "R1-F02")][0].status')"
  [ "$unmatched_status" = "resolved" ]
}

@test "reframed match when severity differs" {
  # Codex returns finding for same file+category but different severity => reframed
  local ledger_json
  ledger_json="$(cat "${FIXTURES_DIR}/ledger_clean.json")"

  # Same file+category as R1-F01 (correctness/src/main.sh) but medium instead of high
  local codex_findings='[{"id":"F1","severity":"medium","category":"correctness","file":"src/main.sh","title":"Minor error handling issue","detail":"..."}]'

  local result
  result="$(echo "$ledger_json" | ledger_match_findings "$codex_findings" 2)"

  # R1-F01 should be resolved and marked as reframed
  local old_status
  old_status="$(echo "$result" | jq -r '[.findings[] | select(.id == "R1-F01")][0].status')"
  [ "$old_status" = "resolved" ]

  local old_relation
  old_relation="$(echo "$result" | jq -r '[.findings[] | select(.id == "R1-F01")][0].relation')"
  [ "$old_relation" = "reframed" ]

  # A new finding should be created with the new severity
  local new_finding_count
  new_finding_count="$(echo "$result" | jq '[.findings[] | select(.id | startswith("R2-")) | select(.relation == "reframed")] | length')"
  [ "$new_finding_count" -ge 1 ]
}

@test "remaining findings become new" {
  # Codex returns a finding that does not match any existing => new finding
  local ledger_json
  ledger_json="$(cat "${FIXTURES_DIR}/ledger_clean.json")"

  # Completely new finding (different file, category, severity)
  local codex_findings='[{"id":"F99","severity":"high","category":"security","file":"src/auth.sh","title":"SQL injection","detail":"..."}]'

  local result
  result="$(echo "$ledger_json" | ledger_match_findings "$codex_findings" 2)"

  # Should have a new finding with R2- prefix
  local new_findings
  new_findings="$(echo "$result" | jq '[.findings[] | select(.id | startswith("R2-")) | select(.status == "new")] | length')"
  [ "$new_findings" -ge 1 ]

  # All previously active findings should be resolved (none matched)
  local active_old
  active_old="$(echo "$result" | jq '[.findings[] | select(.id == "R1-F01" and .status == "resolved")] | length')"
  [ "$active_old" -eq 1 ]

  local active_old2
  active_old2="$(echo "$result" | jq '[.findings[] | select(.id == "R1-F02" and .status == "resolved")] | length')"
  [ "$active_old2" -eq 1 ]
}

@test "zero findings resolves all active" {
  local ledger_json
  ledger_json="$(cat "${FIXTURES_DIR}/ledger_clean.json")"

  # Empty findings array
  local codex_findings='[]'

  local result
  result="$(echo "$ledger_json" | ledger_match_findings "$codex_findings" 2)"

  # R1-F01 was open => should be resolved
  local f01_status
  f01_status="$(echo "$result" | jq -r '[.findings[] | select(.id == "R1-F01")][0].status')"
  [ "$f01_status" = "resolved" ]

  # R1-F02 was new (active) => should be resolved
  local f02_status
  f02_status="$(echo "$result" | jq -r '[.findings[] | select(.id == "R1-F02")][0].status')"
  [ "$f02_status" = "resolved" ]

  # R1-F03 was already resolved => should remain resolved
  local f03_status
  f03_status="$(echo "$result" | jq -r '[.findings[] | select(.id == "R1-F03")][0].status')"
  [ "$f03_status" = "resolved" ]
}

@test "override findings preserved" {
  # Create a ledger with an override finding
  local ledger_json
  ledger_json='{"feature_id":"test","phase":"impl","current_round":1,"status":"in_progress","max_finding_id":2,"findings":[
    {"id":"R1-F01","severity":"high","category":"correctness","file":"src/main.sh","title":"Error handling","detail":"...","status":"accepted_risk","notes":"Intentional design choice"},
    {"id":"R1-F02","severity":"medium","category":"completeness","file":"src/utils.sh","title":"Missing validation","detail":"...","status":"open","notes":""}
  ],"round_summaries":[]}'

  # Codex returns finding matching R1-F01 (the override)
  local codex_findings='[{"id":"F1","severity":"high","category":"correctness","file":"src/main.sh","title":"Error handling","detail":"..."}]'

  local result
  result="$(echo "$ledger_json" | ledger_match_findings "$codex_findings" 2)"

  # Override finding should keep its status (accepted_risk)
  local override_status
  override_status="$(echo "$result" | jq -r '[.findings[] | select(.id == "R1-F01")][0].status')"
  [ "$override_status" = "accepted_risk" ]

  # R1-F02 was active but not matched => resolved
  local other_status
  other_status="$(echo "$result" | jq -r '[.findings[] | select(.id == "R1-F02")][0].status')"
  [ "$other_status" = "resolved" ]
}
