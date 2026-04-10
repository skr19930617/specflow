import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const coverageSummaryPath = resolve(
	process.cwd(),
	"coverage/coverage-summary.json",
);
const badgePath = resolve(process.cwd(), "badges/coverage.json");

function badgeColor(percent) {
	if (percent >= 90) {
		return "brightgreen";
	}
	if (percent >= 80) {
		return "green";
	}
	if (percent >= 70) {
		return "yellowgreen";
	}
	if (percent >= 60) {
		return "yellow";
	}
	if (percent >= 50) {
		return "orange";
	}
	return "red";
}

const summary = JSON.parse(readFileSync(coverageSummaryPath, "utf8"));
const percent = summary?.total?.lines?.pct;

if (typeof percent !== "number" || Number.isNaN(percent)) {
	throw new Error(
		`Line coverage percentage was not found in ${coverageSummaryPath}`,
	);
}

const rounded = Number(percent.toFixed(1));
const badge = {
	schemaVersion: 1,
	label: "coverage",
	message: `${rounded}%`,
	color: badgeColor(rounded),
};

mkdirSync(dirname(badgePath), { recursive: true });
writeFileSync(badgePath, `${JSON.stringify(badge, null, "\t")}\n`, "utf8");
