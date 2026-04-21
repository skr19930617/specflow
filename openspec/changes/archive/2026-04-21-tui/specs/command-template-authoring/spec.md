## ADDED Requirements

### Requirement: Fenced bash/sh blocks in templates reject positional-arg placeholders

The template resolver SHALL fail the build if any `.md.tmpl` file under
`assets/commands/` contains an unescaped positional-arg placeholder inside
a fenced `bash` or `sh` code block. The rule exists because Claude Code's
slash-command renderer substitutes positional-arg placeholders at
invocation time, so any inline shell helper that references them will
silently collapse to empty strings before the LLM executes the shell.

The rule SHALL be a strict literal match:

- Any line inside a fenced block whose language tag is `bash` or `sh` that
  contains a substring matching the regex `\$[0-9]\b|\$ARGUMENTS\b` SHALL
  cause a build error.
- The error message SHALL identify the template file path, the 1-based
  line number, and the offending token (for example, `$1` or `$ARGUMENTS`).

Explicitly allowed forms (not considered violations):

- Backslash-escaped forms: `\$1`, `\$2`, ..., `\$9`, `\$ARGUMENTS`.
- Brace-delimited forms: `${1}`, `${2}`, ..., `${9}`, `${ARGUMENTS}`.
- Two-or-more-digit references: `$10`, `$11`, etc. (not positional args in
  the Claude Code renderer).
- Any occurrence inside a fenced block whose language tag is NOT `bash` or
  `sh` — for example, `$ARGUMENTS` inside a `\`\`\`text\` block remains
  permitted because every command template uses that pattern to render the
  user-input placeholder.
- Any occurrence in plain prose outside fenced code blocks.

Fenced code blocks with no language tag SHALL be treated as NOT covered by
this rule (authors SHOULD annotate the language tag to opt in).

#### Scenario: $1 inside fenced bash block fails the build

- **WHEN** a template file at `assets/commands/foo.md.tmpl` contains a
  line `local x="$1"` inside a `\`\`\`bash` fenced block
- **THEN** the build SHALL fail with an error that includes
  `assets/commands/foo.md.tmpl`, the line number, and the token `$1`

#### Scenario: $ARGUMENTS inside fenced sh block fails the build

- **WHEN** a template file contains `printf '%s' "$ARGUMENTS"` inside a
  `\`\`\`sh` fenced block
- **THEN** the build SHALL fail with an error that includes the template
  path, the line number, and the token `$ARGUMENTS`

#### Scenario: $ARGUMENTS inside fenced text block is allowed

- **WHEN** a template file contains `\`\`\`text\n$ARGUMENTS\n\`\`\``
  (the canonical user-input placeholder pattern)
- **THEN** the build SHALL NOT fail on this construct

#### Scenario: Escaped \$1 inside fenced bash block is allowed

- **WHEN** a template file contains `local x="\$1"` inside a `\`\`\`bash`
  block
- **THEN** the build SHALL NOT fail on the literal `\$1`

#### Scenario: ${1} brace form inside fenced bash block is allowed

- **WHEN** a template file contains `local x="${1}"` inside a `\`\`\`bash`
  block
- **THEN** the build SHALL NOT fail on the `${1}` form

#### Scenario: $10 inside fenced bash block is allowed

- **WHEN** a template file contains a `$10` reference inside a `\`\`\`bash`
  block
- **THEN** the build SHALL NOT fail, because `$10` is not a single-digit
  positional-arg placeholder
