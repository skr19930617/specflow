import assert from "node:assert/strict";
import test from "node:test";
import { tryExec } from "../lib/process.js";

test("tryExec delivers stdin input to the child process", () => {
	// Regression test for:
	//   https://github.com/skr19930617/specflow/issues/122
	// When `stdin` is provided, stdio[0] must be "pipe" so Node actually
	// forwards the `input` option to the child. With stdio[0] = "ignore"
	// the input is silently dropped and stdin-driven CLIs (e.g. `claude -p`)
	// fail with exit 1.
	const payload = "hello-from-tryExec";
	const result = tryExec(
		"node",
		[
			"-e",
			"let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>process.stdout.write(d));",
		],
		process.cwd(),
		process.env,
		payload,
	);
	assert.equal(result.status, 0, `stderr: ${result.stderr}`);
	assert.equal(result.stdout, payload);
});

test("tryExec ignores stdin when not supplied", () => {
	// When no stdin is supplied the child should still run normally and
	// receive an empty stdin (stdio[0] = "ignore"), not hang.
	const result = tryExec(
		"node",
		["-e", "process.stdout.write('no-stdin')"],
		process.cwd(),
	);
	assert.equal(result.status, 0, `stderr: ${result.stderr}`);
	assert.equal(result.stdout, "no-stdin");
});
