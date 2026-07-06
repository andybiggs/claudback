import { describe, expect, it } from "vitest";

import { HTML_EXCERPT_MAX_LENGTH } from "@claudback/shared";

import { excerptFromNames } from "./excerpt.js";

describe("excerptFromNames", () => {
	it("keeps tag and attribute names but strips values", () => {
		const excerpt = excerptFromNames("BUTTON", ["class", "data-user-token", "id"]);

		expect(excerpt).toBe("<button class data-user-token id>");
	});

	it("never includes an attribute value", () => {
		// getAttributeNames() only ever yields names, but assert the invariant
		// so a future change that passes "name=value" pairs is caught.
		const excerpt = excerptFromNames("input", ["value"]);

		expect(excerpt).toBe("<input value>");
		expect(excerpt).not.toContain("=");
	});

	it("sorts attribute names for stable output", () => {
		expect(excerptFromNames("div", ["z-attr", "a-attr"])).toBe("<div a-attr z-attr>");
	});

	it("caps length to the shared excerpt limit", () => {
		const many = Array.from({ length: 2000 }, (_, i) => `attr${i}`);
		const excerpt = excerptFromNames("div", many);

		expect(excerpt.length).toBeLessThanOrEqual(HTML_EXCERPT_MAX_LENGTH);
	});
});
