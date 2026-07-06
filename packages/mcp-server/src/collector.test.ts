import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TOKEN_HEADER } from "@claudback/shared";

import { createCollector } from "./collector.js";
import { createStore } from "./store.js";
import type { StoreApi } from "./store-api.js";

const TOKEN = "a".repeat(32);
const VALID_EXTENSION_ORIGIN = `chrome-extension://${"a".repeat(32)}`;

function validCommentPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		origin: "https://example.com",
		url: "https://example.com/page",
		selector: "#main",
		tag: "div",
		text: "Looks off",
		textSnippet: "snippet",
		htmlExcerpt: "<div>",
		rect: null,
		viewport: null,
		...overrides,
	};
}

describe("collector", () => {
	let dir: string;
	let store: StoreApi;
	let server: Server;
	let baseUrl: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "claudback-collector-"));
		store = createStore(join(dir, "comments.json"));
		server = createCollector(store, TOKEN);

		await new Promise<void>((resolve) => {
			server.listen(0, "127.0.0.1", resolve);
		});

		const address = server.address() as AddressInfo;

		baseUrl = `http://127.0.0.1:${address.port}`;
	});

	afterEach(async () => {
		await new Promise<void>((resolve) => server.close(() => resolve()));
		await rm(dir, { recursive: true, force: true });
	});

	it("rejects requests with no token", async () => {
		const res = await fetch(`${baseUrl}/comments`);

		expect(res.status).toBe(401);
	});

	it("rejects requests with the wrong token", async () => {
		const res = await fetch(`${baseUrl}/comments`, {
			headers: { [TOKEN_HEADER]: "wrong-token" },
		});

		expect(res.status).toBe(401);
	});

	it("accepts a valid token with no Origin header", async () => {
		const res = await fetch(`${baseUrl}/comments`, {
			headers: { [TOKEN_HEADER]: TOKEN },
		});

		expect(res.status).toBe(200);
	});

	it("rejects a disallowed Origin and sends no CORS header", async () => {
		const res = await fetch(`${baseUrl}/comments`, {
			headers: { [TOKEN_HEADER]: TOKEN, origin: "https://evil.example" },
		});

		expect(res.status).toBe(403);
		expect(res.headers.get("access-control-allow-origin")).toBeNull();
	});

	it("accepts a valid chrome-extension Origin and echoes it back", async () => {
		const res = await fetch(`${baseUrl}/comments`, {
			headers: { [TOKEN_HEADER]: TOKEN, origin: VALID_EXTENSION_ORIGIN },
		});

		expect(res.status).toBe(200);
		expect(res.headers.get("access-control-allow-origin")).toBe(VALID_EXTENSION_ORIGIN);
	});

	it("answers an OPTIONS preflight from a valid extension origin without a token", async () => {
		const res = await fetch(`${baseUrl}/comments`, {
			method: "OPTIONS",
			headers: { origin: VALID_EXTENSION_ORIGIN },
		});

		expect(res.status).toBe(204);
		expect(res.headers.get("access-control-allow-private-network")).toBe("true");
	});

	it("creates a comment via POST and it is retrievable via GET", async () => {
		const postRes = await fetch(`${baseUrl}/comments`, {
			method: "POST",
			headers: { [TOKEN_HEADER]: TOKEN, "content-type": "application/json" },
			body: JSON.stringify(validCommentPayload()),
		});

		expect(postRes.status).toBe(201);

		const created = (await postRes.json()) as { id: string };

		expect(created.id).toBeTruthy();

		const getRes = await fetch(`${baseUrl}/comments`, {
			headers: { [TOKEN_HEADER]: TOKEN },
		});
		const body = (await getRes.json()) as { comments: Array<{ id: string }> };

		expect(body.comments.some((comment) => comment.id === created.id)).toBe(true);
	});

	it("rejects POST with text over 4096 chars", async () => {
		const res = await fetch(`${baseUrl}/comments`, {
			method: "POST",
			headers: { [TOKEN_HEADER]: TOKEN, "content-type": "application/json" },
			body: JSON.stringify(validCommentPayload({ text: "x".repeat(4097) })),
		});

		expect(res.status).toBe(400);
	});

	it("rejects POST with a body over 64KB", async () => {
		const res = await fetch(`${baseUrl}/comments`, {
			method: "POST",
			headers: { [TOKEN_HEADER]: TOKEN, "content-type": "application/json" },
			body: JSON.stringify(validCommentPayload({ htmlExcerpt: "x".repeat(70 * 1024) })),
		});

		expect(res.status).toBe(400);
	});

	it("flips mode via PUT /mode", async () => {
		const res = await fetch(`${baseUrl}/mode`, {
			method: "PUT",
			headers: { [TOKEN_HEADER]: TOKEN, "content-type": "application/json" },
			body: JSON.stringify({ mode: "keep" }),
		});

		expect(res.status).toBe(200);

		const body = (await res.json()) as { mode: string };

		expect(body.mode).toBe("keep");
	});

	it("strips control characters from posted text", async () => {
		const postRes = await fetch(`${baseUrl}/comments`, {
			method: "POST",
			headers: { [TOKEN_HEADER]: TOKEN, "content-type": "application/json" },
			body: JSON.stringify(validCommentPayload({ text: "helloworld" })),
		});

		expect(postRes.status).toBe(201);

		const created = (await postRes.json()) as { text: string };

		expect(created.text).toBe("helloworld");
	});
});
