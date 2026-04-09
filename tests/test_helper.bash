#!/usr/bin/env bash
# test_helper.bash — Shared setup/teardown for bats-core tests
# Sourced via `load test_helper` at the top of each .bats file.

# ── Paths ──────────────────────────────────────────────────────────────
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIB_DIR="${PROJECT_ROOT}/lib"
BIN_DIR="${PROJECT_ROOT}/bin"
FIXTURES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/fixtures" && pwd)"

# ── Source the library under test ──────────────────────────────────────
source "${LIB_DIR}/specflow-ledger.sh"

# ── PATH setup (mock-codex + bin/ available) ───────────────────────────
export PATH="${PROJECT_ROOT}/tests:${BIN_DIR}:${PATH}"

# ── Per-test temp directory ────────────────────────────────────────────
setup() {
  TEST_TEMP_DIR="$(mktemp -d)"
}

teardown() {
  if [[ -n "${TEST_TEMP_DIR:-}" && -d "$TEST_TEMP_DIR" ]]; then
    rm -rf "$TEST_TEMP_DIR"
  fi
}
