import {
	chmodSync,
	copyFileSync,
	cpSync,
	mkdirSync,
	readFileSync,
	renameSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";

export function ensureDir(path: string): void {
	mkdirSync(path, { recursive: true });
}

export function writeText(path: string, content: string): void {
	ensureDir(dirname(path));
	writeFileSync(path, content, "utf8");
}

export function atomicWriteText(path: string, content: string): void {
	ensureDir(dirname(path));
	const tempPath = join(
		dirname(path),
		`.${basename(path)}.${process.pid}.${Date.now()}.tmp`,
	);
	writeFileSync(tempPath, content, "utf8");
	renameSync(tempPath, path);
}

export function readText(path: string): string {
	return readFileSync(path, "utf8");
}

export function copyPath(sourcePath: string, targetPath: string): void {
	const sourceStat = statSync(sourcePath);
	ensureDir(dirname(targetPath));
	if (sourceStat.isDirectory()) {
		cpSync(sourcePath, targetPath, { recursive: true, force: true });
		return;
	}
	copyFileSync(sourcePath, targetPath);
}

export function setExecutable(path: string): void {
	const currentMode = statSync(path).mode;
	chmodSync(path, currentMode | 0o755);
}
