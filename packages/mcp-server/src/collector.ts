import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";

import { DEFAULT_PORT, TOKEN_HEADER, newCommentInputSchema, storeModeSchema } from "@claudback/shared";

import { tokenMatches } from "./auth.js";
import { CLAUDBACK_DIR, PORT_FILE } from "./paths.js";
import { sanitizeText } from "./sanitize.js";
import { applyCorsHeaders, originAllowed } from "./security.js";
import type { StoreApi } from "./store-api.js";

// Collector requests carry one comment plus element metadata; anything larger
// is garbage or abuse.
const MAX_BODY_BYTES = 64 * 1024;

function send(res: ServerResponse, status: number, body?: unknown): void {
	const payload = body === undefined ? "" : JSON.stringify(body);

	res.statusCode = status;
	res.setHeader("content-type", "application/json");
	res.end(payload);
}

function readBody(req: IncomingMessage): Promise<unknown | undefined> {
	return new Promise((resolve) => {
		let size = 0;
		const chunks: Buffer[] = [];
		let aborted = false;

		req.on("data", (chunk: Buffer) => {
			if (aborted) {
				return;
			}

			size += chunk.length;

			if (size > MAX_BODY_BYTES) {
				aborted = true;
				// Stop reading rather than draining a hostile stream; the
				// handler still returns a 400, and requestTimeout reaps the
				// connection if the client keeps the socket open.
				req.pause();
				resolve(undefined);

				return;
			}

			chunks.push(chunk);
		});
		req.on("end", () => {
			if (aborted) {
				return;
			}

			if (chunks.length === 0) {
				resolve({});

				return;
			}

			try {
				resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
			} catch {
				resolve(undefined);
			}
		});
		req.on("error", () => {
			resolve(undefined);
		});
	});
}

function sanitizeCommentFields<T extends Record<string, unknown>>(body: T): T {
	const cleaned: Record<string, unknown> = { ...body };

	for (const key of ["text", "textSnippet", "htmlExcerpt", "selector", "tag", "url", "origin"]) {
		if (typeof cleaned[key] === "string") {
			cleaned[key] = sanitizeText(cleaned[key] as string);
		}
	}

	return cleaned as T;
}

export function createCollector(store: StoreApi, token: string): Server {
	const server = createServer(async (req, res) => {
		const method = req.method ?? "GET";
		const origin = req.headers.origin;
		const url = new URL(req.url ?? "/", "http://127.0.0.1");
		const path = url.pathname;

		if (!originAllowed(origin)) {
			// No CORS headers on purpose: the browser must not expose anything
			// about this server to a disallowed origin.
			send(res, 403, { error: "origin not allowed" });

			return;
		}

		if (origin !== undefined) {
			applyCorsHeaders(res, origin);
		}

		if (method === "OPTIONS") {
			send(res, 204);

			return;
		}

		const providedToken = req.headers[TOKEN_HEADER];

		if (!tokenMatches(typeof providedToken === "string" ? providedToken : undefined, token)) {
			console.error(`[claudback] rejected unauthenticated ${method} ${path} (origin: ${origin ?? "none"})`);
			send(res, 401, { error: "missing or invalid pairing token" });

			return;
		}

		try {
			if (path === "/comments" && method === "GET") {
				const filterOrigin = url.searchParams.get("origin") ?? undefined;
				const store_ = await store.read();
				const comments = await store.getComments(filterOrigin ? { origin: filterOrigin } : undefined);

				send(res, 200, { mode: store_.mode, comments });

				return;
			}

			if (path === "/comments" && method === "POST") {
				const body = await readBody(req);

				if (body === undefined || typeof body !== "object" || body === null) {
					send(res, 400, { error: "invalid or oversized body" });

					return;
				}

				const parsed = newCommentInputSchema.safeParse(sanitizeCommentFields(body as Record<string, unknown>));

				if (!parsed.success) {
					send(res, 400, { error: "comment failed validation", issues: parsed.error.issues });

					return;
				}

				const comment = await store.addComment(parsed.data);

				send(res, 201, comment);

				return;
			}

			const idMatch = path.match(/^\/comments\/([0-9a-f-]{36})$/);

			if (idMatch && method === "PUT") {
				const body = await readBody(req);

				if (body === undefined || typeof body !== "object" || body === null) {
					send(res, 400, { error: "invalid or oversized body" });

					return;
				}

				const text = (body as Record<string, unknown>).text;

				if (typeof text !== "string" || text.length === 0 || text.length > 4096) {
					send(res, 400, { error: "text must be a non-empty string of at most 4096 chars" });

					return;
				}

				const comment = await store.updateCommentText(idMatch[1], sanitizeText(text));

				if (!comment) {
					send(res, 404, { error: "not found" });

					return;
				}

				send(res, 200, comment);

				return;
			}

			if (idMatch && method === "DELETE") {
				const deleted = await store.deleteComment(idMatch[1]);

				send(res, deleted ? 200 : 404, deleted ? { ok: true } : { error: "not found" });

				return;
			}

			if (path === "/clear" && method === "POST") {
				const body = await readBody(req);
				const clearOrigin =
					body !== undefined && typeof body === "object" && body !== null
						? (body as Record<string, unknown>).origin
						: undefined;
				const removed = await store.clearComments(typeof clearOrigin === "string" ? clearOrigin : undefined);

				send(res, 200, { removed });

				return;
			}

			if (path === "/mode" && method === "PUT") {
				const body = await readBody(req);

				if (body === undefined || typeof body !== "object" || body === null) {
					send(res, 400, { error: "invalid or oversized body" });

					return;
				}

				const mode = storeModeSchema.parse((body as Record<string, unknown>).mode);
				const updated = await store.setMode(mode);

				send(res, 200, updated);

				return;
			}

			send(res, 404, { error: "not found" });
		} catch (error) {
			console.error("[claudback] collector error:", error);
			send(res, 500, { error: "internal error" });
		}
	});

	// Bound how long a client may hold a connection while sending its request,
	// so a slow trickle can't pin a connection open indefinitely.
	server.requestTimeout = 10_000;
	server.headersTimeout = 5_000;

	return server;
}

export async function startCollector(store: StoreApi, token: string): Promise<{ server: Server; port: number }> {
	const server = createCollector(store, token);
	const port = await new Promise<number>((resolve, reject) => {
		server.once("error", (error: NodeJS.ErrnoException) => {
			if (error.code === "EADDRINUSE") {
				// Default port taken (another collector or unrelated process):
				// fall back to an ephemeral port and advertise it via the port
				// file so the extension's sync layer can discover it.
				server.listen(0, "127.0.0.1", () => {
					const address = server.address();

					if (address && typeof address === "object") {
						resolve(address.port);
					} else {
						reject(new Error("collector bound without an address"));
					}
				});
			} else {
				reject(error);
			}
		});
		// Loopback only: the collector accepts token-authenticated writes, and
		// must never be reachable from other machines.
		server.listen(DEFAULT_PORT, "127.0.0.1", () => {
			resolve(DEFAULT_PORT);
		});
	});

	await mkdir(CLAUDBACK_DIR, { recursive: true });
	await writeFile(PORT_FILE, `${port}\n`, "utf8");

	return { server, port };
}
