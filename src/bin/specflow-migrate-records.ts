import { runMigration } from "../lib/migrate-records.js";

function main(): void {
	const args = process.argv.slice(2);
	let mode: "forward" | "undo" = "forward";
	let all = false;
	const runIds: string[] = [];
	for (let i = 0; i < args.length; i += 1) {
		const a = args[i];
		if (a === "--undo") {
			mode = "undo";
		} else if (a === "--all") {
			all = true;
		} else if (a === "--run") {
			const v = args[i + 1];
			if (!v) {
				process.stderr.write("Missing value for --run\n");
				process.exit(1);
			}
			runIds.push(v);
			i += 1;
		} else if (a === "-h" || a === "--help") {
			usage();
			process.exit(0);
		} else {
			process.stderr.write(`Unknown argument: ${a}\n`);
			usage();
			process.exit(1);
		}
	}

	if (!all && runIds.length === 0) {
		usage();
		process.exit(1);
	}

	const root = process.cwd();
	const result = runMigration(root, {
		mode,
		runIds: all ? undefined : runIds,
	});
	process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

	const hasError = result.perRun.some((r) => r.status === "error");
	process.exit(hasError ? 1 : 0);
}

function usage(): void {
	process.stderr.write(
		"Usage: specflow-migrate-records [--all | --run <run-id> ...] [--undo]\n",
	);
}

main();
