import { describe, expect, it } from "vitest";

import { parseDetectReply } from "./detect-reply.js";

const NONCE = "abc-123";
const good = JSON.stringify({ nonce: NONCE, framework: "react", components: ["SubmitButton", "App"] });

describe("parseDetectReply", () => {
	it("accepts a valid reply", () => {
		expect(parseDetectReply(good, NONCE)).toEqual({ framework: "react", components: ["SubmitButton", "App"] });
	});

	it("rejects a nonce mismatch", () => {
		expect(parseDetectReply(good, "other-nonce")).toBeNull();
	});

	it("rejects junk JSON and non-strings", () => {
		expect(parseDetectReply("{not json", NONCE)).toBeNull();
		expect(parseDetectReply({ nonce: NONCE }, NONCE)).toBeNull();
		expect(parseDetectReply(undefined, NONCE)).toBeNull();
	});

	it("rejects oversized chains and names", () => {
		const tooMany = JSON.stringify({ nonce: NONCE, framework: "react", components: ["A1", "B2", "C3", "D4", "E5", "F6"] });
		const tooLong = JSON.stringify({ nonce: NONCE, framework: "react", components: ["x".repeat(200)] });
		expect(parseDetectReply(tooMany, NONCE)).toBeNull();
		expect(parseDetectReply(tooLong, NONCE)).toBeNull();
	});

	it("rejects empty or non-string component entries and weird frameworks", () => {
		expect(parseDetectReply(JSON.stringify({ nonce: NONCE, framework: "react", components: [""] }), NONCE)).toBeNull();
		expect(parseDetectReply(JSON.stringify({ nonce: NONCE, framework: "react", components: [42] }), NONCE)).toBeNull();
		expect(parseDetectReply(JSON.stringify({ nonce: NONCE, framework: "x".repeat(64), components: ["App"] }), NONCE)).toBeNull();
	});
});
