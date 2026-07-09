import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_PORT, TOKEN_HEADER } from "@claudback/shared";

import { createCollector, startCollector } from "./collector.js";
import { createPairingManager, type PairingManager } from "./pairing.js";
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
	let pairing: PairingManager;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "claudback-collector-"));
		store = createStore(join(dir, "comments.json"));
		pairing = createPairingManager(TOKEN, { delayMs: 0, filePath: join(dir, "pairing.json") });
		server = createCollector(store, TOKEN, pairing);

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

	it("reverses a keep-mode resolve via POST /comments/:id/unresolve", async () => {
		await fetch(`${baseUrl}/mode`, {
			method: "PUT",
			headers: { [TOKEN_HEADER]: TOKEN, "content-type": "application/json" },
			body: JSON.stringify({ mode: "keep" }),
		});

		const postRes = await fetch(`${baseUrl}/comments`, {
			method: "POST",
			headers: { [TOKEN_HEADER]: TOKEN, "content-type": "application/json" },
			body: JSON.stringify(validCommentPayload()),
		});
		const created = (await postRes.json()) as { id: string };

		await store.resolveComment(created.id);

		const unresolveRes = await fetch(`${baseUrl}/comments/${created.id}/unresolve`, {
			method: "POST",
			headers: { [TOKEN_HEADER]: TOKEN },
		});

		expect(unresolveRes.status).toBe(200);

		const body = (await unresolveRes.json()) as { resolved: boolean };

		expect(body.resolved).toBe(false);
	});

	it("404s unresolving an id that doesn't exist", async () => {
		const res = await fetch(`${baseUrl}/comments/${"0".repeat(36)}/unresolve`, {
			method: "POST",
			headers: { [TOKEN_HEADER]: TOKEN },
		});

		expect(res.status).toBe(404);
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

	it("updates a comment's text via PUT /comments/:id", async () => {
		const postRes = await fetch(`${baseUrl}/comments`, {
			method: "POST",
			headers: { [TOKEN_HEADER]: TOKEN, "content-type": "application/json" },
			body: JSON.stringify(validCommentPayload()),
		});
		const created = (await postRes.json()) as { id: string };

		const putRes = await fetch(`${baseUrl}/comments/${created.id}`, {
			method: "PUT",
			headers: { [TOKEN_HEADER]: TOKEN, "content-type": "application/json" },
			body: JSON.stringify({ text: "updated text" }),
		});

		expect(putRes.status).toBe(200);

		const updated = (await putRes.json()) as { text: string };

		expect(updated.text).toBe("updated text");
	});

	it("rejects a PUT with text over the shared max length", async () => {
		const postRes = await fetch(`${baseUrl}/comments`, {
			method: "POST",
			headers: { [TOKEN_HEADER]: TOKEN, "content-type": "application/json" },
			body: JSON.stringify(validCommentPayload()),
		});
		const created = (await postRes.json()) as { id: string };

		const putRes = await fetch(`${baseUrl}/comments/${created.id}`, {
			method: "PUT",
			headers: { [TOKEN_HEADER]: TOKEN, "content-type": "application/json" },
			body: JSON.stringify({ text: "x".repeat(4097) }),
		});

		expect(putRes.status).toBe(400);
	});

	it("sanitizes updated text via PUT /comments/:id", async () => {
		const postRes = await fetch(`${baseUrl}/comments`, {
			method: "POST",
			headers: { [TOKEN_HEADER]: TOKEN, "content-type": "application/json" },
			body: JSON.stringify(validCommentPayload()),
		});
		const created = (await postRes.json()) as { id: string };

		const putRes = await fetch(`${baseUrl}/comments/${created.id}`, {
			method: "PUT",
			headers: { [TOKEN_HEADER]: TOKEN, "content-type": "application/json" },
			body: JSON.stringify({ text: "hello‮world" }),
		});
		const updated = (await putRes.json()) as { text: string };

		expect(updated.text).toBe("helloworld");
	});

	it("deletes a comment via DELETE /comments/:id", async () => {
		const postRes = await fetch(`${baseUrl}/comments`, {
			method: "POST",
			headers: { [TOKEN_HEADER]: TOKEN, "content-type": "application/json" },
			body: JSON.stringify(validCommentPayload()),
		});
		const created = (await postRes.json()) as { id: string };

		const deleteRes = await fetch(`${baseUrl}/comments/${created.id}`, {
			method: "DELETE",
			headers: { [TOKEN_HEADER]: TOKEN },
		});

		expect(deleteRes.status).toBe(200);
		expect(await store.getComments()).toHaveLength(0);
	});

	it("filters GET /comments by origin", async () => {
		for (const origin of ["https://a.com", "https://b.com"]) {
			await fetch(`${baseUrl}/comments`, {
				method: "POST",
				headers: { [TOKEN_HEADER]: TOKEN, "content-type": "application/json" },
				body: JSON.stringify(validCommentPayload({ origin })),
			});
		}

		const res = await fetch(`${baseUrl}/comments?origin=${encodeURIComponent("https://a.com")}`, {
			headers: { [TOKEN_HEADER]: TOKEN },
		});
		const body = (await res.json()) as { comments: Array<{ origin: string }> };

		expect(body.comments).toHaveLength(1);
		expect(body.comments[0].origin).toBe("https://a.com");
	});

	it("POST /clear with an origin only clears that origin", async () => {
		for (const origin of ["https://a.com", "https://b.com"]) {
			await fetch(`${baseUrl}/comments`, {
				method: "POST",
				headers: { [TOKEN_HEADER]: TOKEN, "content-type": "application/json" },
				body: JSON.stringify(validCommentPayload({ origin })),
			});
		}

		const clearRes = await fetch(`${baseUrl}/clear`, {
			method: "POST",
			headers: { [TOKEN_HEADER]: TOKEN, "content-type": "application/json" },
			body: JSON.stringify({ origin: "https://a.com" }),
		});

		expect(clearRes.status).toBe(200);
		expect((await clearRes.json()) as { removed: number }).toEqual({ removed: 1 });

		const remaining = await store.getComments();

		expect(remaining).toHaveLength(1);
		expect(remaining[0].origin).toBe("https://b.com");
	});

	it("POST /clear with a malformed JSON body is a 400, not a global clear", async () => {
		await fetch(`${baseUrl}/comments`, {
			method: "POST",
			headers: { [TOKEN_HEADER]: TOKEN, "content-type": "application/json" },
			body: JSON.stringify(validCommentPayload()),
		});

		const clearRes = await fetch(`${baseUrl}/clear`, {
			method: "POST",
			headers: { [TOKEN_HEADER]: TOKEN, "content-type": "application/json" },
			body: "{ not json",
		});

		expect(clearRes.status).toBe(400);
		expect(await store.getComments()).toHaveLength(1);
	});

	it("404s an unknown path", async () => {
		const res = await fetch(`${baseUrl}/nope`, {
			headers: { [TOKEN_HEADER]: TOKEN },
		});

		expect(res.status).toBe(404);
	});

	it("400s a PUT /mode with an invalid payload", async () => {
		const res = await fetch(`${baseUrl}/mode`, {
			method: "PUT",
			headers: { [TOKEN_HEADER]: TOKEN, "content-type": "application/json" },
			body: JSON.stringify({ mode: "bogus" }),
		});

		expect(res.status).toBe(400);
	});

	it("exchanges a valid pairing code for the token with no token header", async () => {
		const { code } = await pairing.mint();
		const res = await fetch(`${baseUrl}/pair`, {
			method: "POST",
			headers: { "content-type": "application/json", origin: VALID_EXTENSION_ORIGIN },
			body: JSON.stringify({ code }),
		});

		expect(res.status).toBe(200);
		expect((await res.json()) as { token: string }).toEqual({ token: TOKEN });
	});

	it("401s a wrong pairing code with the uniform error and CORS headers", async () => {
		await pairing.mint();

		const res = await fetch(`${baseUrl}/pair`, {
			method: "POST",
			headers: { "content-type": "application/json", origin: VALID_EXTENSION_ORIGIN },
			body: JSON.stringify({ code: "WRONGONE" }),
		});

		expect(res.status).toBe(401);
		expect((await res.json()) as { error: string }).toEqual({ error: "invalid or expired pairing code" });
		expect(res.headers.get("access-control-allow-origin")).toBe(VALID_EXTENSION_ORIGIN);
	});

	it("403s /pair from a disallowed origin without touching the pairing code", async () => {
		const { code } = await pairing.mint();
		const res = await fetch(`${baseUrl}/pair`, {
			method: "POST",
			headers: { "content-type": "application/json", origin: "https://evil.example" },
			body: JSON.stringify({ code }),
		});

		expect(res.status).toBe(403);
		expect(res.headers.get("access-control-allow-origin")).toBeNull();
		// The origin gate ran before the exchange, so the code is still valid.
		expect(await pairing.exchange(code)).toBe(TOKEN);
	});

	it("400s /pair with a malformed or missing code", async () => {
		for (const body of ["{ not json", JSON.stringify({}), JSON.stringify({ code: 5 }), JSON.stringify({ code: "x".repeat(65) })]) {
			const res = await fetch(`${baseUrl}/pair`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body,
			});

			expect(res.status).toBe(400);
		}
	});

	it("401s even the correct code after too many failed attempts", async () => {
		const { code } = await pairing.mint();

		for (let i = 0; i < 5; i += 1) {
			await fetch(`${baseUrl}/pair`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ code: "WRONGONE" }),
			});
		}

		const res = await fetch(`${baseUrl}/pair`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ code }),
		});

		expect(res.status).toBe(401);
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

describe("startCollector", () => {
	let dir: string;
	let store: StoreApi;
	let pairing: PairingManager;
	let servers: Server[];

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "claudback-collector-"));
		store = createStore(join(dir, "comments.json"));
		pairing = createPairingManager(TOKEN, { delayMs: 0, filePath: join(dir, "pairing.json") });
		servers = [];
	});

	afterEach(async () => {
		await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
		await rm(dir, { recursive: true, force: true });
	});

	// startCollector always binds DEFAULT_PORT (the extension only ever talks
	// to that fixed port), so this test needs it free rather than an ephemeral
	// port like the rest of the file.
	it("returns undefined instead of throwing when the port is already taken", async () => {
		const first = await startCollector(store, TOKEN, pairing);

		expect(first).toBeDefined();

		if (first) {
			servers.push(first.server);
		}

		expect(first?.port).toBe(DEFAULT_PORT);

		const second = await startCollector(store, TOKEN, pairing);

		expect(second).toBeUndefined();
	});
});
