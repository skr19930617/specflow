/**
 * Shared OpenSpec readiness probe for slash-command Prerequisites sections.
 *
 * Returns the canonical first step of a Prerequisites block that:
 *   1. Invokes `openspec list --json > /dev/null 2>&1` as the probe.
 *   2. Branches on the exit status:
 *      - 127 (command not found) → instruct the user to run `specflow-install`.
 *      - Any other non-zero exit → instruct the user to run `specflow-init`.
 *   3. In both failure branches, tells the user to re-run the current slash
 *      command and stops.
 *
 * Callers append any additional numbered steps (e.g. reading
 * `openspec/config.yaml`) after the returned block.
 */
export function buildOpenspecPrereq(commandName: string): string {
	const retry = `\`/${commandName}\` を再実行してください`;
	return [
		"",
		"1. Run `openspec list --json > /dev/null 2>&1` via Bash to confirm OpenSpec is ready.",
		"   - If exit 127 (command not found):",
		"     ```",
		"     ❌ openspec CLI が見つかりません。",
		"",
		"     次のステップで解消してください:",
		"     1. `specflow-install` を実行",
		`     2. ${retry}`,
		"     ```",
		"     → **STOP**.",
		"   - If any other non-zero exit:",
		"     ```",
		"     ❌ OpenSpec が初期化されていません。",
		"",
		"     次のステップで解消してください:",
		"     1. `specflow-init` を実行",
		`     2. ${retry}`,
		"     ```",
		"     → **STOP**.",
	].join("\n");
}
