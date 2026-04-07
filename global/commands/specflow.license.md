---
description: プロジェクト解析に基づいてライセンスファイルを生成
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

2. Run `which gh` via Bash to confirm `gh` CLI is installed.
   - If missing:
     ```
     ❌ `gh` CLI が見つかりません。
     `brew install gh && gh auth login` を実行してください。
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
  Existing License: <license or "none">
```

## Step 2: Existing License Check

### 2a: LICENSE file check

If `ANALYZE_RESULT.license` is non-null:
- Display: `"既存の LICENSE ファイルが検出されました: <license>"`
- Use `AskUserQuestion` with options: "上書きする" / "キャンセル"
- On "キャンセル": Display `"キャンセルしました。"` → **STOP**.
- On "上書きする": Continue.

### 2b: Manifest license reference info

Check each manifest file via Read tool (skip silently if file does not exist):
- `package.json` — look for `"license"` field
- `Cargo.toml` — look for `license` in `[package]`
- `pyproject.toml` — look for `license` in `[project]`

If any manifest has a license field, display:
```
参考: マニフェストの既存 license フィールド:
  - <filename>: <value>
```

Store any found manifest license values as `MANIFEST_LICENSE_INFO` for display in Step 3.

## Step 3: Display License Options

Display the license comparison table:

```
## 対応ライセンス一覧

| ライセンス | 種類 | 説明 |
|-----------|------|------|
| MIT | 寛容系 | 商用利用可、改変可、再配布可。著作権表示のみ必須 |
| Apache 2.0 | 寛容系 | 特許権の明示的許諾。商標の保護 |
| BSD 2-Clause | 寛容系 | MIT に近い。条件が2つだけ |
| ISC | 寛容系 | MIT/BSD と同等で最も短い。Node.js エコシステムで一般的 |
| GPL 3.0 | コピーレフト | 派生物も同じライセンスで公開が必要 |
| AGPL 3.0 | コピーレフト | SaaS でも公開義務あり |
| Unlicense | パブリックドメイン | 一切の制約なし |
```

If `MANIFEST_LICENSE_INFO` exists, remind the user:
```
※ マニフェストの既存 license: <values>
```

## Step 4: Recommend and Select License

### 4a: Determine recommendation

Apply the following rules in priority order (first match wins):

1. If `ANALYZE_RESULT.package_manager` == `"npm"` OR `ANALYZE_RESULT.languages` contains `"JavaScript"` or `"TypeScript"`:
   - Recommend: **MIT** — "npm エコシステムで最も一般的なライセンスです"
   - Recommended category: 寛容系

2. If `ANALYZE_RESULT.languages` contains `"Rust"`:
   - Recommend: **MIT または Apache 2.0** — "Rust エコシステムでは MIT または Apache 2.0 が一般的です（デュアルライセンスは本コマンドのスコープ外）"
   - Recommended category: 寛容系

3. If `ANALYZE_RESULT.languages` contains `"Go"`:
   - Recommend: **BSD 2-Clause** — "Go 標準ライブラリと同じライセンスです"
   - Recommended category: 寛容系

4. If `ANALYZE_RESULT.frameworks` is non-empty:
   - Recommend: **MIT** — "ライブラリ/フレームワーク依存プロジェクトに最適です"
   - Recommended category: 寛容系

5. Default:
   - Recommend: **MIT** — "最も広く採用されている OSS ライセンスです"
   - Recommended category: 寛容系

Display the recommendation:
```
おすすめ: <recommended license> — <reason>
```

### 4b: Stage 1 — Category Selection

Use `AskUserQuestion` with 3 options. Mark the recommended category with (Recommended):

- "寛容系ライセンス (Recommended)" — MIT, Apache 2.0, BSD 2-Clause, ISC (description: "商用利用可、最も自由度が高い")
- "コピーレフト系ライセンス" — GPL 3.0, AGPL 3.0 (description: "派生物も同じライセンスで公開が必要")
- "パブリックドメイン" — Unlicense (description: "一切の制約なし")

(Adjust Recommended marker based on the recommendation logic above. Default is 寛容系.)

Store the user's selection as `SELECTED_CATEGORY`.

### 4c: Stage 2 — Individual License Selection

Based on `SELECTED_CATEGORY`:

**If 寛容系:**
Use `AskUserQuestion` with 4 options:
- "MIT" (description: "最も寛容。著作権表示のみ必須")
- "Apache 2.0" (description: "特許権の明示的許諾。エンタープライズ向け")
- "BSD 2-Clause" (description: "MIT に近い。条件2つだけ")
- "ISC" (description: "MIT/BSD 同等で最も短い")

Mark recommended license with (Recommended). For Rust projects, mark MIT as (Recommended) and note Apache 2.0 as an alternative in the description.

**If コピーレフト系:**
Use `AskUserQuestion` with 2 options:
- "GPL 3.0" (description: "派生物も同じライセンスで公開が必要")
- "AGPL 3.0" (description: "ネットワーク越しの使用にも適用")

**If パブリックドメイン:**
Use `AskUserQuestion` with 2 options:
- "Unlicense" (description: "パブリックドメイン相当。一切の制約なし")
- "戻る" (description: "カテゴリ選択に戻る")

On "戻る": Re-run Stage 1 (Step 4b).

Store the user's selection as `SELECTED_LICENSE`.

### 4d: Resolve license metadata

Map `SELECTED_LICENSE` to its metadata:

| Selection | GitHub API ID | SPDX ID |
|-----------|---------------|---------|
| MIT | `mit` | `MIT` |
| Apache 2.0 | `apache-2.0` | `Apache-2.0` |
| BSD 2-Clause | `bsd-2-clause` | `BSD-2-Clause` |
| ISC | `isc` | `ISC` |
| GPL 3.0 | `gpl-3.0` | `GPL-3.0-only` |
| AGPL 3.0 | `agpl-3.0` | `AGPL-3.0-only` |
| Unlicense | `unlicense` | `Unlicense` |

Store `API_ID` and `SPDX_ID`.

## Step 5: Get Author Name and Year

### 5a: Get year

Run via Bash:
```bash
date +%Y
```
Store as `YEAR`.

### 5b: Get author name

Run via Bash:
```bash
git config user.name
```

If the output is non-empty, store as `AUTHOR_NAME`.

If the output is empty or the command fails:
1. Use `AskUserQuestion` (no options — free-text input mode) with question:
   ```
   LICENSE ファイルに記載する著者名を入力してください。
   例: git config user.name "Your Name" で設定すると次回から自動取得されます。
   ```
2. If the user enters a non-empty value, store as `AUTHOR_NAME`.
3. If the user enters empty text, retry (up to 3 attempts total).
4. After 3 empty attempts OR if the user cancels/dismisses:
   - Set `AUTHOR_NAME` = `<AUTHOR>`
   - Display: `"⚠ 著者名が未設定のため <AUTHOR> プレースホルダーを使用しました。LICENSE ファイル内の <AUTHOR> を手動で置換してください"`

## Step 6: Fetch License Text

Run via Bash:
```bash
gh api /licenses/<API_ID> --jq '.body'
```

If the command fails (non-zero exit or empty output):
- Display: `"❌ GitHub Licenses API からのライセンス取得に失敗しました。ネットワーク接続と gh auth status を確認してください。"`
- Use `AskUserQuestion` with options: "リトライ" / "キャンセル"
- On "リトライ": Re-run the command.
- On "キャンセル": **STOP**.

Store the output as `LICENSE_BODY`.

### Placeholder substitution

If `LICENSE_BODY` contains `[year]`, replace all occurrences with `YEAR`.
If `LICENSE_BODY` contains `[fullname]`, replace all occurrences with `AUTHOR_NAME`.

Store the result as `LICENSE_TEXT`.

## Step 7: Write LICENSE File

Write `LICENSE_TEXT` to `LICENSE` at the project root via Write tool.

Report:
```
Step 7: LICENSE ファイルを生成しました
  ライセンス: <SELECTED_LICENSE> (<SPDX_ID>)
  著者: <AUTHOR_NAME>
  年: <YEAR>
```

## Step 8: Update Manifest Files

For each manifest file, apply the following logic:

### 8a: package.json

1. Attempt to Read `package.json`. If file does not exist → skip silently.
2. Check if file contains a `"license"` field.
3. If `"license"` field exists:
   - If the value equals `SPDX_ID` → skip (display: `"package.json: license は既に <SPDX_ID> です。スキップ"`)
   - If the value differs → Use `AskUserQuestion` with options: "上書きする" / "スキップ"
     - On "スキップ" → skip
     - On "上書きする" → Edit the `"license"` field to `SPDX_ID`
4. If `"license"` field does not exist:
   - Edit to add `"license": "<SPDX_ID>"` after the `"name"` field (or at top level).
5. Report what was done.

### 8b: Cargo.toml

1. Attempt to Read `Cargo.toml`. If file does not exist → skip silently.
2. Check if file contains `[package]` table.
   - If `[package]` does not exist → skip (display: `"Cargo.toml: [package] テーブルが見つかりません。スキップ"`)
3. Check if `[package]` contains `license` field.
4. If `license` field exists:
   - If the value equals `SPDX_ID` → skip
   - If the value differs → Use `AskUserQuestion` with options: "上書きする" / "スキップ"
     - On "スキップ" → skip
     - On "上書きする" → Edit the `license` field to `SPDX_ID`
5. If `license` field does not exist:
   - Edit to add `license = "<SPDX_ID>"` in the `[package]` section.
6. Report what was done.

### 8c: pyproject.toml

1. Attempt to Read `pyproject.toml`. If file does not exist → skip silently.
2. Check if file contains `[project]` table.
   - If `[project]` does not exist → skip (display: `"pyproject.toml: [project] テーブルが見つかりません。スキップ"`)
3. Check if `[project]` contains `license` field.
4. If `license` field exists:
   - If it is a table form (e.g., `license = {text = "..."}` or `license = {file = "..."}`) → skip + display: `"⚠ pyproject.toml の license フィールドがレガシー形式のためスキップしました"`
   - If it is a string form and equals `SPDX_ID` → skip
   - If it is a string form and differs → Use `AskUserQuestion` with options: "上書きする" / "スキップ"
     - On "スキップ" → skip
     - On "上書きする" → Edit the `license` field to `SPDX_ID`
5. If `license` field does not exist:
   - Edit to add `license = "<SPDX_ID>"` in the `[project]` section.
6. Report what was done.

## Step 9: Report Results

Display a summary:

```
✅ ライセンス生成完了

  ライセンス: <SELECTED_LICENSE> (<SPDX_ID>)
  ファイル: LICENSE
  著者: <AUTHOR_NAME>
  年: <YEAR>

  マニフェスト更新:
  - package.json: <updated / skipped / not found>
  - Cargo.toml: <updated / skipped / not found>
  - pyproject.toml: <updated / skipped / not found>
```

If `AUTHOR_NAME` is `<AUTHOR>`, append:
```
⚠ LICENSE ファイル内の <AUTHOR> を手動で置換してください
```

## Verification Checklist

Manual verification scenarios:

- [ ] New project (no LICENSE, no manifests) → recommend MIT, generate LICENSE
- [ ] Existing LICENSE → overwrite confirmation, then generate
- [ ] Existing LICENSE → cancel overwrite → command stops, no changes
- [ ] Node.js project → MIT recommendation
- [ ] Rust project → MIT recommendation (Apache 2.0 noted as alternative)
- [ ] Go project → BSD 2-Clause recommendation
- [ ] Author name from git config → embedded in LICENSE
- [ ] Author name missing → free-text prompt → embedded
- [ ] Author name missing → 3 empty retries → `<AUTHOR>` placeholder + warning
- [ ] Author name missing → cancel → `<AUTHOR>` placeholder + warning
- [ ] GitHub API failure → retry prompt
- [ ] package.json exists, same license → skip
- [ ] package.json exists, different license → overwrite confirmation
- [ ] Cargo.toml exists, no [package] → skip
- [ ] pyproject.toml exists, legacy table form → skip + warning
- [ ] pyproject.toml exists, string form, different → overwrite confirmation

## Important Rules

- Use the git repository root (`git rev-parse --show-toplevel`) as the base for all paths
- All evidence for recommendations must come from `specflow-analyze` output
- Never modify manifests that do not exist — only update existing files
- When the user cancels at the existing LICENSE check, stop the entire command
- When the user cancels LICENSE overwrite, also skip all manifest updates
