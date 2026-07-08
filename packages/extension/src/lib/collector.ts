import { DEFAULT_PORT, PAIR_PATH, TOKEN_HEADER, type Comment, type NewCommentInput, type Store, type StoreMode } from "@claudback/shared";

// A thin typed client over the loopback collector. Every request carries the
// pairing token; the worker constructs one of these once it has a token.
export class CollectorHttpError extends Error {
	readonly status: number;

	constructor(status: number) {
		super(`collector responded ${status}`);
		this.name = "CollectorHttpError";
		this.status = status;
	}
}

export interface CollectorConfig {
	token: string;
	port?: number;
	fetchImpl?: typeof fetch;
}

function baseUrl(config: CollectorConfig): string {
	return `http://127.0.0.1:${config.port ?? DEFAULT_PORT}`;
}

async function request<T>(config: CollectorConfig, path: string, init: RequestInit): Promise<T> {
	const doFetch = config.fetchImpl ?? fetch;
	const res = await doFetch(`${baseUrl(config)}${path}`, {
		...init,
		headers: {
			"content-type": "application/json",
			[TOKEN_HEADER]: config.token,
		},
	});

	if (!res.ok) {
		throw new CollectorHttpError(res.status);
	}

	return (await res.json()) as T;
}

export function listComments(config: CollectorConfig, origin: string): Promise<Store> {
	const query = origin ? `?origin=${encodeURIComponent(origin)}` : "";

	return request<Store>(config, `/comments${query}`, { method: "GET" });
}

export function createComment(config: CollectorConfig, payload: NewCommentInput): Promise<Comment> {
	return request<Comment>(config, "/comments", { method: "POST", body: JSON.stringify(payload) });
}

export function updateComment(config: CollectorConfig, id: string, text: string): Promise<Comment> {
	return request<Comment>(config, `/comments/${id}`, { method: "PUT", body: JSON.stringify({ text }) });
}

export function deleteComment(config: CollectorConfig, id: string): Promise<void> {
	return request<void>(config, `/comments/${id}`, { method: "DELETE" });
}

export function unresolveComment(config: CollectorConfig, id: string): Promise<Comment> {
	return request<Comment>(config, `/comments/${id}/unresolve`, { method: "POST" });
}

export function clearComments(config: CollectorConfig, origin: string): Promise<void> {
	return request<void>(config, "/clear", { method: "POST", body: JSON.stringify({ origin }) });
}

export function setMode(config: CollectorConfig, mode: StoreMode): Promise<Store> {
	return request<Store>(config, "/mode", { method: "PUT", body: JSON.stringify({ mode }) });
}

// The one deliberately unauthenticated call: trade a short-lived pairing code
// (minted by the get_pairing_code MCP tool) for the real bearer token. Kept
// separate from request() so the token header can never leak into it.
export async function exchangePairingCode(
	code: string,
	opts?: { port?: number; fetchImpl?: typeof fetch },
): Promise<string> {
	const doFetch = opts?.fetchImpl ?? fetch;
	const res = await doFetch(`http://127.0.0.1:${opts?.port ?? DEFAULT_PORT}${PAIR_PATH}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ code }),
	});

	if (!res.ok) {
		throw new CollectorHttpError(res.status);
	}

	const body = (await res.json()) as { token?: unknown };

	if (typeof body.token !== "string" || body.token.length === 0) {
		throw new Error("collector returned no token for the pairing code");
	}

	return body.token;
}

// A cheap authenticated round-trip used by the popup/options "test connection"
// — resolves true only if the collector answered and accepted the token.
export async function ping(config: CollectorConfig): Promise<boolean> {
	try {
		await listComments(config, "");

		return true;
	} catch {
		return false;
	}
}
