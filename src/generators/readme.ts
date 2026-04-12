import { readFileSync } from "node:fs";
import { writeText } from "../lib/fs.js";
import { fromRepo } from "../lib/paths.js";

const beginMarker = "<!-- BEGIN GENERATED WORKFLOW DIAGRAM -->";
const endMarker = "<!-- END GENERATED WORKFLOW DIAGRAM -->";

export function renderReadmeWorkflowDiagram(block: string): void {
	const readmePath = fromRepo("README.md");
	const current = readFileSync(readmePath, "utf8");
	const start = current.indexOf(beginMarker);
	const end = current.indexOf(endMarker);
	if (start === -1 || end === -1 || end < start) {
		throw new Error("README workflow diagram markers are missing");
	}
	const before = current.slice(0, start);
	const after = current.slice(end + endMarker.length);
	writeText(readmePath, `${before}${block}${after}`);
}
