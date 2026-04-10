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

for tool in node npm; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    error "Missing required tool: $tool"
    exit 1
  fi
done

RELEASE_URL="${SPECFLOW_RELEASE_URL:-https://github.com/skr19930617/specflow/releases/latest/download/specflow-node.tgz}"

echo
echo "${BOLD}specflow installer${RESET}"
echo

info "Installing latest specflow release..."
npm install -g --force "$RELEASE_URL" >/dev/null

echo
success "specflow installed successfully!"
echo
echo "  Release: $RELEASE_URL"
echo "  Next:    cd <your-project> && specflow-init"
echo
