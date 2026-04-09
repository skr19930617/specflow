#!/usr/bin/env bats
# Tests for ledger_read function

load test_helper

@test "ledger_read creates new ledger when file missing" {
  local change_dir="${TEST_TEMP_DIR}/missing-feature"
  mkdir -p "$change_dir"

  local status_output
  local ledger_json
  ledger_json="$(ledger_read "$change_dir" 3>"${TEST_TEMP_DIR}/status.txt")"
  status_output="$(cat "${TEST_TEMP_DIR}/status.txt")"

  [ "$status_output" = "new" ]

  # Verify the empty ledger structure
  local feature_id
  feature_id="$(echo "$ledger_json" | jq -r '.feature_id')"
  [ "$feature_id" = "missing-feature" ]

  local current_round
  current_round="$(echo "$ledger_json" | jq -r '.current_round')"
  [ "$current_round" = "0" ]

  local findings_count
  findings_count="$(echo "$ledger_json" | jq '.findings | length')"
  [ "$findings_count" = "0" ]

  local status_field
  status_field="$(echo "$ledger_json" | jq -r '.status')"
  [ "$status_field" = "all_resolved" ]
}

@test "ledger_read returns clean for valid ledger" {
  local change_dir="${TEST_TEMP_DIR}/test-feature"
  mkdir -p "$change_dir"

  cp "${FIXTURES_DIR}/ledger_clean.json" "${change_dir}/review-ledger.json"

  local status_output
  local ledger_json
  ledger_json="$(ledger_read "$change_dir" 3>"${TEST_TEMP_DIR}/status.txt")"
  status_output="$(cat "${TEST_TEMP_DIR}/status.txt")"

  [ "$status_output" = "clean" ]

  # Verify the ledger content matches the fixture
  local feature_id
  feature_id="$(echo "$ledger_json" | jq -r '.feature_id')"
  [ "$feature_id" = "test-feature" ]

  local findings_count
  findings_count="$(echo "$ledger_json" | jq '.findings | length')"
  [ "$findings_count" = "3" ]
}

@test "ledger_read recovers from corrupt file using backup" {
  local change_dir="${TEST_TEMP_DIR}/recover-feature"
  mkdir -p "$change_dir"

  # Write corrupt JSON to ledger
  echo "NOT VALID JSON {{{" > "${change_dir}/review-ledger.json"

  # Write valid backup
  cp "${FIXTURES_DIR}/ledger_clean.json" "${change_dir}/review-ledger.json.bak"

  local status_output
  local ledger_json
  ledger_json="$(ledger_read "$change_dir" 3>"${TEST_TEMP_DIR}/status.txt")"
  status_output="$(cat "${TEST_TEMP_DIR}/status.txt")"

  [ "$status_output" = "recovered" ]

  # Verify recovered content matches backup
  local feature_id
  feature_id="$(echo "$ledger_json" | jq -r '.feature_id')"
  [ "$feature_id" = "test-feature" ]

  # Verify corrupt file was renamed
  [ -f "${change_dir}/review-ledger.json.corrupt" ]
  [ ! -f "${change_dir}/review-ledger.json" ]
}

@test "ledger_read signals prompt_user when both corrupt and no backup" {
  local change_dir="${TEST_TEMP_DIR}/corrupt-feature"
  mkdir -p "$change_dir"

  # Write corrupt JSON to ledger
  echo "NOT VALID JSON {{{" > "${change_dir}/review-ledger.json"

  # No backup file exists

  local status_output
  local ledger_json
  ledger_json="$(ledger_read "$change_dir" 3>"${TEST_TEMP_DIR}/status.txt")"
  status_output="$(cat "${TEST_TEMP_DIR}/status.txt")"

  [ "$status_output" = "prompt_user" ]

  # Should return an empty ledger as fallback
  local findings_count
  findings_count="$(echo "$ledger_json" | jq '.findings | length')"
  [ "$findings_count" = "0" ]

  local feature_id
  feature_id="$(echo "$ledger_json" | jq -r '.feature_id')"
  [ "$feature_id" = "corrupt-feature" ]
}
