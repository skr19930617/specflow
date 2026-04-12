function escapeRegex(value: string): string {
	return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function validateGlobPattern(pattern: string): void {
	if (pattern.includes("[") || pattern.includes("]")) {
		throw new Error("character classes are not supported");
	}
}

export function globToRegExp(pattern: string): RegExp {
	validateGlobPattern(pattern);
	let source = "^";
	for (let index = 0; index < pattern.length; index += 1) {
		const char = pattern[index];
		const next = pattern[index + 1];
		if (char === "*" && next === "*") {
			source += ".*";
			index += 1;
			continue;
		}
		if (char === "*") {
			source += "[^/]*";
			continue;
		}
		if (char === "?") {
			source += "[^/]";
			continue;
		}
		source += escapeRegex(char);
	}
	source += "$";
	return new RegExp(source);
}

export function matchesGlobPattern(value: string, pattern: string): boolean {
	return globToRegExp(pattern).test(value);
}
