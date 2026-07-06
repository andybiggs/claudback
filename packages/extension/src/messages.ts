import type { Comment, NewCommentInput, StoreMode } from "@claudback/shared";

// Wire protocol between the content script and the background worker. The
// content script never talks to the collector directly — it only sends these
// messages, and the worker owns all collector I/O, the pairing token, and the
// offline buffer.

export type SyncState = "synced" | "pending" | "offline" | "unpaired";

export interface StatusReport {
	state: SyncState;
	pending: number;
}

export type ContentRequest =
	| { type: "list"; origin: string }
	| { type: "create"; payload: NewCommentInput }
	| { type: "update"; id: string; text: string }
	| { type: "delete"; id: string }
	| { type: "unresolve"; id: string }
	| { type: "clear"; origin: string }
	| { type: "setMode"; mode: StoreMode }
	| { type: "status" };

export type PopupRequest =
	| { type: "getTabState"; tabId: number }
	| { type: "armEnable"; tabId: number }
	| { type: "enableTab"; tabId: number }
	| { type: "disableTab"; tabId: number }
	| { type: "testConnection" };

export type ExtensionRequest = ContentRequest | PopupRequest;

export interface ListResponse {
	ok: boolean;
	state: SyncState;
	mode: StoreMode;
	comments: Comment[];
}

export interface CreateResponse {
	ok: boolean;
	buffered: boolean;
	comment: Comment | null;
	state: SyncState;
}

export interface SimpleResponse {
	ok: boolean;
	state: SyncState;
}

export interface TabStateResponse {
	enabled: boolean;
}

export interface TestConnectionResponse {
	state: SyncState;
}
