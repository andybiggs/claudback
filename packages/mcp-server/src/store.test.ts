import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { NewCommentInput } from "@claudback/shared";

import { createStore } from "./store.js";

function newCommentInput(overrides: Partial<NewCommentInput> = {}): NewCommentInput {
	return {
		origin: "https://example.com",
		url: "https://example.com/page",
		selector: "#main > button",
		tag: "button",
		text: "This button is confusing",
		textSnippet: "Submit",
		htmlExcerpt: "<button>",
		rect: null,
		viewport: null,
		...overrides,
	};
}

describe("store", () => {
	let dir: string;
	let filePath: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "claudback-store-"));
		filePath = join(dir, "nested", "comments.json");
	});

	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it("returns an empty store when the file is missing", async () => {
		const store = createStore(filePath);

		expect(await store.read()).toEqual({ mode: "clear", comments: [] });
	});

	it("returns an empty store when the file has corrupt JSON", async () => {
		await writeFileWithMkdir(filePath, "{ not json");
		const store = createStore(filePath);

		expect(await store.read()).toEqual({ mode: "clear", comments: [] });
	});

	it("returns an empty store when the JSON fails schema validation", async () => {
		await writeFileWithMkdir(filePath, JSON.stringify({ mode: "clear", comments: [{ nope: true }] }));
		const store = createStore(filePath);

		expect(await store.read()).toEqual({ mode: "clear", comments: [] });
	});

	it("preserves a corrupt store file as .corrupt-* instead of overwriting it", async () => {
		const corruptContent = "{ not json";

		await writeFileWithMkdir(filePath, corruptContent);

		const store = createStore(filePath);

		await store.addComment(newCommentInput());

		const { readdir } = await import("node:fs/promises");
		const { dirname, basename } = await import("node:path");
		const entries = await readdir(dirname(filePath));
		const corruptFile = entries.find((entry) => entry.startsWith(`${basename(filePath)}.corrupt-`));

		expect(corruptFile).toBeDefined();
		expect(await readFile(join(dirname(filePath), corruptFile as string), "utf8")).toBe(corruptContent);
		expect(await store.getComments()).toHaveLength(1);
	});

	it("does not lose comments under concurrent addComment calls", async () => {
		const store = createStore(filePath);

		await Promise.all(
			Array.from({ length: 10 }, (_, index) => store.addComment(newCommentInput({ text: `comment ${index}` }))),
		);

		expect(await store.getComments()).toHaveLength(10);
	});

	it("parses a missing mode as clear", async () => {
		await writeFileWithMkdir(filePath, JSON.stringify({ comments: [] }));
		const store = createStore(filePath);

		expect((await store.read()).mode).toBe("clear");
	});

	it("adds and round-trips a comment", async () => {
		const store = createStore(filePath);
		const added = await store.addComment(newCommentInput());

		expect(added.id).toBeTruthy();
		expect(added.resolved).toBe(false);
		expect(added.createdAt).toBe(added.updatedAt);

		const comments = await store.getComments();

		expect(comments).toHaveLength(1);
		expect(comments[0]).toEqual(added);
	});

	it("writes pretty-printed JSON with a trailing newline, creating parent dirs", async () => {
		const store = createStore(filePath);

		await store.addComment(newCommentInput());

		const raw = await readFile(filePath, "utf8");

		expect(raw.endsWith("\n")).toBe(true);
		expect(raw).toContain("\n  ");
	});

	it("updateCommentText updates text and updatedAt, returns null when missing", async () => {
		const store = createStore(filePath);
		const added = await store.addComment(newCommentInput());

		await new Promise((resolve) => setTimeout(resolve, 2));

		const updated = await store.updateCommentText(added.id, "new text");

		expect(updated?.text).toBe("new text");
		expect(updated?.updatedAt).not.toBe(added.updatedAt);

		expect(await store.updateCommentText("missing-id", "x")).toBeNull();
	});

	it("filters getComments by origin", async () => {
		const store = createStore(filePath);

		await store.addComment(newCommentInput({ origin: "https://a.com" }));
		await store.addComment(newCommentInput({ origin: "https://b.com" }));

		const filtered = await store.getComments({ origin: "https://a.com" });

		expect(filtered).toHaveLength(1);
		expect(filtered[0].origin).toBe("https://a.com");
	});

	it("filters getComments by urlContains", async () => {
		const store = createStore(filePath);

		await store.addComment(newCommentInput({ url: "https://example.com/foo" }));
		await store.addComment(newCommentInput({ url: "https://example.com/bar" }));

		const filtered = await store.getComments({ urlContains: "/foo" });

		expect(filtered).toHaveLength(1);
		expect(filtered[0].url).toBe("https://example.com/foo");
	});

	it("consumeComments in clear mode removes only matched comments", async () => {
		const store = createStore(filePath);

		const a = await store.addComment(newCommentInput({ origin: "https://a.com" }));
		const b = await store.addComment(newCommentInput({ origin: "https://b.com" }));

		const result = await store.consumeComments({ origin: "https://a.com" });

		expect(result.mode).toBe("clear");
		expect(result.comments.map((c) => c.id)).toEqual([a.id]);

		const remaining = await store.getComments();

		expect(remaining.map((c) => c.id)).toEqual([b.id]);
	});

	it("consumeComments in keep mode marks matched comments resolved but keeps them", async () => {
		const store = createStore(filePath);

		await store.setMode("keep");

		const a = await store.addComment(newCommentInput({ origin: "https://a.com" }));
		const b = await store.addComment(newCommentInput({ origin: "https://b.com" }));

		const result = await store.consumeComments({ origin: "https://a.com" });

		expect(result.mode).toBe("keep");
		expect(result.comments.map((c) => c.id)).toEqual([a.id]);
		expect(result.comments[0].resolved).toBe(true);

		const remaining = await store.getComments();

		expect(remaining).toHaveLength(2);

		const remainingA = remaining.find((c) => c.id === a.id);
		const remainingB = remaining.find((c) => c.id === b.id);

		expect(remainingA?.resolved).toBe(true);
		expect(remainingB?.resolved).toBe(false);
	});

	it("resolveComment in clear mode removes the comment", async () => {
		const store = createStore(filePath);
		const added = await store.addComment(newCommentInput());

		expect(await store.resolveComment(added.id)).toBe("removed");
		expect(await store.getComments()).toHaveLength(0);
	});

	it("resolveComment in keep mode marks resolved and retains it", async () => {
		const store = createStore(filePath);

		await store.setMode("keep");

		const added = await store.addComment(newCommentInput());

		expect(await store.resolveComment(added.id)).toBe("resolved");

		const comments = await store.getComments();

		expect(comments).toHaveLength(1);
		expect(comments[0].resolved).toBe(true);
	});

	it("resolveComment returns not_found for a missing id", async () => {
		const store = createStore(filePath);

		expect(await store.resolveComment("missing-id")).toBe("not_found");
	});

	it("unresolveComment reverses a keep-mode resolve", async () => {
		const store = createStore(filePath);

		await store.setMode("keep");

		const added = await store.addComment(newCommentInput());

		await store.resolveComment(added.id);

		const unresolved = await store.unresolveComment(added.id);

		expect(unresolved?.resolved).toBe(false);

		const comments = await store.getComments();

		expect(comments[0].resolved).toBe(false);
	});

	it("unresolveComment returns null for a missing id", async () => {
		const store = createStore(filePath);

		expect(await store.unresolveComment("missing-id")).toBeNull();
	});

	it("clearComments removes all comments and returns the count", async () => {
		const store = createStore(filePath);

		await store.addComment(newCommentInput({ origin: "https://a.com" }));
		await store.addComment(newCommentInput({ origin: "https://b.com" }));

		expect(await store.clearComments()).toBe(2);
		expect(await store.getComments()).toHaveLength(0);
	});

	it("clearComments scoped to an origin only removes that origin's comments", async () => {
		const store = createStore(filePath);

		await store.addComment(newCommentInput({ origin: "https://a.com" }));
		await store.addComment(newCommentInput({ origin: "https://a.com" }));
		await store.addComment(newCommentInput({ origin: "https://b.com" }));

		expect(await store.clearComments("https://a.com")).toBe(2);

		const remaining = await store.getComments();

		expect(remaining).toHaveLength(1);
		expect(remaining[0].origin).toBe("https://b.com");
	});

	it("setMode persists the mode", async () => {
		const store = createStore(filePath);

		const updated = await store.setMode("keep");

		expect(updated.mode).toBe("keep");
		expect((await store.read()).mode).toBe("keep");
	});

	it("listOrigins returns per-origin totals and unresolved counts, sorted", async () => {
		const store = createStore(filePath);

		await store.addComment(newCommentInput({ origin: "https://b.com" }));
		const resolvedOne = await store.addComment(newCommentInput({ origin: "https://a.com" }));
		await store.addComment(newCommentInput({ origin: "https://a.com" }));
		await store.resolveComment(resolvedOne.id);

		// resolveComment removed it in clear mode; re-add and use keep mode to test unresolved counts properly.
		await store.setMode("keep");

		const c1 = await store.addComment(newCommentInput({ origin: "https://a.com" }));

		await store.resolveComment(c1.id);

		const origins = await store.listOrigins();

		expect(origins.map((o) => o.origin)).toEqual(["https://a.com", "https://b.com"]);

		const aSummary = origins.find((o) => o.origin === "https://a.com");

		expect(aSummary?.total).toBe(2);
		expect(aSummary?.unresolved).toBe(1);
	});
});

async function writeFileWithMkdir(filePath: string, contents: string): Promise<void> {
	const { mkdir } = await import("node:fs/promises");
	const { dirname } = await import("node:path");

	await mkdir(dirname(filePath), { recursive: true });
	await writeFile(filePath, contents, "utf8");
}
