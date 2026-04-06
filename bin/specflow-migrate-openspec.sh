#!/usr/bin/env bash
set -euo pipefail

# specflow-migrate-openspec.sh — Migrate specs/ to openspec/changes/ (OpenSpec structure)
# Usage: specflow-migrate-openspec.sh [--dry-run] [--help]

SCRIPT_NAME="$(basename "$0")"
DRY_RUN=false
REPO_ROOT=""

# Counters
MIGRATED=0
SKIPPED=0
RECOVERED=0
ERRORS=0

usage() {
  cat <<EOF
Usage: $SCRIPT_NAME [OPTIONS]

Migrate specs/<NNN>-<name>/ directories to openspec/changes/<NNN>-<name>/.

Options:
  --dry-run   Show what would be done without making changes
  --help      Show this help message

Migration rules:
  - spec.md → proposal.md (with Historical Migration header)
  - plan.md → design.md (with Historical Migration header)
  - tasks.md → tasks.md (with Historical Migration header)
  - All other files → copied as-is

Idempotence:
  - Fully migrated entries (target exists, source gone) → skipped
  - Partial migrations (.migrating/ temp dir exists) → recovered and re-migrated
  - Conflicts (both source and target exist) → re-migrated from source
EOF
  exit 0
}

log() { echo "[migrate] $*"; }
log_dry() { echo "[dry-run] $*"; }

# Parse arguments
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --help) usage ;;
    *) echo "Unknown option: $arg"; usage ;;
  esac
done

# Determine repo root
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

SPECS_DIR="$REPO_ROOT/specs"
OPENSPEC_DIR="$REPO_ROOT/openspec"
CHANGES_DIR="$OPENSPEC_DIR/changes"
CAPABILITY_DIR="$OPENSPEC_DIR/specs"

# Create openspec structure
create_openspec_dirs() {
  if [[ ! -d "$CAPABILITY_DIR" ]]; then
    if $DRY_RUN; then
      log_dry "Would create $CAPABILITY_DIR"
    else
      mkdir -p "$CAPABILITY_DIR"
      log "Created $CAPABILITY_DIR"
    fi
  fi
  if [[ ! -d "$CHANGES_DIR" ]]; then
    if $DRY_RUN; then
      log_dry "Would create $CHANGES_DIR"
    else
      mkdir -p "$CHANGES_DIR"
      log "Created $CHANGES_DIR"
    fi
  fi
}

# Generate Historical Migration header
migration_header() {
  local source_path="$1"
  local date
  date="$(date +%Y-%m-%d)"
  cat <<EOF
<!-- Historical Migration
  Source: $source_path
  Migrated: $date
  Context: Migrated from legacy specs/ structure to OpenSpec changes/ as part of issue #47
-->

EOF
}

# Map and copy a single file with optional header injection
copy_with_mapping() {
  local src_file="$1"
  local dest_dir="$2"
  local src_basename
  src_basename="$(basename "$src_file")"

  local dest_name="$src_basename"
  local inject_header=false

  case "$src_basename" in
    spec.md)
      dest_name="proposal.md"
      inject_header=true
      ;;
    plan.md)
      dest_name="design.md"
      inject_header=true
      ;;
    tasks.md)
      dest_name="tasks.md"
      inject_header=true
      ;;
  esac

  local dest_file="$dest_dir/$dest_name"

  if $inject_header; then
    local rel_src="${src_file#"$REPO_ROOT/"}"
    migration_header "$rel_src" > "$dest_file"
    cat "$src_file" >> "$dest_file"
  else
    cp "$src_file" "$dest_file"
  fi
}

# Migrate a single specs entry atomically
migrate_entry() {
  local entry_name="$1"
  local source_dir="$SPECS_DIR/$entry_name"
  local target_dir="$CHANGES_DIR/$entry_name"
  local temp_dir="$CHANGES_DIR/${entry_name}.migrating"

  # State detection
  local source_exists=false
  local target_exists=false
  local temp_exists=false

  [[ -d "$source_dir" ]] && source_exists=true
  [[ -d "$target_dir" ]] && target_exists=true
  [[ -d "$temp_dir" ]] && temp_exists=true

  # Fully migrated: target exists, source gone → skip
  if $target_exists && ! $source_exists && ! $temp_exists; then
    if $DRY_RUN; then
      log_dry "SKIP $entry_name (already migrated)"
    fi
    SKIPPED=$((SKIPPED + 1))
    return 0
  fi

  # Partial migration: temp dir exists → clean up and re-migrate
  if $temp_exists; then
    if $DRY_RUN; then
      log_dry "RECOVER $entry_name (cleaning up .migrating/)"
    else
      rm -rf "$temp_dir"
      log "Recovered partial migration: $entry_name"
    fi
    RECOVERED=$((RECOVERED + 1))
  fi

  # Conflict: both source and target exist → remove target, re-migrate
  if $target_exists && $source_exists; then
    if $DRY_RUN; then
      log_dry "CONFLICT $entry_name (re-migrating from source)"
    else
      rm -rf "$target_dir"
      log "Removed conflicting target: $entry_name"
    fi
  fi

  # Source must exist to migrate
  if ! $source_exists; then
    log "ERROR: source not found for $entry_name (and no target exists)"
    ERRORS=$((ERRORS + 1))
    return 1
  fi

  if $DRY_RUN; then
    log_dry "MIGRATE $entry_name → openspec/changes/$entry_name"
    MIGRATED=$((MIGRATED + 1))
    return 0
  fi

  # Step 1: Copy to temp directory
  mkdir -p "$temp_dir"

  # Copy files with mapping
  for file in "$source_dir"/*; do
    [[ -e "$file" ]] || continue
    if [[ -d "$file" ]]; then
      cp -r "$file" "$temp_dir/"
    else
      copy_with_mapping "$file" "$temp_dir"
    fi
  done

  # Copy hidden files if any
  for file in "$source_dir"/.*; do
    [[ -e "$file" ]] || continue
    local base
    base="$(basename "$file")"
    [[ "$base" == "." || "$base" == ".." ]] && continue
    cp -r "$file" "$temp_dir/"
  done

  # Step 2: Atomic rename
  mv "$temp_dir" "$target_dir"

  # Step 3: Remove source
  rm -rf "$source_dir"

  log "Migrated: $entry_name"
  MIGRATED=$((MIGRATED + 1))
}

# Main
main() {
  log "Starting OpenSpec migration..."
  if $DRY_RUN; then
    log_dry "Dry run mode — no changes will be made"
  fi

  create_openspec_dirs

  # Check if specs/ exists
  if [[ ! -d "$SPECS_DIR" ]]; then
    # Check if already fully migrated
    if [[ -d "$CHANGES_DIR" ]]; then
      log "specs/ directory not found. Migration may already be complete."
      log "Summary: migrated=0, skipped=0, recovered=0, errors=0"
      exit 0
    else
      log "ERROR: Neither specs/ nor openspec/changes/ found. Nothing to migrate."
      exit 1
    fi
  fi

  # Enumerate entries
  local entries=()
  for dir in "$SPECS_DIR"/*/; do
    [[ -d "$dir" ]] || continue
    entries+=("$(basename "$dir")")
  done

  # Also check for already-migrated entries in changes/ (for skip counting)
  if [[ -d "$CHANGES_DIR" ]]; then
    for dir in "$CHANGES_DIR"/*/; do
      [[ -d "$dir" ]] || continue
      local name
      name="$(basename "$dir")"
      # Only add if not already in entries and not a .migrating dir
      if [[ "$name" != *.migrating ]] && ! printf '%s\n' "${entries[@]}" | grep -qx "$name"; then
        entries+=("$name")
      fi
    done
  fi

  if [[ ${#entries[@]} -eq 0 ]]; then
    log "No entries found to migrate."
    exit 0
  fi

  # Sort entries
  IFS=$'\n' entries=($(sort <<<"${entries[*]}")); unset IFS

  log "Found ${#entries[@]} entries to process"

  for entry in "${entries[@]}"; do
    migrate_entry "$entry" || true
  done

  # Remove empty specs/ directory
  if [[ -d "$SPECS_DIR" ]]; then
    local remaining
    remaining=$(find "$SPECS_DIR" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')
    if [[ "$remaining" -eq 0 ]]; then
      if $DRY_RUN; then
        log_dry "Would remove empty specs/ directory"
      else
        rm -rf "$SPECS_DIR"
        log "Removed empty specs/ directory"
      fi
    else
      log "WARNING: specs/ still has $remaining entries — not removing"
    fi
  fi

  # Summary
  echo ""
  log "Migration complete!"
  log "Summary: migrated=$MIGRATED, skipped=$SKIPPED, recovered=$RECOVERED, errors=$ERRORS"
}

main
