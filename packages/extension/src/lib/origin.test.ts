import { describe, expect, it } from "vitest";

import { originMatches } from "./origin.js";

describe("originMatches", () => {
	it("matches a same-origin reload or navigation", () => {
		expect(originMatches("https://example.com/deep/path?q=1", "https://example.com/*")).toBe(true);
	});

	it("rejects a different origin", () => {
		expect(originMatches("https://evil.com/", "https://example.com/*")).toBe(false);
	});

	it("rejects a scheme change on the same host", () => {
		expect(originMatches("http://example.com/", "https://example.com/*")).toBe(false);
	});

	it("rejects a port change on the same host", () => {
		expect(originMatches("https://example.com:8443/", "https://example.com/*")).toBe(false);
	});

	it("fails closed on URLs with no usable origin", () => {
		expect(originMatches("about:blank", "https://example.com/*")).toBe(false);
		expect(originMatches("chrome://newtab/", "https://example.com/*")).toBe(false);
	});

	it("fails closed on malformed URLs", () => {
		expect(originMatches("not a url", "https://example.com/*")).toBe(false);
	});
});
