#!/usr/bin/env bats
# Tests for compute_score and compute_status

load test_helper

@test "score calculation with mixed severities" {
  # ledger_clean has: high(open)=3pts, medium(new)=2pts, low(resolved)=0pts
  # Score should be 3 + 2 = 5 (resolved findings excluded)
  local score
  score="$(cat "${FIXTURES_DIR}/ledger_clean.json" | ledger_compute_score)"

  [ "$score" = "5" ]
}

@test "status has_open_high when high finding is open" {
  local result
  result="$(cat "${FIXTURES_DIR}/ledger_clean.json" | ledger_compute_status)"

  local computed_status
  computed_status="$(echo "$result" | jq -r '.status')"
  [ "$computed_status" = "has_open_high" ]
}

@test "status all_resolved when all resolved" {
  # Write ledger with all findings resolved to a temp file
  cat > "${TEST_TEMP_DIR}/ledger.json" <<'EOF'
{"feature_id":"test","phase":"impl","current_round":2,"status":"in_progress","max_finding_id":2,"findings":[
  {"id":"R1-F01","severity":"high","category":"correctness","file":"src/main.sh","title":"Error","detail":"...","status":"resolved"},
  {"id":"R1-F02","severity":"medium","category":"completeness","file":"src/utils.sh","title":"Validate","detail":"...","status":"resolved"}
],"round_summaries":[]}
EOF

  local result
  result="$(cat "${TEST_TEMP_DIR}/ledger.json" | ledger_compute_status)"

  local computed_status
  computed_status="$(echo "$result" | jq -r '.status')"
  [ "$computed_status" = "all_resolved" ]
}

@test "status in_progress for medium only" {
  # Only medium findings open (no high)
  cat > "${TEST_TEMP_DIR}/ledger.json" <<'EOF'
{"feature_id":"test","phase":"impl","current_round":1,"status":"in_progress","max_finding_id":1,"findings":[
  {"id":"R1-F01","severity":"medium","category":"correctness","file":"src/main.sh","title":"Medium issue","detail":"...","status":"open"}
],"round_summaries":[]}
EOF

  local result
  result="$(cat "${TEST_TEMP_DIR}/ledger.json" | ledger_compute_status)"

  local computed_status
  computed_status="$(echo "$result" | jq -r '.status')"
  [ "$computed_status" = "in_progress" ]
}

@test "actionable_count excludes resolved and overridden" {
  cat > "${TEST_TEMP_DIR}/ledger.json" <<'EOF'
{"feature_id":"test","phase":"impl","current_round":1,"status":"in_progress","max_finding_id":4,"findings":[
  {"id":"R1-F01","severity":"high","category":"correctness","file":"src/main.sh","title":"Error","detail":"...","status":"open"},
  {"id":"R1-F02","severity":"medium","category":"completeness","file":"src/utils.sh","title":"Validate","detail":"...","status":"new"},
  {"id":"R1-F03","severity":"low","category":"style","file":"src/foo.sh","title":"Style","detail":"...","status":"resolved"},
  {"id":"R1-F04","severity":"high","category":"security","file":"src/auth.sh","title":"Auth","detail":"...","status":"accepted_risk","notes":"Acceptable"}
],"round_summaries":[]}
EOF

  local count
  count="$(cat "${TEST_TEMP_DIR}/ledger.json" | ledger_actionable_count)"

  # Only F01 (open) and F02 (new) are actionable
  [ "$count" = "2" ]
}

@test "severity_summary formats correctly" {
  cat > "${TEST_TEMP_DIR}/ledger.json" <<'EOF'
{"feature_id":"test","phase":"impl","current_round":1,"status":"in_progress","max_finding_id":4,"findings":[
  {"id":"R1-F01","severity":"high","category":"correctness","file":"src/main.sh","title":"Error1","detail":"...","status":"open"},
  {"id":"R1-F02","severity":"high","category":"security","file":"src/auth.sh","title":"Error2","detail":"...","status":"new"},
  {"id":"R1-F03","severity":"medium","category":"completeness","file":"src/utils.sh","title":"Validate","detail":"...","status":"open"},
  {"id":"R1-F04","severity":"low","category":"style","file":"src/foo.sh","title":"Style","detail":"...","status":"resolved"}
],"round_summaries":[]}
EOF

  local summary
  summary="$(cat "${TEST_TEMP_DIR}/ledger.json" | ledger_severity_summary)"

  # Should be "HIGH: 2, MEDIUM: 1" (low is resolved, not actionable)
  [ "$summary" = "HIGH: 2, MEDIUM: 1" ]
}
