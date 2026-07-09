import { describe, expect, it, vi } from "vitest";

import { TOKEN_HEADER, type NewCommentInput } from "@claudback/shared";

import { CollectorHttpError, createComment, exchangePairingCode, listComments, ping, setMode, updateComment } from "./collector.js";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
	return {
		ok,
		status,
		json: async () => body,
	} as Response;
}

// Typed to fetch's signature so mock.calls destructures as [url, init].
function fetchMock(response: () => Response | Promise<Response>) {
	return vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response());
}

const input: NewCommentInput = {
	origin: "https://example.com",
	url: "https://example.com/x",
	selector: "button",
	tag: "button",
	text: "fix this",
	textSnippet: "Buy",
	htmlExcerpt: "<button>",
	rect: null,
	viewport: null,
};

describe("collector client", () => {
	it("attaches the pairing token header and targets loopback on the default port", async () => {
		const fetchImpl = fetchMock(() => jsonResponse({}));

		await listComments({ token: "secret-token", fetchImpl }, "https://example.com");

		const [url, init] = fetchImpl.mock.calls[0];

		expect(url).toBe("http://127.0.0.1:57463/comments?origin=https%3A%2F%2Fexample.com");
		expect(init?.method).toBe("GET");
		expect(init?.headers).toMatchObject({ [TOKEN_HEADER]: "secret-token" });
	});

	it("posts a new comment to /comments", async () => {
		const fetchImpl = fetchMock(() => jsonResponse({ id: "abc" }));

		await createComment({ token: "t", fetchImpl }, input);

		const [url, init] = fetchImpl.mock.calls[0];

		expect(url).toBe("http://127.0.0.1:57463/comments");
		expect(init?.method).toBe("POST");
		expect(JSON.parse(init?.body as string)).toMatchObject({ text: "fix this" });
	});

	it("targets the id route for updates", async () => {
		const fetchImpl = fetchMock(() => jsonResponse({ id: "abc" }));

		await updateComment({ token: "t", fetchImpl }, "abc", "new text");

		expect(fetchImpl.mock.calls[0][0]).toBe("http://127.0.0.1:57463/comments/abc");
	});

	it("honours a custom port", async () => {
		const fetchImpl = fetchMock(() => jsonResponse({ mode: "clear", comments: [] }));

		await setMode({ token: "t", port: 5000, fetchImpl }, "keep");

		expect(fetchImpl.mock.calls[0][0]).toBe("http://127.0.0.1:5000/mode");
	});

	it("throws on a non-ok response so the worker can buffer", async () => {
		const fetchImpl = fetchMock(() => jsonResponse({ error: "nope" }, false, 401));

		await expect(listComments({ token: "wrong", fetchImpl }, "")).rejects.toThrow("401");
	});

	it("exchangePairingCode posts the code to /pair without the token header", async () => {
		const fetchImpl = fetchMock(() => jsonResponse({ token: "the-token" }));

		expect(await exchangePairingCode("ABCD-2345", { fetchImpl })).toBe("the-token");

		const [url, init] = fetchImpl.mock.calls[0];

		expect(url).toBe("http://127.0.0.1:57463/pair");
		expect(init?.method).toBe("POST");
		expect(JSON.parse(init?.body as string)).toEqual({ code: "ABCD-2345" });
		expect(init?.headers).not.toHaveProperty(TOKEN_HEADER);
	});

	it("exchangePairingCode throws CollectorHttpError on a rejected code", async () => {
		const fetchImpl = fetchMock(() => jsonResponse({ error: "invalid or expired pairing code" }, false, 401));

		await expect(exchangePairingCode("WRONGONE", { fetchImpl })).rejects.toThrow(CollectorHttpError);
	});

	it("exchangePairingCode throws when a 200 carries no token", async () => {
		const fetchImpl = fetchMock(() => jsonResponse({}));

		await expect(exchangePairingCode("ABCD-2345", { fetchImpl })).rejects.toThrow("no token");
	});

	it("ping resolves false when the collector is unreachable", async () => {
		const fetchImpl = fetchMock(() => {
			throw new Error("ECONNREFUSED");
		});

		expect(await ping({ token: "t", fetchImpl })).toBe(false);
	});
});
