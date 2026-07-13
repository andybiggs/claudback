import { afterEach, describe, expect, it } from "vitest";

import { originAllowed } from "./security.js";

const PUBLISHED_ORIGIN = "chrome-extension://dbnmlcmmgnchigedlglfmchkendlcfgc";
const DEV_ID = "abcdefghijklmnopabcdefghijklmnop";

describe("originAllowed", () => {
	afterEach(() => {
		delete process.env.CLAUDBACK_DEV_EXTENSION_ID;
	});

	const cases: Array<[string, string, boolean]> = [
		["the published extension origin", PUBLISHED_ORIGIN, true],
		["a different syntactically valid extension origin", `chrome-extension://${"a".repeat(32)}`, false],
		["the literal string null", "null", false],
		["the published ID with a trailing path", `${PUBLISHED_ORIGIN}/index.html`, false],
		["an uppercase variant of the published ID", PUBLISHED_ORIGIN.toUpperCase(), false],
		["a moz-extension origin with the published ID", "moz-extension://dbnmlcmmgnchigedlglfmchkendlcfgc", false],
		["a prefixed valid-looking origin", `https://evil.example/${PUBLISHED_ORIGIN}`, false],
	];

	it.each(cases)("%s -> %s", (_name, origin, allowed) => {
		expect(originAllowed(origin)).toBe(allowed);
	});

	it("allows requests with no Origin header", () => {
		expect(originAllowed(undefined)).toBe(true);
	});

	it("allows a dev extension ID opted in via CLAUDBACK_DEV_EXTENSION_ID", () => {
		process.env.CLAUDBACK_DEV_EXTENSION_ID = DEV_ID;
		expect(originAllowed(`chrome-extension://${DEV_ID}`)).toBe(true);
		expect(originAllowed(PUBLISHED_ORIGIN)).toBe(true);
	});

	it("ignores a malformed CLAUDBACK_DEV_EXTENSION_ID", () => {
		process.env.CLAUDBACK_DEV_EXTENSION_ID = "not-a-valid-id";
		expect(originAllowed("chrome-extension://not-a-valid-id")).toBe(false);
	});
});
