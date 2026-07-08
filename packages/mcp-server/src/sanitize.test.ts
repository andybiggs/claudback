import { describe, expect, it } from "vitest";

import { sanitizeText } from "./sanitize.js";

describe("sanitizeText", () => {
	it("strips bidi embedding and override controls (U+202A-U+202E)", () => {
		expect(sanitizeText("a\u202Ab\u202Bc\u202Cd\u202De\u202Ef")).toBe("abcdef");
	});

	it("strips bidi isolate controls (U+2066-U+2069)", () => {
		expect(sanitizeText("a\u2066b\u2067c\u2068d\u2069e")).toBe("abcde");
	});

	it("strips zero-width characters (U+200B-U+200F)", () => {
		expect(sanitizeText("a\u200Bb\u200Cc\u200Dd\u200Ee\u200Ff")).toBe("abcdef");
	});

	it("strips the BOM (U+FEFF)", () => {
		expect(sanitizeText("\uFEFFhello")).toBe("hello");
	});

	it("strips ESC (U+001B) so terminal escapes are defanged", () => {
		expect(sanitizeText("a\u001B[31mred")).toBe("a[31mred");
	});

	it("strips the C1 range (U+0080-U+009F)", () => {
		expect(sanitizeText("a\u0080b\u0090c\u009Fd")).toBe("abcd");
	});

	it("preserves newline, carriage return, and tab", () => {
		expect(sanitizeText("a\nb\rc\td")).toBe("a\nb\rc\td");
	});

	it("keeps multi-line comment text intact", () => {
		const text = "line one\nline two\n\tindented line three";

		expect(sanitizeText(text)).toBe(text);
	});
});
