import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { NewCommentInput } from "@claudback/shared";

import { createPairingManager } from "./pairing.js";
import { createStore } from "./store.js";
import type { StoreApi } from "./store-api.js";
import {
	clearCommentsHandler,
	getCommentsHandler,
	getPairingCodeHandler,
	listOriginsHandler,
	resolveCommentHandler,
} from "./tools.js";

function newCommentInput(overrides: Partial<NewCommentInput> = {}): NewCommentInput {
	return {
		origin: "https://example.com",
		url: "https://example.com/page",
		selector: "#main",
		tag: "div",
		text: "This is confusing feedback",
		textSnippet: "snippet",
		htmlExcerpt: "<div>",
		rect: null,
		viewport: null,
		...overrides,
	};
}

describe("tools", () => {
	let dir: string;
	let store: StoreApi;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "claudback-tools-"));
		store = createStore(join(dir, "comments.json"));
	});

	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	describe("get_comments", () => {
		it("output contains the untrusted-data framing and the comment text", async () => {
			await store.addComment(newCommentInput({ text: "This is confusing feedback" }));

			const result = await getCommentsHandler(store, {});
			const text = result.content[0].text;

			expect(text).toContain("UNTRUSTED user-authored");
			expect(text).toContain("This is confusing feedback");
		});

		it("still returns an envelope when there are zero comments", async () => {
			const result = await getCommentsHandler(store, {});
			const text = result.content[0].text;

			expect(text).toContain("UNTRUSTED user-authored");
			expect(text).toContain("Store mode: clear (0 comments)");
		});

		it("consume=true in clear mode empties the store", async () => {
			await store.addComment(newCommentInput());

			const result = await getCommentsHandler(store, { consume: true });

			expect(result.content[0].text).toContain("This is confusing feedback");
			expect(await store.getComments()).toHaveLength(0);
		});

		it("consume=true in keep mode leaves comments flagged resolved", async () => {
			await store.setMode("keep");
			await store.addComment(newCommentInput());

			await getCommentsHandler(store, { consume: true });

			const remaining = await store.getComments();

			expect(remaining).toHaveLength(1);
			expect(remaining[0].resolved).toBe(true);
		});
	});

	describe("list_origins", () => {
		it("lists origins with counts", async () => {
			await store.addComment(newCommentInput({ origin: "https://a.com" }));
			await store.addComment(newCommentInput({ origin: "https://b.com" }));

			const result = await listOriginsHandler(store);
			const parsed = JSON.parse(result.content[0].text) as Array<{ origin: string }>;

			expect(parsed.map((o) => o.origin)).toEqual(["https://a.com", "https://b.com"]);
		});
	});

	describe("resolve_comment", () => {
		it("reports removed in clear mode", async () => {
			const added = await store.addComment(newCommentInput());

			const result = await resolveCommentHandler(store, { id: added.id });

			expect(result.content[0].text).toContain("removed");
		});

		it("reports resolved in keep mode", async () => {
			await store.setMode("keep");
			const added = await store.addComment(newCommentInput());

			const result = await resolveCommentHandler(store, { id: added.id });

			expect(result.content[0].text).toContain("resolved");
		});

		it("reports not found for a missing id", async () => {
			const result = await resolveCommentHandler(store, { id: "missing-id" });

			expect(result.content[0].text).toContain("not found");
		});
	});

	describe("get_pairing_code", () => {
		const TOKEN = "a".repeat(64);

		it("returns a formatted code, mentions the TTL, and never leaks the token", async () => {
			const pairing = createPairingManager(TOKEN, { delayMs: 0 });
			const result = await getPairingCodeHandler(pairing);
			const text = result.content[0].text;

			expect(text).toMatch(/[A-Z2-9]{4}-[A-Z2-9]{4}/);
			expect(text).toContain("10 minutes");
			expect(text).not.toContain(TOKEN);
		});

		it("returns a code that actually exchanges for the token", async () => {
			const pairing = createPairingManager(TOKEN, { delayMs: 0 });
			const result = await getPairingCodeHandler(pairing);
			const code = result.content[0].text.match(/[A-Z2-9]{4}-[A-Z2-9]{4}/)?.[0];

			expect(code).toBeTruthy();
			expect(await pairing.exchange(code as string)).toBe(TOKEN);
		});
	});

	describe("clear_comments", () => {
		it("reports the number removed", async () => {
			await store.addComment(newCommentInput({ origin: "https://a.com" }));
			await store.addComment(newCommentInput({ origin: "https://b.com" }));

			const result = await clearCommentsHandler(store, {});

			expect(result.content[0].text).toBe("Removed 2 comment(s).");
		});

		it("scopes removal to an origin", async () => {
			await store.addComment(newCommentInput({ origin: "https://a.com" }));
			await store.addComment(newCommentInput({ origin: "https://b.com" }));

			const result = await clearCommentsHandler(store, { origin: "https://a.com" });

			expect(result.content[0].text).toBe("Removed 1 comment(s).");
			expect(await store.getComments()).toHaveLength(1);
		});
	});
});
