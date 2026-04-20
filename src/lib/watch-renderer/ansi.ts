// Minimal 16-color ANSI helpers. Keeping this tiny and colocated avoids a
// dependency on `chalk` and the rest of the npm color ecosystem.

export const RESET = "\x1b[0m";
export const BOLD = "\x1b[1m";
export const DIM = "\x1b[2m";
export const INVERSE = "\x1b[7m";

export const FG_BLACK = "\x1b[30m";
export const FG_RED = "\x1b[31m";
export const FG_GREEN = "\x1b[32m";
export const FG_YELLOW = "\x1b[33m";
export const FG_BLUE = "\x1b[34m";
export const FG_MAGENTA = "\x1b[35m";
export const FG_CYAN = "\x1b[36m";
export const FG_WHITE = "\x1b[37m";

export const ALT_SCREEN_ENTER = "\x1b[?1049h";
export const ALT_SCREEN_LEAVE = "\x1b[?1049l";
export const CURSOR_HIDE = "\x1b[?25l";
export const CURSOR_SHOW = "\x1b[?25h";
export const CLEAR_SCREEN = "\x1b[2J";
export const CURSOR_HOME = "\x1b[H";

export function moveTo(row: number, col: number): string {
	// Rows and cols are 1-based in ANSI.
	return `\x1b[${row};${col}H`;
}

export function clearLineFromCursor(): string {
	return "\x1b[K";
}

export function color(text: string, ...codes: readonly string[]): string {
	if (codes.length === 0) return text;
	return `${codes.join("")}${text}${RESET}`;
}

// `\x1b` is the ANSI CSI introducer. Building the regex via `RegExp()` from
// a string literal avoids Biome's `noControlCharactersInRegex` rule while
// keeping the matcher readable.
const ESC = String.fromCharCode(27);
const ANSI_CSI_PATTERN = new RegExp(`${ESC}\\[[0-9;?]*[A-Za-z]`, "g");

/**
 * Strip ANSI escape sequences — used by layout code that needs to measure
 * visible width. Unit tests also use it to assert plain-text content.
 */
export function stripAnsi(s: string): string {
	return s.replace(ANSI_CSI_PATTERN, "");
}

/** Visible width of a string (printable, no ANSI). ASCII only; one cell per char. */
export function visibleWidth(s: string): number {
	return stripAnsi(s).length;
}

/** Pad the visible portion of `s` to `width` columns with spaces. */
export function padEndVisible(s: string, width: number): string {
	const w = visibleWidth(s);
	if (w >= width) return s;
	return s + " ".repeat(width - w);
}

/** Truncate the visible portion of `s` to at most `max` columns. */
export function truncateVisible(s: string, max: number): string {
	const w = visibleWidth(s);
	if (w <= max) return s;
	// ASCII-only: remove trailing chars (including ANSI tails) conservatively
	// by stripping ANSI then truncating.
	const plain = stripAnsi(s);
	if (max <= 1) return plain.slice(0, max);
	return `${plain.slice(0, Math.max(0, max - 1))}…`;
}
