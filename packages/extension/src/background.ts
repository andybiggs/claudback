import type { Comment, NewCommentInput, Store, StoreMode } from "@claudback/shared";

import { flushBuffer } from "./lib/buffer.js";
import {
	clearComments,
	CollectorHttpError,
	createComment,
	deleteComment,
	exchangePairingCode,
	listComments,
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
	PairResponse,
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

// Tabs the user has explicitly enabled this session (tabId → origin pattern).
// The overlay is injected on demand — never auto-registered — so nothing runs
// on a page until asked. Kept in storage.session rather than memory so the
// enable survives MV3 service-worker restarts; it still clears when the
// browser closes.
const ENABLED_TABS_KEY = "claudback_enabled_tabs";

async function readEnabledTabs(): Promise<Record<string, string>> {
	const result = await chrome.storage.session.get(ENABLED_TABS_KEY);
	const tabs = result[ENABLED_TABS_KEY];

	return typeof tabs === "object" && tabs !== null ? (tabs as Record<string, string>) : {};
}

async function getEnabledOrigin(tabId: number): Promise<string | undefined> {
	return (await readEnabledTabs())[String(tabId)];
}

async function setTabEnabled(tabId: number, originPattern: string): Promise<void> {
	const tabs = await readEnabledTabs();

	tabs[String(tabId)] = originPattern;
	await chrome.storage.session.set({ [ENABLED_TABS_KEY]: tabs });
}

async function setTabDisabled(tabId: number): Promise<void> {
	const tabs = await readEnabledTabs();

	delete tabs[String(tabId)];
	await chrome.storage.session.set({ [ENABLED_TABS_KEY]: tabs });
}

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

interface BufferedComment {
	localId: string;
	input: NewCommentInput;
}

async function readBuffer(): Promise<BufferedComment[]> {
	const result = await chrome.storage.local.get(BUFFER_KEY);
	const buffer = result[BUFFER_KEY];

	if (!Array.isArray(buffer)) {
		return [];
	}

	// Older versions stored bare NewCommentInput entries with array-index IDs;
	// wrap them with stable IDs on read.
	return buffer.map((entry: BufferedComment | NewCommentInput) => {
		if ("localId" in entry && "input" in entry) {
			return entry;
		}

		return { localId: crypto.randomUUID(), input: entry };
	});
}

async function writeBuffer(items: BufferedComment[]): Promise<void> {
	await chrome.storage.local.set({ [BUFFER_KEY]: items });
}

async function appendBuffer(input: NewCommentInput): Promise<BufferedComment> {
	const buffer = await readBuffer();
	const item: BufferedComment = { localId: crypto.randomUUID(), input };

	buffer.push(item);
	await writeBuffer(buffer);

	return item;
}

function localComment(item: BufferedComment): Comment {
	const now = new Date().toISOString();

	return {
		...item.input,
		rect: item.input.rect ?? null,
		viewport: item.input.viewport ?? null,
		id: `local:${item.localId}`,
		resolved: false,
		createdAt: now,
		updatedAt: now,
	};
}

// A 401 means the collector is up but rejected the pairing token — a very
// different fix for the user than the collector being unreachable.
function failureState(error: unknown): SyncState {
	if (error instanceof CollectorHttpError && error.status === 401) {
		return "unauthorized";
	}

	return "offline";
}

async function tryFlush(config: CollectorConfig): Promise<void> {
	await flushBuffer({
		read: readBuffer,
		write: writeBuffer,
		post: async (item) => {
			await createComment(config, item.input);
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

	try {
		await listComments(config, "");
	} catch (error) {
		console.debug("[claudback] status check failed:", error);
		const buffer = await readBuffer();

		return { state: failureState(error), pending: buffer.length };
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

	return buffer.filter((item) => item.input.origin === origin).map(localComment);
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
	} catch (error) {
		console.debug("[claudback] list failed:", error);

		return { ok: true, state: failureState(error), mode: "clear", comments: await localsForOrigin(origin) };
	}
}

async function handleCreate(payload: NewCommentInput): Promise<CreateResponse> {
	const token = await getToken();

	if (!token) {
		const item = await appendBuffer(payload);

		return { ok: true, buffered: true, comment: localComment(item), state: "unpaired" };
	}

	const config: CollectorConfig = { token };

	try {
		const comment = await createComment(config, payload);

		return { ok: true, buffered: false, comment, state: "synced" };
	} catch (error) {
		console.error("[claudback] create failed, buffering comment:", error);
		const item = await appendBuffer(payload);

		return { ok: true, buffered: true, comment: localComment(item), state: failureState(error) };
	}
}

function isLocalId(id: string): boolean {
	return id.startsWith("local:");
}

function localId(id: string): string {
	return id.slice("local:".length);
}

// Shared shape for remote actions that require a token: run `action` with it,
// map a thrown error to the right SyncState, and log with the given label.
async function withToken(label: string, action: (token: string) => Promise<unknown>): Promise<SimpleResponse> {
	const token = await getToken();

	if (!token) {
		return { ok: false, state: "unpaired" };
	}

	try {
		await action(token);

		return { ok: true, state: "synced" };
	} catch (error) {
		console.error(`[claudback] ${label} failed:`, error);

		return { ok: false, state: failureState(error) };
	}
}

async function handleUpdate(id: string, text: string): Promise<SimpleResponse> {
	if (isLocalId(id)) {
		const buffer = await readBuffer();
		const index = buffer.findIndex((item) => item.localId === localId(id));

		if (index < 0) {
			return { ok: false, state: "offline" };
		}

		buffer[index] = { ...buffer[index], input: { ...buffer[index].input, text } };
		await writeBuffer(buffer);

		return { ok: true, state: "offline" };
	}

	return withToken("update", (token) => updateComment({ token }, id, text));
}

async function handleDelete(id: string): Promise<SimpleResponse> {
	if (isLocalId(id)) {
		const buffer = await readBuffer();
		const index = buffer.findIndex((item) => item.localId === localId(id));

		if (index < 0) {
			return { ok: false, state: "offline" };
		}

		buffer.splice(index, 1);
		await writeBuffer(buffer);

		return { ok: true, state: "offline" };
	}

	return withToken("delete", (token) => deleteComment({ token }, id));
}

async function handleUnresolve(id: string): Promise<SimpleResponse> {
	if (isLocalId(id)) {
		// Buffered/unsynced comments are never resolved, so there's nothing to
		// reverse — the "unresolve" action never surfaces for them in the UI.
		return { ok: false, state: "offline" };
	}

	return withToken("unresolve", (token) => unresolveComment({ token }, id));
}

async function handleClear(origin: string): Promise<SimpleResponse> {
	return withToken("clear", (token) => clearComments({ token }, origin));
}

async function handleSetMode(mode: StoreMode): Promise<SimpleResponse> {
	return withToken("setMode", (token) => setMode({ token }, mode));
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
	if ((await getEnabledOrigin(tabId)) !== undefined) {
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
	await setTabEnabled(tabId, originPattern);

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
	await setTabDisabled(tabId);

	try {
		await chrome.tabs.sendMessage(tabId, { type: "unmount" });
	} catch {
		// Content script may already be gone (tab reloaded); nothing to do.
	}

	return { enabled: false };
}

// Trade a short-lived pairing code for the bearer token, store it, and report
// the resulting connection state. computeStatus() afterwards also flushes any
// comments buffered while unpaired.
async function handlePairWithCode(code: string): Promise<PairResponse> {
	let token: string;

	try {
		token = await exchangePairingCode(code);
	} catch (error) {
		if (error instanceof CollectorHttpError && error.status === 401) {
			const status = await computeStatus();

			return { ok: false, state: status.state, error: "invalid_code" };
		}

		console.debug("[claudback] pairing exchange failed:", error);

		return { ok: false, state: "offline", error: "offline" };
	}

	await chrome.storage.local.set({ [TOKEN_KEY]: token });
	const status = await computeStatus();

	return { ok: true, state: status.state };
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
			return { enabled: (await getEnabledOrigin(message.tabId)) !== undefined } satisfies TabStateResponse;
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
		case "pairWithCode": {
			return handlePairWithCode(message.code);
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

// First install opens the setup guide, which walks through registering the
// MCP server and pairing the token. Updates don't reopen it.
chrome.runtime.onInstalled.addListener(({ reason }) => {
	if (reason === "install") {
		chrome.tabs.create({ url: chrome.runtime.getURL("onboarding.html") }).catch((error: unknown) => {
			console.error("[claudback] failed to open onboarding:", error);
		});
	}
});

chrome.tabs.onRemoved.addListener((tabId) => {
	void setTabDisabled(tabId);
	pendingEnables.delete(tabId);
});

// Page loads wipe the injected overlay, but the user's enable choice stands:
// re-inject on reload or same-origin navigation. A navigation to an origin the
// grant doesn't cover turns the tab off instead of following the user around.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
	const url = tab.url;

	if (changeInfo.status !== "loading" || !url) {
		return;
	}

	void (async () => {
		const originPattern = await getEnabledOrigin(tabId);

		if (originPattern === undefined) {
			return;
		}

		const stillGranted =
			`${new URL(url).origin}/*` === originPattern &&
			(await chrome.permissions.contains({ origins: [originPattern] }));

		if (!stillGranted) {
			await setTabDisabled(tabId);

			return;
		}

		await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
	})().catch((error: unknown) => {
		console.error("[claudback] failed to re-inject overlay:", error);
	});
});

// Referenced only so PopupRequest/ContentRequest narrowing stays exhaustive if
// the union grows.
export type { ContentRequest, PopupRequest };
