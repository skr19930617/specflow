#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${NO_COLOR:-}" ]] && [[ -t 1 ]]; then
  GREEN='\033[0;32m'
  RED='\033[0;31m'
  BOLD='\033[1m'
  RESET='\033[0m'
else
  GREEN='' RED='' BOLD='' RESET=''
fi

info() { printf "${BOLD}==> %s${RESET}\n" "$*"; }
error() { printf "${RED}==> ERROR: %s${RESET}\n" "$*" >&2; }
success() { printf "${GREEN}==> %s${RESET}\n" "$*"; }

for tool in git node npm; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    error "Missing required tool: $tool"
    exit 1
  fi
done

SPECFLOW_REPO="https://github.com/skr19930617/specflow.git"
SPECFLOW_BRANCH="${SPECFLOW_BRANCH:-main}"
SPECFLOW_HOME="${SPECFLOW_HOME:-$HOME/.config/specflow}"
CLONE_DIR="$SPECFLOW_HOME/src"

echo
echo "${BOLD}specflow installer${RESET}"
echo

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

info "Building distribution bundle..."
npm --prefix "$CLONE_DIR" run build >/dev/null

info "Installing generated distribution bundle..."
node "$CLONE_DIR/dist/bin/specflow-install.js"

echo
success "specflow installed successfully!"
echo
echo "  Source:  $CLONE_DIR"
echo "  Next:    cd <your-project> && specflow-init"
echo
