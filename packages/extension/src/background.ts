import type { Comment, NewCommentInput, Store, StoreMode } from "@claudback/shared";

import { flushBuffer } from "./lib/buffer.js";
import {
	clearComments,
	createComment,
	deleteComment,
	listComments,
	ping,
	setMode,
	unresolveComment,
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

// Tabs waiting on a permission grant. The popup shows Chrome's native
// permission dialog, and Chrome closes extension popups the moment that
// dialog steals focus — killing the popup's JS before it can send the
// follow-up "enableTab" message. Recording the origin here before the popup
// requests the permission lets the onAdded listener below finish the job
// from the background worker, which outlives the popup.
const pendingEnables = new Map<number, string>();

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

async function handleUnresolve(id: string): Promise<SimpleResponse> {
	if (isLocalId(id)) {
		// Buffered/unsynced comments are never resolved, so there's nothing to
		// reverse — the "unresolve" action never surfaces for them in the UI.
		return { ok: false, state: "offline" };
	}

	const token = await getToken();

	if (!token) {
		return { ok: false, state: "unpaired" };
	}

	try {
		await unresolveComment({ token }, id);

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

async function originPatternFor(tabId: number): Promise<string | null> {
	const tab = await chrome.tabs.get(tabId);

	if (!tab.url) {
		return null;
	}

	return `${new URL(tab.url).origin}/*`;
}

// Idempotent: safe to call both from the direct "enableTab" message (fast
// path, when the popup survives) and from the onAdded listener (the reliable
// path, when it doesn't) without double-injecting the content script.
async function enableTabIfGranted(tabId: number, originPattern: string): Promise<boolean> {
	if (enabledTabs.has(tabId)) {
		return true;
	}

	// We only trust that the permission was granted after re-checking it
	// ourselves, so a compromised popup can't force an injection without the
	// origin having actually been granted.
	const granted = await chrome.permissions.contains({ origins: [originPattern] });

	if (!granted) {
		return false;
	}

	await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
	enabledTabs.add(tabId);

	return true;
}

async function handleArmEnable(tabId: number): Promise<void> {
	const originPattern = await originPatternFor(tabId);

	if (originPattern) {
		pendingEnables.set(tabId, originPattern);
	}
}

// Called when the user denies the permission dialog, so a later unrelated
// grant for the same origin (e.g. enabling Claudback on another tab of the
// same site) doesn't cause the onAdded listener to silently enable this tab
// too, which the user never asked for.
function handleDisarmEnable(tabId: number): void {
	pendingEnables.delete(tabId);
}

async function handleEnableTab(tabId: number): Promise<TabStateResponse> {
	const originPattern = await originPatternFor(tabId);

	if (!originPattern) {
		return { enabled: false };
	}

	const enabled = await enableTabIfGranted(tabId, originPattern);

	if (enabled) {
		pendingEnables.delete(tabId);
	}

	return { enabled };
}

// The popup's own permissions.request() calls this before showing Chrome's
// dialog, but if the popup gets closed by that dialog, this listener still
// fires in the background worker and finishes enabling the tab.
chrome.permissions.onAdded.addListener((permissions) => {
	const origins = permissions.origins ?? [];

	void (async () => {
		for (const [tabId, originPattern] of pendingEnables) {
			if (origins.includes(originPattern)) {
				await enableTabIfGranted(tabId, originPattern);
				pendingEnables.delete(tabId);
			}
		}
	})();
});

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
		case "unresolve": {
			return handleUnresolve(message.id);
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
		case "armEnable": {
			return handleArmEnable(message.tabId);
		}
		case "disarmEnable": {
			return handleDisarmEnable(message.tabId);
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
	pendingEnables.delete(tabId);
});

// Referenced only so PopupRequest/ContentRequest narrowing stays exhaustive if
// the union grows.
export type { ContentRequest, PopupRequest };
