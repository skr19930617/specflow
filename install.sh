#!/usr/bin/env bash
set -euo pipefail

# --- Colors (respects NO_COLOR: https://no-color.org/) ---
if [[ -z "${NO_COLOR:-}" ]] && [[ -t 1 ]]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[0;33m'
  BOLD='\033[1m'
  RESET='\033[0m'
else
  RED='' GREEN='' YELLOW='' BOLD='' RESET=''
fi

info()    { printf "${BOLD}==> %s${RESET}\n" "$*"; }
warn()    { printf "${YELLOW}==> WARNING: %s${RESET}\n" "$*"; }
error()   { printf "${RED}==> ERROR: %s${RESET}\n" "$*" >&2; }
success() { printf "${GREEN}==> %s${RESET}\n" "$*"; }

# --- Prerequisite checks ---
MISSING=()
for tool in git jq gh; do
  if ! command -v "$tool" &>/dev/null; then
    MISSING+=("$tool")
  fi
done

if [[ ${#MISSING[@]} -gt 0 ]]; then
  error "Missing required tools: ${MISSING[*]}"
  echo
  echo "Install with Homebrew:"
  for tool in "${MISSING[@]}"; do
    echo "  brew install $tool"
  done
  exit 1
fi

# --- Configuration ---
SPECFLOW_REPO="https://github.com/skr19930617/specflow.git"
SPECFLOW_BRANCH="${SPECFLOW_BRANCH:-main}"
SPECFLOW_HOME="${SPECFLOW_HOME:-$HOME/.config/specflow}"
CLONE_DIR="$SPECFLOW_HOME/src"

echo
echo "${BOLD}specflow installer${RESET}"
echo

# --- Clone or update ---
if [[ -d "$CLONE_DIR/.git" ]]; then
  info "Updating specflow (branch: $SPECFLOW_BRANCH)..."
  git -C "$CLONE_DIR" fetch origin "$SPECFLOW_BRANCH" --quiet
  git -C "$CLONE_DIR" checkout "$SPECFLOW_BRANCH" --quiet
  git -C "$CLONE_DIR" reset --hard "origin/$SPECFLOW_BRANCH" --quiet
else
  info "Cloning specflow (branch: $SPECFLOW_BRANCH)..."
  mkdir -p "$(dirname "$CLONE_DIR")"
  git clone --branch "$SPECFLOW_BRANCH" --single-branch --quiet \
    "$SPECFLOW_REPO" "$CLONE_DIR"
fi

# --- Run specflow-install ---
echo
"$CLONE_DIR/bin/specflow-install"

# --- Done ---
echo
success "specflow installed successfully!"
echo
echo "  Source:  $CLONE_DIR"
echo "  Update:  curl -fsSL https://raw.githubusercontent.com/skr19930617/specflow/main/install.sh | bash"
echo
echo "  Next:    cd <your-project> && specflow-init"
echo
