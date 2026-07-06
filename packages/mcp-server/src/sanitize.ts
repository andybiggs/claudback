// Control and invisible-direction characters are stripped at ingest so comment
// text can't smuggle terminal escapes or bidi-reordering tricks into Claude's
// context. Newline (0x0A), carriage return (0x0D), and tab (0x09) are kept —
// they're legitimate in comment text.
const DISALLOWED_RANGES: Array<[number, number]> = [
	[0x0000, 0x0008],
	[0x000b, 0x000c],
	[0x000e, 0x001f],
	[0x007f, 0x009f],
	[0x061c, 0x061c],
	[0x200b, 0x200f],
	[0x202a, 0x202e],
	[0x2060, 0x2064],
	[0x2066, 0x2069],
	[0xfeff, 0xfeff],
];

const DISALLOWED_CHARS = new RegExp(
	`[${DISALLOWED_RANGES.map(([from, to]) => `\\u{${from.toString(16)}}-\\u{${to.toString(16)}}`).join("")}]`,
	"gu",
);

export function sanitizeText(value: string): string {
	return value.replace(DISALLOWED_CHARS, "");
}
