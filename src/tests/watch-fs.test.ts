import assert from "node:assert/strict";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { watchPaths } from "../lib/watch-fs.js";
import { makeTempDir, removeTempDir } from "./test-helpers.js";

function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
	return new Promise((resolve, reject) => {
		const start = Date.now();
		const tick = () => {
			if (predicate()) return resolve();
			if (Date.now() - start > timeoutMs) {
				return reject(
					new Error(`predicate not satisfied within ${timeoutMs} ms`),
				);
			}
			setTimeout(tick, 30);
		};
		tick();
	});
}

test("watchPaths: fires on modification of an existing file (debounced)", async () => {
	const root = makeTempDir("watch-fs-modify-");
	try {
		const p = join(root, "a.txt");
		writeFileSync(p, "one", "utf8");
		let count = 0;
		const sub = watchPaths([p], {
			onChange: () => {
				count++;
			},
			debounceMs: 40,
			pollIntervalMs: 150,
		});
		try {
			writeFileSync(p, "two", "utf8");
			writeFileSync(p, "three", "utf8");
			await waitFor(() => count >= 1, 3000);
			assert.ok(count >= 1, `expected at least 1 change, got ${count}`);
		} finally {
			sub.dispose();
		}
	} finally {
		removeTempDir(root);
	}
});

test("watchPaths: detects file creation via parent directory watch + poll", async () => {
	const root = makeTempDir("watch-fs-create-");
	try {
		const p = join(root, "b.txt");
		let count = 0;
		const sub = watchPaths([p], {
			onChange: () => {
				count++;
			},
			debounceMs: 40,
			pollIntervalMs: 150,
		});
		try {
			writeFileSync(p, "hello", "utf8");
			await waitFor(() => count >= 1, 3000);
			assert.ok(count >= 1, "expected change after file creation");
		} finally {
			sub.dispose();
		}
	} finally {
		removeTempDir(root);
	}
});

test("watchPaths: detects atomic-replace via rename", async () => {
	const root = makeTempDir("watch-fs-rename-");
	try {
		const p = join(root, "c.txt");
		const tmp = join(root, "c.txt.tmp");
		writeFileSync(p, "original", "utf8");
		let count = 0;
		const sub = watchPaths([p], {
			onChange: () => {
				count++;
			},
			debounceMs: 40,
			pollIntervalMs: 150,
		});
		try {
			writeFileSync(tmp, "replacement", "utf8");
			renameSync(tmp, p);
			await waitFor(() => count >= 1, 3000);
		} finally {
			sub.dispose();
		}
	} finally {
		removeTempDir(root);
	}
});

test("watchPaths: detects deletion via poll", async () => {
	const root = makeTempDir("watch-fs-delete-");
	try {
		const p = join(root, "d.txt");
		writeFileSync(p, "x", "utf8");
		let count = 0;
		const sub = watchPaths([p], {
			onChange: () => {
				count++;
			},
			debounceMs: 40,
			pollIntervalMs: 150,
		});
		try {
			rmSync(p);
			await waitFor(() => count >= 1, 3000);
		} finally {
			sub.dispose();
		}
	} finally {
		removeTempDir(root);
	}
});

test("watchPaths: dispose cancels future notifications", async () => {
	const root = makeTempDir("watch-fs-dispose-");
	try {
		const p = join(root, "e.txt");
		writeFileSync(p, "a", "utf8");
		let count = 0;
		const sub = watchPaths([p], {
			onChange: () => {
				count++;
			},
			debounceMs: 40,
			pollIntervalMs: 150,
		});
		writeFileSync(p, "b", "utf8");
		await waitFor(() => count >= 1, 3000);
		const snapshot = count;
		sub.dispose();
		for (let i = 0; i < 5; i++) writeFileSync(p, `c${i}`, "utf8");
		await new Promise((r) => setTimeout(r, 350));
		assert.equal(count, snapshot, "no callbacks should fire after dispose");
	} finally {
		removeTempDir(root);
	}
});

test("watchPaths: debounces bursts into a single callback", async () => {
	const root = makeTempDir("watch-fs-debounce-");
	try {
		const p = join(root, "f.txt");
		writeFileSync(p, "0", "utf8");
		let count = 0;
		const sub = watchPaths([p], {
			onChange: () => {
				count++;
			},
			debounceMs: 120,
			pollIntervalMs: 0,
		});
		try {
			for (let i = 1; i <= 10; i++) writeFileSync(p, String(i), "utf8");
			await new Promise((r) => setTimeout(r, 300));
			assert.ok(count <= 2, `expected debounce <= 2 callbacks, got ${count}`);
			assert.ok(count >= 1, `expected at least one callback, got ${count}`);
		} finally {
			sub.dispose();
		}
	} finally {
		removeTempDir(root);
	}
});

test("watchPaths: multiple paths in the same dir each trigger a redraw", async () => {
	const root = makeTempDir("watch-fs-multi-");
	try {
		const a = join(root, "a.txt");
		const b = join(root, "b.txt");
		writeFileSync(a, "a0", "utf8");
		writeFileSync(b, "b0", "utf8");
		let count = 0;
		const sub = watchPaths([a, b], {
			onChange: () => {
				count++;
			},
			debounceMs: 50,
			pollIntervalMs: 150,
		});
		try {
			writeFileSync(a, "a1", "utf8");
			await waitFor(() => count >= 1, 3000);
			const afterA = count;
			await new Promise((r) => setTimeout(r, 200));
			writeFileSync(b, "b1", "utf8");
			await waitFor(() => count > afterA, 3000);
		} finally {
			sub.dispose();
		}
	} finally {
		removeTempDir(root);
	}
});
