import { describe, expect, it } from "vitest";

import { originAllowed } from "./security.js";

const PUBLISHED_EXTENSION_ID = "dbnmlcmmgnchigedlglfmchkendlcfgc";

describe("originAllowed", () => {
	const cases: Array<[string, string, boolean]> = [
		["the published extension origin", `chrome-extension://${PUBLISHED_EXTENSION_ID}`, true],
		["a different syntactically valid a-p extension origin", `chrome-extension://${"a".repeat(32)}`, false],
		["the literal string null", "null", false],
		["a 31-char ID", `chrome-extension://${PUBLISHED_EXTENSION_ID.slice(0, 31)}`, false],
		["a 33-char ID", `chrome-extension://${PUBLISHED_EXTENSION_ID}x`, false],
		["an uppercase ID", `chrome-extension://${PUBLISHED_EXTENSION_ID.toUpperCase()}`, false],
		["a trailing path", `chrome-extension://${PUBLISHED_EXTENSION_ID}/index.html`, false],
		["a moz-extension origin", `moz-extension://${PUBLISHED_EXTENSION_ID}`, false],
		["a prefixed valid-looking origin", `https://evil.example/chrome-extension://${PUBLISHED_EXTENSION_ID}`, false],
	];

	it.each(cases)("%s -> %s", (_name, origin, allowed) => {
		expect(originAllowed(origin)).toBe(allowed);
	});

	it("allows requests with no Origin header", () => {
		expect(originAllowed(undefined)).toBe(true);
	});
});
