## ADDED Requirements

### Requirement: Design generation prompt SHALL request planning-oriented sections

The prompt contract used for design generation SHALL include instructions that request the 7 mandatory planning sections defined by `design-planning-contract`. The prompt SHALL enumerate the section headings and describe, for each section, the minimum information the design author or generation agent is expected to provide.

The prompt SHALL instruct the generation agent to:
- Include all 7 planning section headings in the generated `design.md`
- Write "N/A" with a brief justification for sections that do not apply to the change
- Structure concern descriptions at a granularity suitable for bundle extraction
- Express dependency direction between concerns, not just that a relationship exists
- Reference specific artifacts or observable conditions in completion conditions

#### Scenario: Design generation prompt includes planning section instructions

- **WHEN** the design generation prompt is rendered from its contract
- **THEN** the rendered prompt SHALL contain instructions for all 7 mandatory planning section headings: Concerns, State / Lifecycle, Contracts / Interfaces, Persistence / Ownership, Integration Points, Ordering / Dependency Notes, Completion Conditions

#### Scenario: Design generation prompt describes minimum content per section

- **WHEN** the design generation prompt is rendered
- **THEN** for each mandatory planning section, the prompt SHALL describe the minimum expected information (e.g., "list user-facing concerns and the problem each resolves" for Concerns)

#### Scenario: Design generation prompt instructs N/A handling

- **WHEN** the design generation prompt is rendered
- **THEN** the prompt SHALL include an instruction to write "N/A" with justification for non-applicable sections rather than omitting the heading
