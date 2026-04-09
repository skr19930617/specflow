---
description: プロジェクト解析に基づいて OSS 風 README を生成・更新
---
## User Input

```text
$ARGUMENTS
```

## Prerequisites

1. Run `which specflow-analyze` via Bash to confirm `specflow-analyze` is installed.
   - If missing:
     ```
     ❌ `specflow-analyze` が見つかりません。
     `specflow-install` を実行してパスを通してください。
     ```
     → **STOP**.

## Step 1: Analyze Project

Run via Bash:
```bash
specflow-analyze .
```

If the command fails (non-zero exit), display the error and **STOP**.

Store the JSON output as `ANALYZE_RESULT`.

Report:
```
Step 1: Project analyzed
  Languages: <languages>
  Frameworks: <frameworks>
  Package Manager: <package_manager>
```

## Step 2: Generate README

Using `ANALYZE_RESULT`, generate the README following these rules:

### Grounding Policy (Source-of-Truth)

Each section and badge MUST be backed by evidence from `ANALYZE_RESULT`. If evidence is insufficient, OMIT the section (do not guess).

**Exception: Template sections** — Contributing may use a generic template when no CONTRIBUTING.md exists.

### Section-Evidence Requirements

| Section | Required Evidence | No Evidence → |
|---------|------------------|---------------|
| Badges (tech stack) | `languages` / `frameworks` | Omit |
| Badges (license) | `license` | Omit |
| Badges (CI) | `ci.provider` + `ci.workflows` | Omit |
| Overview | `description` or `existing_readme` | Project name only + placeholder |
| Features | `openspec.specs` or `keywords` | Omit |
| Installation | `package_manager` + `scripts` | Omit |
| Usage | `bin_entries` + `scripts` | Omit |
| Configuration | `config_files` | Omit |
| Architecture | `openspec.specs` (2+) or `file_structure` | Omit |
| Contributing | `contributing` | Generic template |
| License | `license` | Omit |

### Badge Rules

**Static badges** (tech stack, license):
- Use shields.io static badge URLs
- Example: `https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white`

**Dynamic badges** (CI):
- **GitHub Actions**: Use actual workflow filename: `https://img.shields.io/github/actions/workflow/status/{owner}/{repo}/{workflow_name}{extension}`
- **GitLab CI**: `https://img.shields.io/gitlab/pipeline-status/{owner}%2F{repo}`
- Other CI: Omit
- Requires `git_remote.owner` and `git_remote.repo`; omit if missing

### Emoji Section Headings

Use emoji prefixes for section headings:
- `✨ Features`
- `📦 Installation`
- `🚀 Usage`
- `⚙️ Configuration`
- `🏗️ Architecture`
- `🤝 Contributing`
- `📄 License`

### Existing README Merge Strategy

Check `ANALYZE_RESULT.existing_readme`:

**If null (no existing README):**
- Generate a complete new README
- Display the generated README to the user

**If non-null (existing README):**

Apply the merge strategy:

0. **Preamble handling**: Content before the first `##` heading (H1 title, badge row, overview paragraph) is treated as a special "preamble" merge unit. The preamble is always classified as **Improve** — regenerate title, badges, and overview from evidence while preserving any non-standard content as protected blocks.
1. Split the rest of existing README by `##` headings into sections
2. Classify each section using the Section-Evidence table:
   - **Improve**: Section heading matches an entry in the table AND evidence exists → regenerate
   - **Preserve**: Section heading does NOT match any entry → keep verbatim
3. Within "Improve" sections, classify content blocks:
   - **Generate target**: Content that can be derived from evidence (install commands, badge URLs, etc.)
   - **Protected block**: Everything else (notes, caveats, subsections not matching evidence). When ambiguous, classify as protected (conservative approach).
4. For each "Improve" section: generate new content, then append protected blocks in original order
5. Insert "Preserve" sections in their original positions
6. Add new sections (evidence exists but no existing heading) at appropriate positions

**CRITICAL**: Preserve sections and protected blocks MUST be kept VERBATIM — do not modify a single character.

## Step 3: Review and Approve

**New README (no existing):**
- Display the full generated README
- Use `AskUserQuestion` with options: "適用" / "再生成" / "キャンセル"

**Updated README (existing):**
- Display the full diff between existing and generated README (no line limit)
- Use `AskUserQuestion` with options: "適用" / "再生成" / "キャンセル"

On "適用": Write the README to `README.md` via Write tool. Report: `README.md updated`
On "再生成": Ask for feedback, add to prompt context, and re-run Step 2
On "キャンセル": Report: `Cancelled. No changes made.`

## Important Rules

- Use the git repository root as the base for all paths
- All evidence must come from `specflow-analyze` output — do not read additional files
- Never generate content without evidence (except template sections)
- Protected blocks and preserve sections are VERBATIM — zero modifications
- When evidence is ambiguous, omit rather than guess
