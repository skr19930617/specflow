import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { matchesGlobPattern } from "../lib/glob.js";
import { tryGit } from "../lib/git.js";
import { tryParseJson } from "../lib/json.js";
import { printSchemaJson, tryExec } from "../lib/process.js";
import type { AnalyzeProjectResult } from "../types/contracts.js";

function readTextIfExists(path: string): string {
	return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function listRootMatches(cwd: string, patterns: readonly string[]): string[] {
	const entries = readdirSync(cwd);
	return entries
		.filter((entry) =>
			patterns.some((pattern) => matchesGlobPattern(entry, pattern)),
		)
		.sort();
}

function detectPackageManager(cwd: string): string | null {
	const mapping: [string, string][] = [
		["pnpm-lock.yaml", "pnpm"],
		["yarn.lock", "yarn"],
		["bun.lockb", "bun"],
		["bun.lock", "bun"],
		["package-lock.json", "npm"],
		["Cargo.lock", "cargo"],
		["go.sum", "go"],
		["poetry.lock", "poetry"],
		["Pipfile.lock", "pipenv"],
		["Gemfile.lock", "bundler"],
		["composer.lock", "composer"],
	];
	for (const [file, manager] of mapping) {
		if (existsSync(resolve(cwd, file))) {
			return manager;
		}
	}
	return null;
}

function unique(values: readonly string[]): string[] {
	return [...new Set(values.filter(Boolean))].sort((left, right) =>
		left.localeCompare(right),
	);
}

function repoInfo(cwd: string) {
	const result = tryGit(["remote", "get-url", "origin"], cwd);
	if (result.status !== 0 || !result.stdout.trim()) {
		return { owner: null, repo: null, url: null };
	}
	const url = result.stdout.trim();
	const https = url.match(/^https?:\/\/[^/]+\/([^/]+)\/([^/]+?)(?:\.git)?$/);
	if (https) {
		return { owner: https[1], repo: https[2], url };
	}
	const ssh = url.match(/:([^/]+)\/([^/]+?)(?:\.git)?$/);
	if (ssh) {
		return { owner: ssh[1], repo: ssh[2], url };
	}
	return { owner: null, repo: null, url };
}

function ciInfo(cwd: string) {
	if (existsSync(resolve(cwd, ".github/workflows"))) {
		const workflows = readdirSync(resolve(cwd, ".github/workflows"))
			.filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"))
			.sort()
			.map((file) => ({
				name: file.replace(/\.(yml|yaml)$/, ""),
				extension: `.${file.split(".").pop()}`,
			}));
		return {
			provider: "github-actions",
			workflows,
		};
	}
	if (existsSync(resolve(cwd, ".gitlab-ci.yml"))) {
		return { provider: "gitlab-ci", workflows: [] };
	}
	if (existsSync(resolve(cwd, ".circleci/config.yml"))) {
		return { provider: "circleci", workflows: [] };
	}
	return { provider: null, workflows: [] };
}

function detectLicense(cwd: string): string | null {
	const file = readdirSync(cwd).find((entry) => entry.startsWith("LICENSE"));
	if (!file) {
		return null;
	}
	const head = readFileSync(resolve(cwd, file), "utf8")
		.split("\n")
		.slice(0, 5)
		.join("\n");
	if (head.includes("MIT License") || head.includes("MIT")) {
		return "MIT";
	}
	if (head.includes("Apache License")) {
		return "Apache-2.0";
	}
	if (head.includes("GNU General Public License")) {
		return "GPL-3.0";
	}
	if (head.includes("BSD 2-Clause")) {
		return "BSD-2-Clause";
	}
	if (head.includes("BSD 3-Clause")) {
		return "BSD-3-Clause";
	}
	if (head.includes("ISC License")) {
		return "ISC";
	}
	if (head.includes("Mozilla Public License")) {
		return "MPL-2.0";
	}
	return "other";
}

function openspecInfo(cwd: string) {
	const configPath = resolve(cwd, "openspec/config.yaml");
	if (!existsSync(configPath)) {
		return {
			has_config: false,
			project_name: null,
			context: null,
			specs: [],
			active_changes: [],
		};
	}

	const content = readFileSync(configPath, "utf8");
	const name = content.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? null;
	let context: string | null = null;
	const contextBlock = content.match(/^context:\s*[|>]\s*\n((?: {2}.*\n?)*)/m);
	if (contextBlock) {
		context =
			contextBlock[1]
				.split("\n")
				.map((line) => line.replace(/^ {2}/, ""))
				.join("\n")
				.trim() || null;
	} else {
		context = content.match(/^context:\s*(.+)$/m)?.[1]?.trim() ?? null;
	}

	const specs = existsSync(resolve(cwd, "openspec/specs"))
		? readdirSync(resolve(cwd, "openspec/specs"), { withFileTypes: true })
				.filter((entry) => entry.isDirectory())
				.map((entry) => entry.name)
				.sort()
		: [];
	const activeChanges = existsSync(resolve(cwd, "openspec/changes"))
		? readdirSync(resolve(cwd, "openspec/changes"), { withFileTypes: true })
				.filter((entry) => entry.isDirectory())
				.map((entry) => entry.name)
				.sort()
		: [];

	return {
		has_config: true,
		project_name: name,
		context,
		specs,
		active_changes: activeChanges,
	};
}

function fileStructure(cwd: string): string {
	const tree = tryExec("tree", ["-L", "2", "--gitignore", "-I", ".git"], cwd);
	if (tree.status === 0 && tree.stdout.trim()) {
		return tree.stdout.trimEnd();
	}
	const entries: string[] = [];
	const walk = (dir: string, depth: number): void => {
		if (depth > 2) {
			return;
		}
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const fullPath = join(dir, entry.name);
			const relativePath = fullPath.replace(`${cwd}/`, "./");
			if (relativePath === ".git" || relativePath.startsWith("./.git/")) {
				continue;
			}
			entries.push(relativePath === cwd ? "." : relativePath);
			if (entry.isDirectory()) {
				walk(fullPath, depth + 1);
			}
		}
	};
	walk(cwd, 1);
	return entries.sort().join("\n");
}

function main(): void {
	const root = resolve(process.argv[2] ?? ".");
	if (!existsSync(root) || !statSync(root).isDirectory()) {
		throw new Error(`Path not found: ${root}`);
	}
	const projectName = basename(root);
	const repo = repoInfo(root);
	const ci = ciInfo(root);
	const openspec = openspecInfo(root);
	const existingReadme = readTextIfExists(resolve(root, "README.md")) || null;
	const contributing =
		readTextIfExists(resolve(root, "CONTRIBUTING.md")) || null;

	const languages: string[] = [];
	const frameworks: string[] = [];
	const buildTools: string[] = [];
	const testTools: string[] = [];
	const binEntries: string[] = [];
	let description: string | null = null;
	let packageManager: string | null = null;
	let scripts: Record<string, unknown> = {};
	let keywords: string[] = [];

	const packageJsonPath = resolve(root, "package.json");
	if (existsSync(packageJsonPath)) {
		languages.push("JavaScript");
		if (existsSync(resolve(root, "tsconfig.json"))) {
			languages.push("TypeScript");
		}
		const packageJson =
			tryParseJson<Record<string, unknown>>(
				readFileSync(packageJsonPath, "utf8"),
			) ?? {};
		description =
			typeof packageJson.description === "string"
				? packageJson.description
				: null;
		scripts =
			typeof packageJson.scripts === "object" && packageJson.scripts
				? (packageJson.scripts as Record<string, unknown>)
				: {};
		const deps = {
			...((packageJson.dependencies as Record<string, unknown> | undefined) ??
				{}),
			...((packageJson.devDependencies as
				| Record<string, unknown>
				| undefined) ?? {}),
		};
		for (const dep of Object.keys(deps)) {
			switch (dep) {
				case "react":
					frameworks.push("React");
					break;
				case "next":
					frameworks.push("Next.js");
					break;
				case "vue":
					frameworks.push("Vue.js");
					break;
				case "nuxt":
					frameworks.push("Nuxt");
					break;
				case "svelte":
					frameworks.push("Svelte");
					break;
				case "express":
					frameworks.push("Express");
					break;
				case "fastify":
					frameworks.push("Fastify");
					break;
				case "vite":
					buildTools.push("vite");
					break;
				case "webpack":
					buildTools.push("webpack");
					break;
				case "esbuild":
					buildTools.push("esbuild");
					break;
				case "rollup":
					buildTools.push("rollup");
					break;
				case "vitest":
					testTools.push("vitest");
					break;
				case "jest":
					testTools.push("jest");
					break;
				case "mocha":
					testTools.push("mocha");
					break;
				case "playwright":
				case "@playwright/test":
					testTools.push("playwright");
					break;
				default:
					if (dep === "nestjs" || dep.startsWith("@nestjs/")) {
						frameworks.push("NestJS");
					}
			}
		}
		if (
			packageJson.packageManager &&
			typeof packageJson.packageManager === "string"
		) {
			packageManager = packageJson.packageManager.split("@")[0] || null;
		}
		const bin = packageJson.bin;
		if (typeof bin === "string") {
			binEntries.push(bin);
		} else if (bin && typeof bin === "object") {
			binEntries.push(...Object.keys(bin as Record<string, unknown>));
		}
		if (Array.isArray(packageJson.keywords)) {
			keywords = packageJson.keywords.map((value) => String(value));
		}
	}

	if (existsSync(resolve(root, "Cargo.toml"))) {
		languages.push("Rust");
	}
	if (existsSync(resolve(root, "go.mod"))) {
		languages.push("Go");
	}
	if (
		existsSync(resolve(root, "pyproject.toml")) ||
		existsSync(resolve(root, "requirements.txt"))
	) {
		languages.push("Python");
	}
	if (existsSync(resolve(root, "Gemfile"))) {
		languages.push("Ruby");
	}
	if (
		existsSync(resolve(root, "build.gradle")) ||
		existsSync(resolve(root, "pom.xml"))
	) {
		languages.push("Java");
	}
	if (existsSync(resolve(root, "build.gradle.kts"))) {
		languages.push("Java", "Kotlin");
	}
	if (existsSync(resolve(root, "composer.json"))) {
		languages.push("PHP");
	}
	if (existsSync(resolve(root, "bin"))) {
		for (const entry of readdirSync(resolve(root, "bin"))) {
			const fullPath = resolve(root, "bin", entry);
			if (!statSync(fullPath).isFile()) {
				continue;
			}
			const head = readFileSync(fullPath, "utf8").split("\n")[0] ?? "";
			if (/bash|sh/.test(head)) {
				languages.push("Bash");
				binEntries.push(entry);
			}
		}
	}

	packageManager ||= detectPackageManager(root);

	const configFiles = listRootMatches(root, [
		".env.example",
		".env.sample",
		".editorconfig",
		"biome.json",
		".eslintrc*",
		".prettierrc*",
		"prettier.config.*",
		"tsconfig.json",
		"jest.config.*",
		"vitest.config.*",
		"vite.config.*",
		"webpack.config.*",
		"rollup.config.*",
		"next.config.*",
		"nuxt.config.*",
	]);

	printSchemaJson("analyze-project", {
		project_name: projectName,
		description,
		languages: unique(languages),
		frameworks: unique(frameworks),
		package_manager: packageManager,
		build_tools: unique(buildTools),
		test_tools: unique(testTools),
		ci,
		license: detectLicense(root),
		git_remote: repo,
		openspec,
		existing_readme: existingReadme,
		file_structure: fileStructure(root),
		bin_entries: unique(binEntries),
		scripts,
		config_files: configFiles,
		contributing,
		keywords: unique(keywords),
	} satisfies AnalyzeProjectResult);
}

main();
