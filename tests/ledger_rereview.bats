#!/usr/bin/env bats
# Tests for ledger_match_rereview

load test_helper

@test "resolved findings updated correctly" {
  local ledger_json
  ledger_json="$(cat "${FIXTURES_DIR}/ledger_clean.json")"

  local codex_response
  codex_response="$(cat "${FIXTURES_DIR}/codex_rereview.json")"

  local result
  result="$(echo "$ledger_json" | ledger_match_rereview "$codex_response" 2)"

  # R1-F01 is in resolved_previous_findings => should be resolved
  local f01_status
  f01_status="$(echo "$result" | jq -r '[.findings[] | select(.id == "R1-F01")][0].status')"
  [ "$f01_status" = "resolved" ]

  local f01_resolved_round
  f01_resolved_round="$(echo "$result" | jq -r '[.findings[] | select(.id == "R1-F01")][0].resolved_round')"
  [ "$f01_resolved_round" = "2" ]
}

@test "missing prior IDs auto-classified as still_open" {
  # Create ledger with 3 non-resolved findings: F01 (open), F02 (new), F04 (open)
  local ledger_json='{"feature_id":"test","phase":"impl","current_round":1,"status":"in_progress","max_finding_id":4,"findings":[
    {"id":"R1-F01","severity":"high","category":"correctness","file":"src/main.sh","title":"Error","detail":"...","status":"open"},
    {"id":"R1-F02","severity":"medium","category":"completeness","file":"src/utils.sh","title":"Validate","detail":"...","status":"new"},
    {"id":"R1-F04","severity":"low","category":"style","file":"src/foo.sh","title":"Style","detail":"...","status":"open"}
  ],"round_summaries":[]}'

  # Codex only mentions F01 as resolved, F02 as still_open — F04 is missing
  local codex_response='{"decision":"APPROVE","resolved_previous_findings":["R1-F01"],"still_open_previous_findings":["R1-F02"],"new_findings":[],"summary":"partial review"}'

  local result
  result="$(echo "$ledger_json" | ledger_match_rereview "$codex_response" 2)"

  # F01 should be resolved
  local f01_status
  f01_status="$(echo "$result" | jq -r '[.findings[] | select(.id == "R1-F01")][0].status')"
  [ "$f01_status" = "resolved" ]

  # F02 should be open (explicitly still_open)
  local f02_status
  f02_status="$(echo "$result" | jq -r '[.findings[] | select(.id == "R1-F02")][0].status')"
  [ "$f02_status" = "open" ]

  # F04 is missing from both lists => auto-classified as still_open => status "open"
  local f04_status
  f04_status="$(echo "$result" | jq -r '[.findings[] | select(.id == "R1-F04")][0].status')"
  [ "$f04_status" = "open" ]
}

@test "duplicate IDs keep still_open" {
  # When an ID appears in both resolved and still_open, still_open wins
  local ledger_json='{"feature_id":"test","phase":"impl","current_round":1,"status":"in_progress","max_finding_id":1,"findings":[
    {"id":"R1-F01","severity":"high","category":"correctness","file":"src/main.sh","title":"Error","detail":"...","status":"open"}
  ],"round_summaries":[]}'

  # F01 appears in both resolved and still_open
  local codex_response='{"decision":"REQUEST_CHANGES","resolved_previous_findings":["R1-F01"],"still_open_previous_findings":["R1-F01"],"new_findings":[],"summary":"conflict"}'

  local result
  result="$(echo "$ledger_json" | ledger_match_rereview "$codex_response" 2)"

  # still_open takes priority over resolved => status should be "open"
  local f01_status
  f01_status="$(echo "$result" | jq -r '[.findings[] | select(.id == "R1-F01")][0].status')"
  [ "$f01_status" = "open" ]
}

@test "unknown IDs excluded from ledger" {
  local ledger_json
  ledger_json="$(cat "${FIXTURES_DIR}/ledger_clean.json")"

  # Codex references an ID that does not exist in the ledger
  local codex_response='{"decision":"APPROVE","resolved_previous_findings":["R1-F01","UNKNOWN-99"],"still_open_previous_findings":["R1-F02"],"new_findings":[],"summary":"includes unknown ID"}'

  local result
  result="$(echo "$ledger_json" | ledger_match_rereview "$codex_response" 2)"

  # UNKNOWN-99 should not appear in the ledger findings
  local unknown_count
  unknown_count="$(echo "$result" | jq '[.findings[] | select(.id == "UNKNOWN-99")] | length')"
  [ "$unknown_count" = "0" ]

  # R1-F01 should still be resolved normally
  local f01_status
  f01_status="$(echo "$result" | jq -r '[.findings[] | select(.id == "R1-F01")][0].status')"
  [ "$f01_status" = "resolved" ]

  # Total findings count should remain 3 (the original ones, no unknown added)
  local total_findings
  total_findings="$(echo "$result" | jq '.findings | length')"
  [ "$total_findings" = "3" ]
}
