import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// ── Types ──────────────────────────────────────────────────────────────

export type EcosystemId = "javascript" | "rust" | "go" | "python";
export type ToolchainId = string;

export interface DetectedEcosystem {
	readonly ecosystem: EcosystemId;
	readonly language: string;
	readonly toolchain: ToolchainId;
	readonly toolchainAmbiguous: boolean;
	readonly commands: {
		readonly build: string | null;
		readonly test: string | null;
		readonly lint: string | null;
		readonly format: string | null;
	};
	readonly directories: {
		readonly source: readonly string[] | null;
		readonly test: readonly string[] | null;
		readonly generated: readonly string[] | null;
	};
}

export type DetectionResult =
	| { readonly status: "detected"; readonly result: DetectedEcosystem }
	| {
			readonly status: "ambiguous-toolchain";
			readonly ecosystem: EcosystemId;
			readonly candidates: readonly ToolchainId[];
	  }
	| { readonly status: "out-of-scope"; readonly reason: string };

// ── Helpers ────────────────────────────────────────────────────────────

function fileExists(rootDir: string, name: string): boolean {
	return existsSync(join(rootDir, name));
}

function readTextOrNull(rootDir: string, name: string): string | null {
	const path = join(rootDir, name);
	if (!existsSync(path)) {
		return null;
	}
	try {
		return readFileSync(path, "utf8");
	} catch {
		return null;
	}
}

// ── Task 3.2: Primary indicator scanning ───────────────────────────────

interface PrimaryIndicator {
	readonly ecosystem: EcosystemId;
	readonly language: string;
}

function scanPrimaryIndicators(rootDir: string): readonly PrimaryIndicator[] {
	const indicators: PrimaryIndicator[] = [];

	if (fileExists(rootDir, "package.json")) {
		const content = readTextOrNull(rootDir, "package.json");
		const language = detectJsLanguage(rootDir, content);
		indicators.push({ ecosystem: "javascript", language });
	}

	if (fileExists(rootDir, "Cargo.toml")) {
		const content = readTextOrNull(rootDir, "Cargo.toml");
		if (content === null || !content.includes("[workspace]")) {
			indicators.push({ ecosystem: "rust", language: "rust" });
		}
	}

	if (fileExists(rootDir, "go.mod")) {
		indicators.push({ ecosystem: "go", language: "go" });
	}

	if (fileExists(rootDir, "pyproject.toml")) {
		indicators.push({ ecosystem: "python", language: "python" });
	}

	return indicators;
}

function detectJsLanguage(
	rootDir: string,
	packageJsonContent: string | null,
): string {
	if (fileExists(rootDir, "tsconfig.json")) {
		return "typescript";
	}
	if (packageJsonContent !== null) {
		try {
			const pkg = JSON.parse(packageJsonContent) as Record<string, unknown>;
			const devDeps = pkg.devDependencies as
				| Record<string, unknown>
				| undefined;
			if (devDeps && "typescript" in devDeps) {
				return "typescript";
			}
		} catch {
			// fall through to default
		}
	}
	return "javascript";
}

// ── Task 3.3: Conflict detection ───────────────────────────────────────

function detectConflicts(
	rootDir: string,
	indicators: readonly PrimaryIndicator[],
): string | null {
	if (indicators.length === 0) {
		return "No ecosystem indicators found";
	}

	const ecosystems = new Set(indicators.map((i) => i.ecosystem));
	if (ecosystems.size > 1) {
		const names = [...ecosystems].sort().join(", ");
		return `Multiple ecosystems detected: ${names}`;
	}

	if (fileExists(rootDir, "pnpm-workspace.yaml")) {
		return "Workspace detected: pnpm-workspace.yaml";
	}

	if (fileExists(rootDir, "lerna.json")) {
		return "Workspace detected: lerna.json";
	}

	if (fileExists(rootDir, "Cargo.toml")) {
		const content = readTextOrNull(rootDir, "Cargo.toml");
		if (content?.includes("[workspace]")) {
			return "Workspace detected: Cargo.toml [workspace]";
		}
	}

	return null;
}

// ── Task 3.4: Toolchain resolution ─────────────────────────────────────

type ToolchainResolved = {
	readonly status: "resolved";
	readonly toolchain: ToolchainId;
};
type ToolchainAmbiguous = {
	readonly status: "ambiguous";
	readonly candidates: readonly ToolchainId[];
};
type ToolchainResult = ToolchainResolved | ToolchainAmbiguous;

function resolveToolchain(
	rootDir: string,
	ecosystem: EcosystemId,
): ToolchainResult {
	switch (ecosystem) {
		case "javascript":
			return resolveJsToolchain(rootDir);
		case "rust":
			return { status: "resolved", toolchain: "cargo" };
		case "go":
			return { status: "resolved", toolchain: "go" };
		case "python":
			return resolvePythonToolchain(rootDir);
	}
}

function resolveJsToolchain(rootDir: string): ToolchainResult {
	const lockfiles: readonly (readonly [string, ToolchainId])[] = [
		["package-lock.json", "npm"],
		["pnpm-lock.yaml", "pnpm"],
		["yarn.lock", "yarn"],
		["bun.lockb", "bun"],
	];

	const found = lockfiles.filter(([file]) => fileExists(rootDir, file));

	if (found.length === 1) {
		return { status: "resolved", toolchain: found[0][1] };
	}

	if (found.length > 1) {
		return { status: "ambiguous", candidates: found.map(([, id]) => id) };
	}

	return { status: "resolved", toolchain: "npm" };
}

function resolvePythonToolchain(rootDir: string): ToolchainResult {
	if (fileExists(rootDir, "uv.lock")) {
		return { status: "resolved", toolchain: "uv" };
	}
	if (fileExists(rootDir, "poetry.lock")) {
		return { status: "resolved", toolchain: "poetry" };
	}
	return { status: "resolved", toolchain: "pip" };
}

// ── Task 3.5: Command detection ────────────────────────────────────────

interface Commands {
	readonly build: string | null;
	readonly test: string | null;
	readonly lint: string | null;
	readonly format: string | null;
}

function detectCommands(
	rootDir: string,
	ecosystem: EcosystemId,
	toolchain: ToolchainId,
): Commands {
	switch (ecosystem) {
		case "javascript":
			return detectJsCommands(rootDir, toolchain);
		case "rust":
			return detectRustCommands();
		case "go":
			return detectGoCommands();
		case "python":
			return detectPythonCommands(rootDir, toolchain);
	}
}

function detectJsCommands(rootDir: string, toolchain: ToolchainId): Commands {
	const content = readTextOrNull(rootDir, "package.json");
	if (content === null) {
		return fallbackToMakefile(rootDir);
	}

	let scripts: Record<string, unknown> = {};
	try {
		const pkg = JSON.parse(content) as Record<string, unknown>;
		scripts = (pkg.scripts as Record<string, unknown>) ?? {};
	} catch {
		return fallbackToMakefile(rootDir);
	}

	const runPrefix = toolchain === "npm" ? "npm run" : toolchain;
	const scriptCmd = (name: string): string | null =>
		typeof scripts[name] === "string" ? `${runPrefix} ${name}` : null;

	return applyMakefileFallback(rootDir, {
		build: scriptCmd("build"),
		test: scriptCmd("test"),
		lint: scriptCmd("lint"),
		format: scriptCmd("format"),
	});
}

function detectRustCommands(): Commands {
	return {
		build: "cargo build",
		test: "cargo test",
		lint: "cargo clippy",
		format: "cargo fmt",
	};
}

function detectGoCommands(): Commands {
	return {
		build: "go build ./...",
		test: "go test ./...",
		lint: null,
		format: "go fmt ./...",
	};
}

function detectPythonCommands(
	rootDir: string,
	toolchain: ToolchainId,
): Commands {
	const content = readTextOrNull(rootDir, "pyproject.toml");
	let testCmd: string | null = null;
	let lintCmd: string | null = null;
	let formatCmd: string | null = null;

	if (content !== null) {
		const prefix = toolchain === "uv" ? "uv run " : "";

		if (content.includes("[tool.pytest")) {
			testCmd = `${prefix}pytest`;
		}
		if (content.includes("[tool.ruff")) {
			lintCmd = `${prefix}ruff check .`;
			formatCmd = `${prefix}ruff format .`;
		}
		if (content.includes("[tool.black") && formatCmd === null) {
			formatCmd = `${prefix}black .`;
		}
	}

	return applyMakefileFallback(rootDir, {
		build: null,
		test: testCmd,
		lint: lintCmd,
		format: formatCmd,
	});
}

function fallbackToMakefile(rootDir: string): Commands {
	return applyMakefileFallback(rootDir, {
		build: null,
		test: null,
		lint: null,
		format: null,
	});
}

function applyMakefileFallback(rootDir: string, commands: Commands): Commands {
	const content = readTextOrNull(rootDir, "Makefile");
	if (content === null) {
		return commands;
	}

	const targets = parseMakefileTargets(content);
	const makeCmd = (name: keyof Commands): string | null =>
		commands[name] ?? (targets.has(name) ? `make ${name}` : null);

	return {
		build: makeCmd("build"),
		test: makeCmd("test"),
		lint: makeCmd("lint"),
		format: makeCmd("format"),
	};
}

function parseMakefileTargets(content: string): ReadonlySet<string> {
	const targets = new Set<string>();
	for (const line of content.split("\n")) {
		const match = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):/);
		if (match) {
			targets.add(match[1]);
		}
	}
	return targets;
}

// ── Task 3.6: Directory detection ──────────────────────────────────────

interface Directories {
	readonly source: readonly string[] | null;
	readonly test: readonly string[] | null;
	readonly generated: readonly string[] | null;
}

function detectDirectories(rootDir: string): Directories {
	const sourceCandidates = ["src", "lib"];
	const testCandidates = ["test", "tests", "__tests__"];
	const generatedCandidates = ["dist", "build", "target"];

	const source = filterExistingDirs(rootDir, sourceCandidates);
	const test = filterExistingDirs(rootDir, testCandidates);
	const generated = filterExistingDirs(rootDir, generatedCandidates);

	return {
		source: source.length > 0 ? source : null,
		test: test.length > 0 ? test : null,
		generated: generated.length > 0 ? generated : null,
	};
}

function filterExistingDirs(
	rootDir: string,
	candidates: readonly string[],
): readonly string[] {
	return candidates.filter((dir) => {
		const path = join(rootDir, dir);
		if (!existsSync(path)) {
			return false;
		}
		try {
			return statSync(path).isDirectory();
		} catch {
			return false;
		}
	});
}

// ── Task 3.1: Main detection function ──────────────────────────────────

export function detectEcosystem(rootDir: string): DetectionResult {
	const indicators = scanPrimaryIndicators(rootDir);

	const conflict = detectConflicts(rootDir, indicators);
	if (conflict !== null) {
		return { status: "out-of-scope", reason: conflict };
	}

	const indicator = indicators[0];
	const toolchainResult = resolveToolchain(rootDir, indicator.ecosystem);

	if (toolchainResult.status === "ambiguous") {
		return {
			status: "ambiguous-toolchain",
			ecosystem: indicator.ecosystem,
			candidates: toolchainResult.candidates,
		};
	}

	const commands = detectCommands(
		rootDir,
		indicator.ecosystem,
		toolchainResult.toolchain,
	);

	const directories = detectDirectories(rootDir);

	return {
		status: "detected",
		result: {
			ecosystem: indicator.ecosystem,
			language: indicator.language,
			toolchain: toolchainResult.toolchain,
			toolchainAmbiguous: false,
			commands,
			directories,
		},
	};
}
