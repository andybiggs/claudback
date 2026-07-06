import type { Comment, NewCommentInput, Store, StoreMode } from "@claudback/shared";

import { flushBuffer } from "./lib/buffer.js";
import {
	clearComments,
	createComment,
	deleteComment,
	listComments,
	ping,
	setMode,
	updateComment,
	type CollectorConfig,
} from "./lib/collector.js";
import type {
	ContentRequest,
	CreateResponse,
	ExtensionRequest,
	ListResponse,
	PopupRequest,
	SimpleResponse,
	StatusReport,
	SyncState,
	TabStateResponse,
	TestConnectionResponse,
} from "./messages.js";

const TOKEN_KEY = "claudback_token";
const BUFFER_KEY = "claudback_buffer";
const FLUSH_ALARM = "claudback-flush";

// Tabs the user has explicitly enabled this session. The overlay is injected
// on demand — never auto-registered — so nothing runs on a page until asked.
const enabledTabs = new Set<number>();

async function getToken(): Promise<string | null> {
	const result = await chrome.storage.local.get(TOKEN_KEY);
	const token = result[TOKEN_KEY];

	return typeof token === "string" && token.length > 0 ? token : null;
}

async function readBuffer(): Promise<NewCommentInput[]> {
	const result = await chrome.storage.local.get(BUFFER_KEY);
	const buffer = result[BUFFER_KEY];

	return Array.isArray(buffer) ? (buffer as NewCommentInput[]) : [];
}

async function writeBuffer(items: NewCommentInput[]): Promise<void> {
	await chrome.storage.local.set({ [BUFFER_KEY]: items });
}

async function appendBuffer(input: NewCommentInput): Promise<void> {
	const buffer = await readBuffer();

	buffer.push(input);
	await writeBuffer(buffer);
}

function localComment(input: NewCommentInput, index: number): Comment {
	const now = new Date().toISOString();

	return {
		...input,
		rect: input.rect ?? null,
		viewport: input.viewport ?? null,
		id: `local:${index}`,
		resolved: false,
		createdAt: now,
		updatedAt: now,
	};
}

async function tryFlush(config: CollectorConfig): Promise<void> {
	await flushBuffer({
		read: readBuffer,
		write: writeBuffer,
		post: async (input) => {
			await createComment(config, input);
		},
	});
}

async function computeStatus(): Promise<StatusReport> {
	const token = await getToken();

	if (!token) {
		const buffer = await readBuffer();

		return { state: "unpaired", pending: buffer.length };
	}

	const config: CollectorConfig = { token };
	const online = await ping(config);
	const buffer = await readBuffer();

	if (!online) {
		return { state: "offline", pending: buffer.length };
	}

	await tryFlush(config);
	const remaining = await readBuffer();

	if (remaining.length > 0) {
		return { state: "pending", pending: remaining.length };
	}

	return { state: "synced", pending: 0 };
}

async function localsForOrigin(origin: string): Promise<Comment[]> {
	const buffer = await readBuffer();

	return buffer
		.map((input, index) => ({ input, index }))
		.filter((entry) => entry.input.origin === origin)
		.map((entry) => localComment(entry.input, entry.index));
}

async function handleList(origin: string): Promise<ListResponse> {
	const token = await getToken();

	if (!token) {
		return { ok: true, state: "unpaired", mode: "clear", comments: await localsForOrigin(origin) };
	}

	const config: CollectorConfig = { token };

	try {
		await tryFlush(config);

		const store: Store = await listComments(config, origin);
		const locals = await localsForOrigin(origin);
		const state: SyncState = locals.length > 0 ? "pending" : "synced";

		return { ok: true, state, mode: store.mode, comments: [...store.comments, ...locals] };
	} catch {
		return { ok: true, state: "offline", mode: "clear", comments: await localsForOrigin(origin) };
	}
}

async function handleCreate(payload: NewCommentInput): Promise<CreateResponse> {
	const token = await getToken();

	if (!token) {
		const index = (await readBuffer()).length;

		await appendBuffer(payload);

		return { ok: true, buffered: true, comment: localComment(payload, index), state: "unpaired" };
	}

	const config: CollectorConfig = { token };

	try {
		const comment = await createComment(config, payload);

		return { ok: true, buffered: false, comment, state: "synced" };
	} catch {
		const index = (await readBuffer()).length;

		await appendBuffer(payload);

		return { ok: true, buffered: true, comment: localComment(payload, index), state: "offline" };
	}
}

function isLocalId(id: string): boolean {
	return id.startsWith("local:");
}

function localIndex(id: string): number {
	return Number(id.slice("local:".length));
}

async function handleUpdate(id: string, text: string): Promise<SimpleResponse> {
	if (isLocalId(id)) {
		const buffer = await readBuffer();
		const index = localIndex(id);

		if (index >= 0 && index < buffer.length) {
			buffer[index] = { ...buffer[index], text };
			await writeBuffer(buffer);
		}

		return { ok: true, state: "offline" };
	}

	const token = await getToken();

	if (!token) {
		return { ok: false, state: "unpaired" };
	}

	try {
		await updateComment({ token }, id, text);

		return { ok: true, state: "synced" };
	} catch {
		return { ok: false, state: "offline" };
	}
}

async function handleDelete(id: string): Promise<SimpleResponse> {
	if (isLocalId(id)) {
		const buffer = await readBuffer();
		const index = localIndex(id);

		if (index >= 0 && index < buffer.length) {
			buffer.splice(index, 1);
			await writeBuffer(buffer);
		}

		return { ok: true, state: "offline" };
	}

	const token = await getToken();

	if (!token) {
		return { ok: false, state: "unpaired" };
	}

	try {
		await deleteComment({ token }, id);

		return { ok: true, state: "synced" };
	} catch {
		return { ok: false, state: "offline" };
	}
}

async function handleClear(origin: string): Promise<SimpleResponse> {
	const token = await getToken();

	if (!token) {
		return { ok: false, state: "unpaired" };
	}

	try {
		await clearComments({ token }, origin);

		return { ok: true, state: "synced" };
	} catch {
		return { ok: false, state: "offline" };
	}
}

async function handleSetMode(mode: StoreMode): Promise<SimpleResponse> {
	const token = await getToken();

	if (!token) {
		return { ok: false, state: "unpaired" };
	}

	try {
		await setMode({ token }, mode);

		return { ok: true, state: "synced" };
	} catch {
		return { ok: false, state: "offline" };
	}
}

async function handleEnableTab(tabId: number): Promise<TabStateResponse> {
	const tab = await chrome.tabs.get(tabId);

	if (!tab.url) {
		return { enabled: false };
	}

	const originPattern = `${new URL(tab.url).origin}/*`;
	const granted = await chrome.permissions.request({ origins: [originPattern] });

	if (!granted) {
		return { enabled: false };
	}

	await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
	enabledTabs.add(tabId);

	return { enabled: true };
}

async function handleDisableTab(tabId: number): Promise<TabStateResponse> {
	enabledTabs.delete(tabId);

	try {
		await chrome.tabs.sendMessage(tabId, { type: "unmount" });
	} catch {
		// Content script may already be gone (tab reloaded); nothing to do.
	}

	return { enabled: false };
}

async function dispatch(message: ExtensionRequest): Promise<unknown> {
	switch (message.type) {
		case "list": {
			return handleList(message.origin);
		}
		case "create": {
			return handleCreate(message.payload);
		}
		case "update": {
			return handleUpdate(message.id, message.text);
		}
		case "delete": {
			return handleDelete(message.id);
		}
		case "clear": {
			return handleClear(message.origin);
		}
		case "setMode": {
			return handleSetMode(message.mode);
		}
		case "status": {
			return computeStatus();
		}
		case "getTabState": {
			return { enabled: enabledTabs.has(message.tabId) } satisfies TabStateResponse;
		}
		case "enableTab": {
			return handleEnableTab(message.tabId);
		}
		case "disableTab": {
			return handleDisableTab(message.tabId);
		}
		case "testConnection": {
			const status = await computeStatus();

			return { state: status.state } satisfies TestConnectionResponse;
		}
		default: {
			return { ok: false };
		}
	}
}

chrome.runtime.onMessage.addListener((message: ExtensionRequest, _sender, sendResponse) => {
	dispatch(message)
		.then(sendResponse)
		.catch((error) => {
			console.error("[claudback] background error:", error);
			sendResponse({ ok: false, state: "offline" });
		});

	// Keep the message channel open for the async response.
	return true;
});

// A periodic flush so buffered comments drain even if no tab is interacting.
chrome.alarms.create(FLUSH_ALARM, { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
	if (alarm.name !== FLUSH_ALARM) {
		return;
	}

	void (async () => {
		const token = await getToken();

		if (token) {
			await tryFlush({ token });
		}
	})();
});

chrome.tabs.onRemoved.addListener((tabId) => {
	enabledTabs.delete(tabId);
});

// Referenced only so PopupRequest/ContentRequest narrowing stays exhaustive if
// the union grows.
export type { ContentRequest, PopupRequest };
