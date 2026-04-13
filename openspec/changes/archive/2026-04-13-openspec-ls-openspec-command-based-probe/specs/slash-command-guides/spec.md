## ADDED Requirements

### Requirement: OpenSpec readiness probe is command-based

Generated slash-command guides SHALL use `openspec list --json > /dev/null 2>&1` as the OpenSpec readiness probe and SHALL NOT use `ls openspec/`. Readiness SHALL be determined solely from the probe's exit code; the probe's stdout/stderr SHALL NOT be parsed by the slash-command guide.

#### Scenario: Generated guides render the command-based probe

- **WHEN** every generated slash-command markdown file in
  `global/commands/` that has a Prerequisites section is read
- **THEN** each SHALL contain the literal invocation
  `openspec list --json > /dev/null 2>&1`
- **AND** NONE SHALL contain the string `ls openspec/`

#### Scenario: No slash command parses probe stdout

- **WHEN** the Prerequisites block of any generated slash-command guide
  is read
- **THEN** it SHALL NOT document piping probe stdout into `jq`,
  `openspec` re-invocation, or any other JSON parser
- **AND** only the probe's exit status SHALL be used to branch

### Requirement: Probe failure is disambiguated into two normalized paths

When the readiness probe fails, the slash-command guide SHALL distinguish
two failure modes and emit the corresponding Japanese remediation copy:

- Exit status 127 (command not found) → header
  `"❌ openspec CLI が見つかりません。"` with remediation
  `specflow-install` を実行。
- Any other non-zero exit → header
  `"❌ OpenSpec が初期化されていません。"` with remediation
  `specflow-init` を実行。

Both paths SHALL end by instructing the user to re-run the current
slash command and SHALL terminate with `**STOP**`. The remediation copy
SHALL NOT instruct the user to hand-create `openspec/config.yaml`.

#### Scenario: Missing-CLI branch points to specflow-install

- **WHEN** any generated slash-command guide's Prerequisites block is
  read
- **THEN** it SHALL contain the string
  `❌ openspec CLI が見つかりません。`
- **AND** it SHALL contain `specflow-install` as the remediation for
  that branch

#### Scenario: Uninitialized-workspace branch points to specflow-init

- **WHEN** any generated slash-command guide's Prerequisites block is
  read
- **THEN** it SHALL contain the string
  `❌ OpenSpec が初期化されていません。`
- **AND** it SHALL contain `specflow-init` as the remediation for that
  branch

#### Scenario: No guide advises hand-creating openspec/config.yaml

- **WHEN** every generated slash-command guide is read
- **THEN** NONE SHALL contain the string `openspec/config.yaml を作成`
  or any equivalent instruction to hand-create the config file

### Requirement: Probe invocation is not wrapped in a wall-clock timeout

The readiness probe SHALL be invoked directly without wrapping in
`timeout(1)` or any other wall-clock limit. `openspec list --json`
targets local workspace files only; imposing a timeout would introduce
a dependency on coreutils and is explicitly out of scope.

#### Scenario: Generated guides do not wrap the probe in timeout

- **WHEN** every generated slash-command guide is read
- **THEN** NONE SHALL contain the string `timeout ` immediately
  preceding `openspec list --json`

### Requirement: specflow.decompose Prerequisites has a single probe block

The generated `specflow.decompose` slash-command guide SHALL contain
exactly one Prerequisites block documenting the readiness probe. The
duplicated block that previously documented both
`openspec/config.yaml` creation and `specflow-init` as separate
remediations SHALL be removed.

#### Scenario: specflow.decompose renders a single probe block

- **WHEN** generated `specflow.decompose.md` is read
- **THEN** it SHALL contain exactly one occurrence of
  `openspec list --json > /dev/null 2>&1`
- **AND** it SHALL NOT contain two separate Prerequisites sections
