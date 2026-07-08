import { describe, expect, it } from "vitest";

import { originAllowed } from "./security.js";

describe("originAllowed", () => {
	const cases: Array<[string, string, boolean]> = [
		["a valid 32-char a-p extension origin", `chrome-extension://${"a".repeat(32)}`, true],
		["a mixed valid-alphabet ID", `chrome-extension://${"abcdefghijklmnop".repeat(2)}`, true],
		["the literal string null", "null", false],
		["a 31-char ID", `chrome-extension://${"a".repeat(31)}`, false],
		["a 33-char ID", `chrome-extension://${"a".repeat(33)}`, false],
		["an ID with chars outside a-p", `chrome-extension://${"q".repeat(32)}`, false],
		["an uppercase ID", `chrome-extension://${"A".repeat(32)}`, false],
		["a trailing path", `chrome-extension://${"a".repeat(32)}/index.html`, false],
		["a moz-extension origin", `moz-extension://${"a".repeat(32)}`, false],
		["a prefixed valid-looking origin", `https://evil.example/chrome-extension://${"a".repeat(32)}`, false],
	];

	it.each(cases)("%s -> %s", (_name, origin, allowed) => {
		expect(originAllowed(origin)).toBe(allowed);
	});

	it("allows requests with no Origin header", () => {
		expect(originAllowed(undefined)).toBe(true);
	});
});
