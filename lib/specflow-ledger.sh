#!/usr/bin/env bash
set -euo pipefail

# ── specflow-ledger.sh ──────────────────────────────────────────────────
# Bash library of ledger manipulation functions using jq.
# Sourced by the main orchestrator script.
# All functions operate on JSON via stdin/stdout or file paths.
# ────────────────────────────────────────────────────────────────────────

# ── Constants (defaults — overridable via ledger_init) ─────────────────

LEDGER_FILENAME="review-ledger.json"
LEDGER_BAK_FILENAME="review-ledger.json.bak"
LEDGER_CORRUPT_SUFFIX=".corrupt"
LEDGER_DEFAULT_PHASE="impl"

# ── ledger_init ────────────────────────────────────────────────────────
# Call before any ledger operations to configure the ledger filename.
# $1 = ledger filename (required, e.g. "review-ledger-design.json")
# $2 = default phase (optional, e.g. "design"; defaults to "impl")

ledger_init() {
  local filename="$1"
  LEDGER_FILENAME="$filename"
  LEDGER_BAK_FILENAME="${filename}.bak"
  LEDGER_DEFAULT_PHASE="${2:-impl}"
}

# ── Internal helpers ────────────────────────────────────────────────────

_log_warn() {
  echo "[ledger] WARNING: $*" >&2
}

_log_error() {
  echo "[ledger] ERROR: $*" >&2
}

_feature_id_from_dir() {
  basename "$1"
}

_empty_ledger() {
  local feature_id="$1"
  jq -n \
    --arg fid "$feature_id" \
    --arg phase "$LEDGER_DEFAULT_PHASE" \
    '{
      feature_id: $fid,
      phase: $phase,
      current_round: 0,
      status: "all_resolved",
      max_finding_id: 0,
      findings: [],
      round_summaries: []
    }'
}

_is_valid_json() {
  jq empty 2>/dev/null <<< "$1"
}

# Extract the numeric part after the last 'F' in a finding ID.
# e.g. R1-F03 -> 3, R2-F10 -> 10
_extract_finding_number() {
  local fid="$1"
  local num
  num="$(echo "$fid" | sed -E 's/.*F0*([0-9]+)$/\1/')"
  if [[ "$num" =~ ^[0-9]+$ ]]; then
    echo "$num"
  else
    echo "0"
  fi
}

# ── 1. ledger_read ──────────────────────────────────────────────────────
# Read $change_dir/review-ledger.json
# Outputs ledger JSON to stdout, status to fd 3.
# Status values: "new", "recovered", "prompt_user", "clean"

ledger_read() {
  local change_dir="$1"
  local ledger_path="${change_dir}/${LEDGER_FILENAME}"
  local bak_path="${change_dir}/${LEDGER_BAK_FILENAME}"
  local feature_id
  feature_id="$(_feature_id_from_dir "$change_dir")"

  # File does not exist
  if [[ ! -f "$ledger_path" ]]; then
    _empty_ledger "$feature_id"
    echo "new" >&3
    return 0
  fi

  # File exists — check validity
  local content
  content="$(cat "$ledger_path")"

  if _is_valid_json "$content"; then
    echo "$content"
    echo "clean" >&3
    return 0
  fi

  # Invalid JSON — rename to .corrupt
  _log_warn "Ledger is corrupt, renaming to ${LEDGER_CORRUPT_SUFFIX}"
  mv "$ledger_path" "${ledger_path}${LEDGER_CORRUPT_SUFFIX}"

  # Try .bak
  if [[ -f "$bak_path" ]]; then
    local bak_content
    bak_content="$(cat "$bak_path")"
    if _is_valid_json "$bak_content"; then
      _log_warn "Recovered ledger from backup"
      echo "$bak_content"
      echo "recovered" >&3
      return 0
    fi
  fi

  # Both corrupt
  _log_warn "Both ledger and backup are invalid. Creating empty ledger."
  _empty_ledger "$feature_id"
  echo "prompt_user" >&3
  return 0
}

# ── 2. ledger_validate ──────────────────────────────────────────────────
# Check high-severity findings with override status but empty notes.
# Reverts such findings to "open" status.

ledger_validate() {
  local ledger_json
  ledger_json="$(cat)"

  # Detect findings that will be reverted (before applying the fix)
  local original_overrides
  original_overrides="$(jq -r '
    [(.findings // [])[] |
     select(.severity == "high" and
            (.status == "accepted_risk" or .status == "ignored") and
            ((.notes // "") | gsub("\\s"; "") | length == 0))] |
     map(.id) | join(", ")
  ' <<< "$ledger_json")"

  if [[ -n "$original_overrides" ]]; then
    _log_warn "Reverted high-severity findings with empty notes to 'open': ${original_overrides}"
  fi

  # Apply the fix: revert override status to "open" for high-severity with empty notes
  jq -c '
    .findings = [
      (.findings // [])[] |
      if (.severity == "high") and
         (.status == "accepted_risk" or .status == "ignored") and
         ((.notes // "") | gsub("\\s"; "") | length == 0)
      then
        .status = "open"
      else
        .
      end
    ]
  ' <<< "$ledger_json"
}

# ── 3. ledger_increment_round ───────────────────────────────────────────
# Increment current_round by 1.

ledger_increment_round() {
  jq -c '.current_round += 1'
}

# ── 4. ledger_match_findings ────────────────────────────────────────────
# 3-stage matching algorithm for first-time review results.
# $1 = codex_findings_json (file path or JSON string)
# $2 = current_round

ledger_match_findings() {
  local codex_findings="$1"
  local current_round="$2"
  local ledger_json
  ledger_json="$(cat)"

  # Read codex findings — accept both file path and raw JSON
  local codex_data
  if [[ -f "$codex_findings" ]]; then
    codex_data="$(cat "$codex_findings")"
  else
    codex_data="$codex_findings"
  fi

  jq -c \
    --argjson codex "$codex_data" \
    --argjson round "$current_round" \
    '
    # Classify existing findings
    def is_override: .status == "accepted_risk" or .status == "ignored";
    def is_active: .status == "open" or .status == "new";

    # Ensure codex is an array
    ($codex | if type == "array" then . else [] end) as $codex_arr |

    # Handle zero codex findings: resolve all active, preserve overrides
    if ($codex_arr | length) == 0 then
      .findings = [
        .findings[] |
        if is_active then .status = "resolved" | .resolved_round = $round
        else .
        end
      ]
    else
      # Build lookup structures
      (.findings | map(select(is_active))) as $active |
      (.findings | map(select(is_override))) as $overrides |
      (.findings | map(select((is_active or is_override) | not))) as $others |

      # ── Step 1: exact match by file+category+severity ──
      # Track matched indices
      (reduce range($codex_arr | length) as $ci (
        {
          matched_codex: [],
          matched_existing_ids: [],
          step1_results: []
        };

        ($codex_arr[$ci]) as $cf |
        ([$active[], $overrides[]] |
         map(select(
           .file == $cf.file and
           .category == $cf.category and
           .severity == $cf.severity
         )) | .[0] // null) as $match |

        if $match != null and ([.matched_existing_ids[] | select(. == $match.id)] | length == 0) then
          .matched_codex += [$ci] |
          .matched_existing_ids += [$match.id] |
          if ($match | is_override) then
            .step1_results += [$match | .relation = "same" | .latest_round = $round]
          else
            .step1_results += [$match | .status = "open" | .relation = "same" | .latest_round = $round]
          end
        else
          .
        end
      )) as $step1 |

      # ── Step 2: reframed — unmatched codex match by file+category, different severity ──
      (reduce range($codex_arr | length) as $ci (
        ($step1 | . + {
          step2_resolved: [],
          step2_new: [],
          matched_codex2: [],
          matched_existing_ids2: [],
          seq: 1
        });

        if ([.matched_codex[] | select(. == $ci)] | length > 0) then . # already matched in step 1
        else
          ($codex_arr[$ci]) as $cf |
          (.matched_existing_ids2 // []) as $already_matched2 |
          ([$active[], $overrides[]] |
           map(select(
             .file == $cf.file and
             .category == $cf.category and
             .severity != $cf.severity
           )) |
           map(select(
             . as $e |
             [($step1.matched_existing_ids // [])[], $already_matched2[]] |
             map(select(. == $e.id)) | length == 0
           )) | .[0] // null) as $match |

          if $match != null then
            .matched_codex2 += [$ci] |
            .matched_existing_ids2 += [$match.id] |
            .step2_resolved += [$match | .status = "resolved" | .latest_round = $round | .relation = "reframed"] |
            .step2_new += [
              $cf + {
                id: ("R\($round)-F\(.seq | tostring | if length < 2 then "0" + . else . end)"),
                origin_round: $round,
                latest_round: $round,
                status: "open",
                relation: "reframed",
                supersedes: $match.id,
                notes: ""
              }
            ] |
            .seq += 1
          else
            .
          end
        end
      )) as $step2 |

      # ── Step 3: remaining unmatched ──
      # All matched codex indices
      ([$step1.matched_codex[], ($step2.matched_codex2 // [])[]] | unique) as $all_matched_codex |
      ([$step1.matched_existing_ids[], ($step2.matched_existing_ids2 // [])[]] | unique) as $all_matched_ids |

      # Unmatched codex → new findings
      ($step2.seq) as $start_seq |
      (reduce range($codex_arr | length) as $ci (
        { new_findings: [], seq: $start_seq };

        if ([$all_matched_codex[] | select(. == $ci)] | length > 0) then .
        else
          ($codex_arr[$ci]) as $cf |
          .new_findings += [
            $cf + {
              id: ("R\($round)-F\(.seq | tostring | if length < 2 then "0" + . else . end)"),
              origin_round: $round,
              latest_round: $round,
              status: "new",
              relation: "new",
              supersedes: null,
              notes: ""
            }
          ] |
          .seq += 1
        end
      )) as $step3_new |

      # Unmatched active → resolved
      [$active[] | select(
        . as $a | [$all_matched_ids[] | select(. == $a.id)] | length == 0
      ) | .status = "resolved"] as $step3_resolved |

      # Unmatched overrides → preserved as-is
      [$overrides[] | select(
        . as $o | [$all_matched_ids[] | select(. == $o.id)] | length == 0
      )] as $step3_preserved |

      # Combine all findings
      .findings = (
        $step1.step1_results +
        ($step2.step2_resolved // []) +
        ($step2.step2_new // []) +
        $step3_new.new_findings +
        $step3_resolved +
        $step3_preserved +
        $others
      )
    end
  ' <<< "$ledger_json"
}

# ── 5. ledger_match_rereview ────────────────────────────────────────────
# Apply re-review classifications from Codex response.
# $1 = codex_response_json (file path or JSON string)
# $2 = current_round

ledger_match_rereview() {
  local codex_response="$1"
  local current_round="$2"
  local ledger_json
  ledger_json="$(cat)"

  local codex_data
  if [[ -f "$codex_response" ]]; then
    codex_data="$(cat "$codex_response")"
  else
    codex_data="$codex_response"
  fi

  jq -c \
    --argjson resp "$codex_data" \
    --argjson round "$current_round" \
    '
    def is_override: .status == "accepted_risk" or .status == "ignored";

    # Extract arrays from response (default to empty)
    ($resp.resolved_previous_findings // []) as $resolved_ids |
    ($resp.still_open_previous_findings // []) as $still_open_ids |
    ($resp.new_findings // []) as $new_findings |

    # Collect all prior finding IDs (non-resolved, from previous rounds)
    [.findings[] | select(.status != "resolved") | .id] as $prior_ids |

    # Build sets for quick lookup (extract .id from objects)
    ($resolved_ids | map(if type == "object" then .id else tostring end)) as $resolved_set |
    ($still_open_ids | map(if type == "object" then .id else tostring end)) as $still_open_set |

    # ── Duplicate check: if an ID appears in both resolved and still_open, keep still_open ──
    ($resolved_set - $still_open_set) as $clean_resolved |

    # ── Exhaustive check: prior IDs not in either list → auto-classify as still_open ──
    [$prior_ids[] | select(
      . as $pid |
      ([$clean_resolved[] | select(. == $pid)] | length == 0) and
      ([$still_open_set[] | select(. == $pid)] | length == 0)
    )] as $missing_ids |

    ($still_open_set + $missing_ids) as $final_still_open |

    # ── Unknown ID exclusion: IDs in response not in prior_ids are ignored ──

    # Apply resolved classification
    .findings = [
      .findings[] | .id as $fid |
      if ([$clean_resolved[] | select(. == $fid)] | length > 0) then
        if is_override then .  # preserve override
        else .status = "resolved" | .resolved_round = $round
        end
      elif ([$final_still_open[] | select(. == $fid)] | length > 0) then
        if is_override then .  # preserve override
        else .status = "open"
        end
      else
        .  # already resolved or not referenced
      end
    ] |

    # ── Add new findings with new IDs ──
    (.max_finding_id // 0) as $base_id |
    reduce range($new_findings | length) as $i (
      . + { _seq: ($base_id + 1) };

      ($new_findings[$i]) as $nf |
      .findings += [
        $nf + {
          id: ("R\($round)-F\(._seq | tostring | if length < 2 then "0" + . else . end)"),
          origin_round: $round,
          latest_round: $round,
          status: "new",
          relation: "new",
          supersedes: null,
          notes: ""
        }
      ] |
      ._seq += 1
    ) |
    del(._seq)
  ' <<< "$ledger_json"
}

# ── 6. ledger_compute_summary ───────────────────────────────────────────
# Compute a round snapshot and append to round_summaries.
# $1 = current_round

ledger_compute_summary() {
  local current_round="$1"
  local ledger_json
  ledger_json="$(cat)"

  jq -c \
    --argjson round "$current_round" \
    '
    (.findings // []) as $all |

    ($all | length) as $total |
    ([$all[] | select(.status == "open" or .status == "new")] | length) as $open |
    ([$all[] | select(.status == "new")] | length) as $new |
    ([$all[] | select(.status == "resolved")] | length) as $resolved |
    ([$all[] | select(.status == "accepted_risk" or .status == "ignored")] | length) as $overridden |

    # by_severity breakdown for actionable findings
    ([$all[] | select(.status == "open" or .status == "new")] | group_by(.severity) |
     map({ key: (.[0].severity // "unknown"), value: length }) |
     from_entries) as $by_severity |

    {
      round: $round,
      total: $total,
      open: $open,
      new: $new,
      resolved: $resolved,
      overridden: $overridden,
      by_severity: $by_severity
    } as $summary |

    .round_summaries += [$summary]
  ' <<< "$ledger_json"
}

# ── 7. ledger_compute_status ────────────────────────────────────────────
# Derive and set the top-level status field.

ledger_compute_status() {
  jq -c '
    (.findings // []) as $all |

    # has_open_high: any high-severity finding with status in [open, new, accepted_risk, ignored]
    ([$all[] | select(
      .severity == "high" and
      (.status == "open" or .status == "new" or .status == "accepted_risk" or .status == "ignored")
    )] | length > 0) as $has_open_high |

    # all_resolved: all findings resolved, or no findings at all
    ([$all[] | select(.status != "resolved")] | length == 0) as $all_resolved |

    .status = (
      if $has_open_high then "has_open_high"
      elif $all_resolved then "all_resolved"
      else "in_progress"
      end
    )
  '
}

# ── 8. ledger_compute_score ─────────────────────────────────────────────
# Compute severity-weighted score for non-resolved findings.
# Output: just the score number.

ledger_compute_score() {
  jq -r '
    [(.findings // [])[] | select(.status != "resolved") |
     if .severity == "high" then 3
     elif .severity == "medium" then 2
     elif .severity == "low" then 1
     else 0
     end
    ] | add // 0
  '
}

# ── 9. ledger_persist_max_finding_id ────────────────────────────────────
# Compute max numeric part across all finding IDs and set max_finding_id.

ledger_persist_max_finding_id() {
  jq -c '
    [(.findings // [])[] | .id // "" |
     capture("F0*(?<n>[0-9]+)$") | .n | tonumber
    ] | (max // 0) as $max_id |
    . + { max_finding_id: $max_id }
  '
}

# ── 10. ledger_backup_and_write ─────────────────────────────────────────
# $1 = change_dir, stdin = ledger JSON, $2 = clean_read flag ("true"/"false")

ledger_backup_and_write() {
  local change_dir="$1"
  local is_clean_read="${2:-false}"
  local ledger_json
  ledger_json="$(cat)"

  local ledger_path="${change_dir}/${LEDGER_FILENAME}"
  local bak_path="${change_dir}/${LEDGER_BAK_FILENAME}"

  # Backup current file if it was a clean read
  if [[ "$is_clean_read" == "true" && -f "$ledger_path" ]]; then
    cp "$ledger_path" "$bak_path"
  fi

  # Atomic write: temp file + mv
  mkdir -p "$change_dir"
  local tmp_file
  tmp_file="$(mktemp "${change_dir}/${LEDGER_FILENAME}.XXXXXX")"
  echo "$ledger_json" | jq . > "$tmp_file"
  mv "$tmp_file" "$ledger_path"
}

# ── 11. ledger_actionable_count ─────────────────────────────────────────
# Count findings where status in [new, open].

ledger_actionable_count() {
  jq -r '
    [(.findings // [])[] | select(.status == "new" or .status == "open")] | length
  '
}

# ── 12. ledger_severity_summary ─────────────────────────────────────────
# Group actionable findings by severity, format as "HIGH: N, MEDIUM: M, LOW: L".

ledger_severity_summary() {
  jq -r '
    [(.findings // [])[] | select(.status == "new" or .status == "open")] |
    group_by(.severity) |
    map({
      key: (.[0].severity // "unknown" | ascii_upcase),
      value: length
    }) |
    sort_by(
      if .key == "HIGH" then 0
      elif .key == "MEDIUM" then 1
      elif .key == "LOW" then 2
      else 3
      end
    ) |
    map(select(.value > 0)) |
    map("\(.key): \(.value)") |
    join(", ")
  '
}
