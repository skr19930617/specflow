# Research: add-readme-command

## 既存コード解析

### specflow-install (bin/specflow-install)
- `bin/specflow-*` パターンで全スクリプトを `~/bin` にシンボリックリンク
- 新規スクリプト `bin/specflow-analyze` を追加すれば自動でリンクされる
- 変更不要（既存のワイルドカードパターンで対応済み）

### specflow.setup.md (global/commands/specflow.setup.md)
- 既に tech stack 検出ロジックが定義されている（package.json, tsconfig.json, pyproject.toml, Cargo.toml, go.mod, Gemfile, *.csproj, build.gradle, pom.xml）
- `specflow-analyze` はこの検出パターンを bash で再実装する

### slash コマンドフォーマット
- `global/commands/specflow.*.md` 形式
- frontmatter に `description` フィールド
- `## User Input` + `$ARGUMENTS` でユーザー入力を受け取る
- Bash / Read / Write ツールを使った手順記述

## Tech Stack 検出方法

### パッケージマニフェスト → 言語/フレームワーク検出
| ファイル | 言語 | 追加情報 |
|---------|------|---------|
| `package.json` | JavaScript/TypeScript | dependencies, scripts, bin, description, packageManager |
| `tsconfig.json` | TypeScript | - |
| `Cargo.toml` | Rust | [package] name, description, [dependencies] |
| `go.mod` | Go | module name |
| `pyproject.toml` | Python | [project] description, dependencies |
| `requirements.txt` | Python | - |
| `Gemfile` | Ruby | - |
| `build.gradle` / `build.gradle.kts` | Java/Kotlin | - |
| `pom.xml` | Java | - |
| `*.csproj` / `*.sln` | C#/.NET | - |
| `composer.json` | PHP | - |

### lockfile → パッケージマネージャ検出
| lockfile | パッケージマネージャ |
|---------|-------------------|
| `package-lock.json` | npm |
| `yarn.lock` | yarn |
| `pnpm-lock.yaml` | pnpm |
| `bun.lockb` / `bun.lock` | bun |
| `Cargo.lock` | cargo |
| `go.sum` | go |
| `Pipfile.lock` | pipenv |
| `poetry.lock` | poetry |
| `Gemfile.lock` | bundler |
| `composer.lock` | composer |

### CI 設定検出
| パス | CI プロバイダ |
|-----|-------------|
| `.github/workflows/*.yml` / `.yaml` | GitHub Actions |
| `.gitlab-ci.yml` | GitLab CI |
| `.circleci/config.yml` | CircleCI |
| `Jenkinsfile` | Jenkins |
| `.travis.yml` | Travis CI |

## specflow-analyze JSON 出力スキーマ案

```json
{
  "project_name": "string",
  "description": "string or null",
  "languages": ["TypeScript", "JavaScript"],
  "frameworks": ["React", "Next.js"],
  "package_manager": "pnpm",
  "build_tools": ["vite"],
  "test_tools": ["vitest"],
  "ci": {
    "provider": "github-actions",
    "workflows": ["ci.yml"]
  },
  "license": "MIT",
  "git_remote": {
    "owner": "skr19930617",
    "repo": "specflow",
    "url": "https://github.com/skr19930617/specflow"
  },
  "openspec": {
    "has_config": true,
    "specs_count": 3,
    "changes_count": 2,
    "context": "Tech stack: bash, TypeScript..."
  },
  "existing_readme": "string or null",
  "file_structure": "tree output",
  "bin_entries": ["specflow-init", "specflow-analyze"],
  "scripts": { "build": "...", "test": "..." }
}
```

## specflow-install への影響

**変更不要**。`bin/specflow-install` は `for script in "$REPO_ROOT/bin"/specflow-*` パターンでシンボリックリンクを作成するため、`bin/specflow-analyze` を追加するだけで自動的にインストールされる。
