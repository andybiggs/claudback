import { describe, expect, it } from "vitest";
import {
	COMMENT_TEXT_MAX_LENGTH,
	HTML_EXCERPT_MAX_LENGTH,
} from "./constants.js";
import { commentSchema, newCommentInputSchema, storeSchema } from "./schema.js";

function validComment() {
	return {
		id: "550e8400-e29b-41d4-a716-446655440000",
		text: "This button is hard to find.",
		origin: "https://example.com",
		url: "https://example.com/page",
		selector: "#submit-button",
		tag: "button",
		textSnippet: "Submit",
		htmlExcerpt: "<button>Submit</button>",
		rect: { x: 1, y: 2, width: 3, height: 4 },
		viewport: { width: 1280, height: 800 },
		resolved: false,
		createdAt: "2026-07-06T00:00:00.000Z",
		updatedAt: "2026-07-06T00:00:00.000Z",
	};
}

function validNewCommentInput() {
	return {
		text: "This button is hard to find.",
		origin: "https://example.com",
		url: "https://example.com/page",
		selector: "#submit-button",
		tag: "button",
		textSnippet: "Submit",
		htmlExcerpt: "<button>Submit</button>",
		rect: { x: 1, y: 2, width: 3, height: 4 },
		viewport: { width: 1280, height: 800 },
	};
}

describe("commentSchema", () => {
	it("round-trips a valid comment", () => {
		const input = validComment();
		const result = commentSchema.parse(input);

		expect(result).toEqual(input);
	});

	it("rejects text over the max length", () => {
		const input = { ...validComment(), text: "a".repeat(COMMENT_TEXT_MAX_LENGTH + 1) };

		expect(() => commentSchema.parse(input)).toThrow();
	});

	it("rejects htmlExcerpt over the max length", () => {
		const input = {
			...validComment(),
			htmlExcerpt: "a".repeat(HTML_EXCERPT_MAX_LENGTH + 1),
		};

		expect(() => commentSchema.parse(input)).toThrow();
	});

	it("rejects empty text", () => {
		const input = { ...validComment(), text: "" };

		expect(() => commentSchema.parse(input)).toThrow();
	});

	it("defaults resolved to false when missing", () => {
		const input = validComment() as Record<string, unknown>;
		delete input.resolved;

		const result = commentSchema.parse(input);

		expect(result.resolved).toBe(false);
	});
});

describe("newCommentInputSchema", () => {
	it("accepts a realistic extension payload", () => {
		const input = validNewCommentInput();
		const result = newCommentInputSchema.parse(input);

		expect(result).toEqual(input);
	});

	it("rejects an oversized payload", () => {
		const input = {
			...validNewCommentInput(),
			text: "a".repeat(COMMENT_TEXT_MAX_LENGTH + 1),
		};

		expect(() => newCommentInputSchema.parse(input)).toThrow();
	});
});

describe("storeSchema", () => {
	it("defaults mode to clear when missing", () => {
		const result = storeSchema.parse({});

		expect(result.mode).toBe("clear");
	});

	it("parses an unrecognised mode value as clear", () => {
		const result = storeSchema.parse({ mode: "banana" });

		expect(result.mode).toBe("clear");
	});

	it("preserves mode keep", () => {
		const result = storeSchema.parse({ mode: "keep" });

		expect(result.mode).toBe("keep");
	});

	it("defaults comments to an empty array when missing", () => {
		const result = storeSchema.parse({});

		expect(result.comments).toEqual([]);
	});
});
