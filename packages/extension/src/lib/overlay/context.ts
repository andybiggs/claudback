// Shared context for the overlay. The content script builds one of these at
// mount time and threads it through every helper in this folder, replacing the
// single giant closure that used to hold all this state. Fields are mutated in
// place (e.g. refresh reassigns `store`), so every helper sees live values.

import type { Comment, StoreMode } from "@claudback/shared";

import type { SyncState } from "../../messages.js";

export interface Store {
	mode: StoreMode;
	comments: Comment[];
}

// The open popover's anchor: the element it belongs to and the popover's offset
// from that element's rect at open time, so scrolling can carry the popover (and
// the frame) along with the element instead of stranding it.
export interface TransientAnchor {
	el: Element;
	pop: HTMLElement;
	dx: number;
	dy: number;
}

// Where the comment-mode hint banner is docked: three columns (left/center/
// right) across the top or bottom of the viewport. Dragging the hint snaps it
// to whichever of these six it's released closest to.
export type HintPosition =
	| "top-left"
	| "top-center"
	| "top-right"
	| "bottom-left"
	| "bottom-center"
	| "bottom-right";

const HINT_POSITIONS: readonly HintPosition[] = [
	"top-left",
	"top-center",
	"top-right",
	"bottom-left",
	"bottom-center",
	"bottom-right",
];

export function isHintPosition(value: unknown): value is HintPosition {
	return typeof value === "string" && (HINT_POSITIONS as readonly string[]).includes(value);
}

export interface OverlayContext {
	// Static, created once at mount.
	readonly host: HTMLElement;
	readonly shadow: ShadowRoot;
	readonly label: string;
	readonly highlight: HTMLElement;
	readonly localStore: chrome.storage.StorageArea | null;
	readonly convertKey: string;

	// Mutable state, updated in place by the helpers.
	store: Store;
	syncState: SyncState;
	commentMode: boolean;
	panelOpen: boolean;
	settingsOpen: boolean;
	convertComponents: boolean;
	hintPosition: HintPosition;
	anchor: TransientAnchor | null;

	// Lifecycle teardown lives in the content script (it closes over the event
	// listeners it registered); injected here so helpers can trigger it when the
	// extension context is invalidated mid-operation.
	teardown: () => void;
}

export const CONVERT_KEY = "convertComponents";

// Persisted in chrome.storage.local (not the worker store) alongside
// convertComponents, so the hint keeps its dragged-to position across reloads
// and other pages on the same origin.
export const HINT_POSITION_KEY = "hintPosition";
export const DEFAULT_HINT_POSITION: HintPosition = "top-center";

// Carries an "edit this comment" intent across a same-origin navigation: the
// panel stores the comment id here before navigating, and the fresh overlay on
// the destination page resumes the edit. sessionStorage is per-tab and
// per-origin, so the intent can't leak to other tabs or sites.
export const PENDING_EDIT_KEY = "claudback-pending-edit";

export function resolveLocalStore(): chrome.storage.StorageArea | null {
	try {
		return chrome?.storage?.local ?? null;
	} catch {
		return null;
	}
}
