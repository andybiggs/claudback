// Claudback overlay content script.
//
// A framework-agnostic, dependency-free visual-feedback overlay. Mounts into a
// Shadow DOM so the host page's CSS can neither leak in nor be affected. Lets
// you click any element and attach a comment to it; comments are sent to the
// background worker (never the collector directly), which owns the pairing
// token, the offline buffer, and all collector I/O. Ported from the original
// a11y-app widget — the UI is unchanged; only the fetch calls became messages.

import { buildSelector, type Comment, type NewCommentInput, type StoreMode } from "@claudback/shared";

import { excerptFromNames } from "./lib/excerpt.js";
import { parseDetectReply } from "./lib/detect-reply.js";
import { generateNonce } from "./lib/nonce.js";
import type { ContentRequest, CreateResponse, ListResponse, SimpleResponse, SyncState } from "./messages.js";
import { CLAUDE_RESTART_PROMPT } from "./prompts.js";

interface Store {
	mode: StoreMode;
	comments: Comment[];
}

const STYLES = `
:host { all: initial; }
* { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }
:host {
	--ink: #191c1f; --secondary-text: #5c6167; --faint-text: #8b9096; --selector-text: #9ba0a5;
	--border: #e5e7e9; --hairline: #eff1f2; --divider: #f3f4f4;
	--green: #0f8a46; --green-active: #0c6e38; --green-strong: #0c6e38; --green-tint: #eaf5ee;
	--ghost-bg: #f3f4f4; --ghost-text: #43474c;
	--danger: #c0271b; --danger-tint: #fbe9e7;
	--warning-text: #8a5a00; --warning-dot: #c88a04; --warning-bg: #fbf3e0; --warning-border: #f2e4c4;
	--surface: #fff; --shadow-alpha: .25;
}
@media (prefers-color-scheme: dark) {
	:host {
		--ink: #e9ecee; --secondary-text: #9aa1a8; --faint-text: #6e757c; --selector-text: #6e757c;
		--border: #2b3036; --hairline: #2b3036; --divider: #2b3036;
		--green: #0f8a46; --green-active: #0c6e38; --green-strong: #3fc479; --green-tint: rgba(63,196,121,.14);
		--ghost-bg: #2b3036; --ghost-text: #c9ced3;
		--danger: #f08578; --danger-tint: rgba(192,39,27,.18);
		--warning-text: #dfa64a; --warning-dot: #c88a04; --warning-bg: rgba(200,138,4,.14); --warning-border: rgba(200,138,4,.3);
		--surface: #1c1f23; --shadow-alpha: .4;
	}
}
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.mark {
	background: var(--green); border-radius: 50% 50% 50% 3px;
	display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
@media (prefers-color-scheme: dark) {
	.mark { background: #3fc479; }
	.mark::after { background: var(--surface); }
}
.mark::after { content: ""; width: 6px; height: 6px; border-radius: 50%; background: #fff; }
.fabs {
	position: fixed; bottom: 20px; right: 20px; z-index: 2147483647;
	display: flex; align-items: center; gap: 12px;
}
.fab {
	position: relative; width: 52px; height: 52px;
	border-radius: 50%; border: none; cursor: pointer;
	background: var(--green); color: #fff; box-shadow: 0 4px 14px rgba(0,0,0,.25);
	display: flex; align-items: center; justify-content: center; transition: transform .12s ease;
}
.fab:hover { transform: scale(1.06); }
.fab.active { background: var(--green-active); }
.fab.secondary { width: 46px; height: 46px; background: var(--surface); color: var(--green); border: 1px solid var(--border); }
.fab.secondary.active { background: var(--green); color: #fff; border-color: var(--green); }
.fab svg { width: 24px; height: 24px; }
.fab.secondary svg { width: 20px; height: 20px; }
.fab .waypoint-icon { width: 26px; height: 26px; background: #fff; border-radius: 50% 50% 50% 3px; display: flex; align-items: center; justify-content: center; }
.count {
	position: absolute; top: -4px; right: -4px; min-width: 20px; height: 20px;
	padding: 0 5px; border-radius: 10px; background: var(--green); color: #fff; border: 2px solid transparent;
	font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center;
}
.fab.secondary.active .count { background: #fff; color: var(--green); border-color: var(--green); }
.hint {
	position: fixed; top: 20px; left: 50%; transform: translateX(-50%); z-index: 2147483647;
	background: var(--green); color: #fff; padding: 10px 16px; border-radius: 100px;
	font-size: 15px; font-weight: 500; box-shadow: 0 4px 18px rgba(0,0,0,.28); display: flex; align-items: center; gap: 10px;
	white-space: nowrap;
}
.hint.error-toast { background: var(--danger); border-radius: 8px; font-size: 13px; }
.hint .keycap {
	font-size: 12px; font-weight: 600; color: rgba(255,255,255,.9);
	background: rgba(255,255,255,.18); border: 1px solid rgba(255,255,255,.3);
	border-radius: 6px; padding: 2px 8px; line-height: 1.4;
}
.highlight {
	position: fixed; pointer-events: none; z-index: 2147483646;
	border: 2px solid var(--green); background: rgba(15,138,70,.10); border-radius: 4px;
	transition: all .04s linear;
}
.pin {
	position: fixed; z-index: 2147483646; width: 26px; height: 26px; border-radius: 50% 50% 50% 2px;
	background: var(--green); color: #fff; border: 2px solid #fff; cursor: pointer;
	font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center;
	box-shadow: 0 2px 8px rgba(0,0,0,.3); transform: translate(-50%, -100%);
}
.pin.resolved { background: #9ca3af; }
.popover {
	position: fixed; z-index: 2147483647; width: 280px; background: var(--surface); color: var(--ink);
	border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,var(--shadow-alpha)); padding: 12px;
	border: 1px solid var(--border);
}
.popover textarea, .inline-edit textarea {
	width: 100%; min-height: 56px; resize: vertical; border: 1.5px solid var(--border);
	border-radius: 8px; padding: 8px 10px; font-size: 13px; color: var(--ink); background: var(--surface);
}
.popover textarea:focus, .inline-edit textarea:focus { outline: none; border-color: var(--green); }
@media (prefers-color-scheme: dark) {
	.popover textarea:focus, .inline-edit textarea:focus { border-color: #3fc479; }
}
.inline-edit { margin: 5px 0 3px; }
.inline-edit .row { margin-top: 6px; }
.popover .tagchip {
	font-size: 11px; font-weight: 700; background: var(--green-tint); color: var(--green-strong);
	padding: 2px 7px; border-radius: 4px; flex-shrink: 0;
}
.component-pill {
	display: inline-flex; align-items: center; gap: 4px; max-width: 100%; vertical-align: middle;
	font-size: 11px; font-weight: 700; background: var(--green-tint); color: var(--green-strong);
	padding: 2px 7px; border-radius: 4px;
}
.component-pill svg { flex: none; }
.component-pill .pill-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.selector-line .component-pill { flex: 0 1 auto; }
.selector-line .component-pill.path { flex: 1 1 auto; min-width: 0; }
.popover .selector-line { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; min-width: 0; }
.popover .selector-path {
	font-size: 11px; color: var(--faint-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex: 1;
}
.popover .meta { font-size: 11px; color: var(--faint-text); margin: 6px 0; word-break: break-all; }
.row { display: flex; gap: 8px; justify-content: flex-end; margin-top: 10px; }
button.btn { border: none; border-radius: 8px; padding: 7px 13px; font-size: 13px; font-weight: 600; cursor: pointer; }
.btn.primary { background: var(--green); color: #fff; }
.btn.ghost { background: var(--ghost-bg); color: var(--ghost-text); }
.btn.danger { background: var(--danger-tint); color: var(--danger); }
button.btn:disabled { opacity: .5; cursor: default; }
.panel {
	position: fixed; bottom: 84px; right: 20px; width: 330px; max-height: 70vh;
	display: flex; flex-direction: column;
	z-index: 2147483647; background: var(--surface); color: var(--ink); border-radius: 12px;
	box-shadow: 0 8px 30px rgba(0,0,0,var(--shadow-alpha)); border: 1px solid var(--border);
}
.panel > :not(.items) { flex-shrink: 0; }
.panel .items { overflow-y: auto; flex: 1; min-height: 0; }
.panel header { position: relative; padding: 12px 14px; border-bottom: 1px solid var(--hairline); display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.panel header .cog { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 26px; padding: 0; border: 1px solid transparent; border-radius: 6px; background: none; color: var(--faint-text); cursor: pointer; flex-shrink: 0; }
.panel header .cog:hover, .panel header .cog.open { background: var(--surface); color: var(--ink); border-color: var(--border); }
.panel header .identity { display: flex; align-items: center; gap: 9px; min-width: 0; flex: 1; }
.panel header .identity .mark { width: 30px; height: 30px; }
.panel header .identity .mark::after { width: 9px; height: 9px; }
.panel header .identity .text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.panel header .brand-name { font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; font-weight: 600; font-size: 13.5px; white-space: nowrap; }
.panel header .hostname { font-size: 11px; color: var(--faint-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.panel .clear-all { font-size: 12px; font-weight: 600; color: var(--danger); background: var(--danger-tint); border: none; border-radius: 6px; padding: 4px 10px; cursor: pointer; flex-shrink: 0; }
.panel .clear-all:disabled { opacity: .5; cursor: default; }
.panel .sync-strip { display: flex; flex-wrap: wrap; align-items: center; gap: 3px 7px; padding: 8px 14px; font-size: 12px; font-weight: 600; border-bottom: 1px solid var(--warning-border); background: var(--warning-bg); color: var(--warning-text); }
.panel .sync-strip .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--warning-dot); flex-shrink: 0; }
.panel .sync-strip .sync-action { margin-left: 14px; border: none; background: none; padding: 0; font-size: 12px; font-weight: 600; color: var(--warning-text); text-decoration: underline; cursor: pointer; text-align: left; }
.panel .settings-menu { position: absolute; top: 100%; right: 8px; margin-top: 4px; z-index: 20; width: max-content; max-width: 300px; padding: 12px; border-radius: 10px; background: var(--surface); border: 1px solid var(--border); box-shadow: 0 8px 30px rgba(0,0,0,var(--shadow-alpha)); }
.panel .settings-menu select { font-size: 12px; padding: 3px 6px; border-radius: 6px; border: 1px solid var(--border); background: var(--surface); color: var(--ink); }
.panel .settings-menu .settings-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 12px; color: var(--ink); cursor: pointer; }
.panel .settings-menu .settings-row + .settings-row { margin-top: 10px; }
.panel .settings-menu .settings-row > span:first-child { white-space: nowrap; }
.switch { position: relative; flex-shrink: 0; width: 34px; height: 20px; }
.switch input { position: absolute; opacity: 0; width: 0; height: 0; }
.switch .slider { position: absolute; inset: 0; border-radius: 999px; background: var(--border); transition: background .15s; }
.switch .slider::before { content: ""; position: absolute; left: 2px; top: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.3); transition: transform .15s; }
.switch input:checked + .slider { background: var(--green); }
.switch input:checked + .slider::before { transform: translateX(14px); }
.cb-tooltip { position: fixed; z-index: 2147483647; max-width: 360px; padding: 5px 8px; border-radius: 6px; border: 1px solid var(--border); background: var(--surface); color: var(--ink); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; line-height: 1.4; word-break: break-all; box-shadow: 0 8px 30px rgba(0,0,0,var(--shadow-alpha)); opacity: 0; pointer-events: none; transition: opacity .1s; }
.cb-tooltip.show { opacity: 1; }
.cb-tooltip .tip-sep { color: var(--green-strong); font-weight: 700; }
[data-tip] { cursor: pointer; }
.item { padding: 10px 14px; border-bottom: 1px solid var(--divider); }
.item .top { display: flex; align-items: center; gap: 7px; }
.item .num { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; background: var(--green); color: #fff; border-radius: 999px; font-size: 11px; font-weight: 700; flex-shrink: 0; }
.item.resolved .num { background: #9ca3af; }
.item .meta-line { font-size: 11px; color: var(--faint-text); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.item .txt { font-size: 13px; margin: 5px 0 3px; }
.item .ref {
	font-size: 10.5px; color: var(--selector-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.item.resolved .txt, .item.resolved .ref { opacity: .6; }
.item .acts { margin-top: 6px; display: flex; gap: 12px; }
.item .acts a { font-size: 12px; font-weight: 600; color: var(--green); cursor: pointer; }
.item .acts a.del { color: var(--danger); }
.empty { padding: 20px 14px; font-size: 13px; color: var(--faint-text); text-align: center; }
.prompt-footer { padding: 12px 14px; border-top: 1px solid var(--hairline); }
.prompt-footer .label { font-size: 12px; color: var(--faint-text); margin-bottom: 7px; }
.prompt-footer .prompt-row { display: flex; align-items: center; gap: 8px; border: 1px solid var(--border); border-radius: 8px; padding: 7px 10px; background: var(--surface); }
.prompt-footer .prompt-text { flex: 1; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.prompt-footer .copy-prompt { display: flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; color: var(--green-strong); background: var(--green-tint); border: none; border-radius: 6px; padding: 4px 10px; cursor: pointer; flex-shrink: 0; white-space: nowrap; }
.prompt-footer .copy-prompt:hover { background: #d5eddf; }
.prompt-footer .copy-prompt svg { display: block; }
`;

const ADD_ICON = `<span class="waypoint-icon"><svg width="14" height="14" viewBox="0 0 14 14"><line x1="7" y1="4" x2="7" y2="10" stroke="#0F8A46" stroke-width="2" stroke-linecap="round"/><line x1="4" y1="7" x2="10" y2="7" stroke="#0F8A46" stroke-width="2" stroke-linecap="round"/></svg></span>`;
const CLOSE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
const LIST_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`;

// Carries an "edit this comment" intent across a same-origin navigation: the
// panel stores the comment id here before navigating, and the fresh overlay on
// the destination page resumes the edit. sessionStorage is per-tab and
// per-origin, so the intent can't leak to other tabs or sites.
const PENDING_EDIT_KEY = "claudback-pending-edit";

// Clipboard write that also works where navigator.clipboard doesn't exist —
// content scripts on insecure origins (plain-http LAN dev servers) — by
// falling back to a scratch textarea + execCommand("copy"). Returns whether
// the text actually made it onto the clipboard, so callers can surface
// failure instead of showing a false "Copied!".
async function copyToClipboard(text: string): Promise<boolean> {
	try {
		if (navigator.clipboard) {
			await navigator.clipboard.writeText(text);

			return true;
		}
	} catch {
		// e.g. the page's Permissions-Policy blocks clipboard-write, or the
		// document lost focus — try the legacy path below.
	}

	try {
		const scratch = document.createElement("textarea");
		scratch.value = text;
		scratch.style.position = "fixed";
		scratch.style.opacity = "0";
		document.body.append(scratch);
		scratch.select();
		const ok = document.execCommand("copy");
		scratch.remove();

		return ok;
	} catch {
		return false;
	}
}

function send<T>(message: ContentRequest): Promise<T> {
	return chrome.runtime.sendMessage(message) as Promise<T>;
}

interface OkResponse {
	ok: boolean;
}

// The extension was reloaded or updated out from under this page: the
// runtime rejects every message with this exact error. It isn't a real
// failure to report — the orphaned overlay should tear itself down instead.
function isContextInvalidated(error: unknown): boolean {
	return error instanceof Error && error.message.includes("Extension context invalidated");
}

// Sends a message and reports failure uniformly via onError, without ever
// throwing. A thrown "extension context invalidated" error routes to
// onInvalidated instead (when given) so the caller can tear down rather than
// show a misleading "couldn't save" toast for what is really an orphaned
// overlay. Returns whether the call succeeded, so callers can decide what to
// do next.
async function sendGuarded<T extends OkResponse>(
	message: ContentRequest,
	label: string,
	errorMessage: string,
	onError: (message: string) => void,
	onInvalidated?: () => void,
): Promise<boolean> {
	try {
		const res = await send<T>(message);

		if (!res || !res.ok) {
			onError(errorMessage);

			return false;
		}

		return true;
	} catch (error) {
		if (onInvalidated && isContextInvalidated(error)) {
			onInvalidated();

			return false;
		}

		console.error(`[claudback] ${label} failed:`, error);
		onError(errorMessage);

		return false;
	}
}

function mountClaudback(): void {
	if (typeof window === "undefined" || typeof document === "undefined") {
		return;
	}

	if (document.getElementById("claudback-root")) {
		return;
	}

	const label = window.location.hostname;

	const host = document.createElement("div");
	host.id = "claudback-root";
	const shadow = host.attachShadow({ mode: "open" });
	const style = document.createElement("style");
	style.textContent = STYLES;
	shadow.append(style);
	document.body.append(host);

	// Custom tooltip: one node, event-delegated off the shadow root (which
	// survives re-renders) so any [data-tip] element gets a styled, untruncated
	// hover label instead of the browser's native title.
	const tooltip = document.createElement("div");
	tooltip.className = "cb-tooltip";

	function showTooltip(target: Element): void {
		const text = target.getAttribute("data-tip");

		if (!text) {
			return;
		}

		// Escape first, then paint the path separators (component "›" and CSS ">")
		// green so the breadcrumb reads as segments.
		tooltip.innerHTML = escapeHtml(text)
			.replace(/ › /g, ' <span class="tip-sep">›</span> ')
			.replace(/ &gt; /g, ' <span class="tip-sep">&gt;</span> ');

		// render() nukes every non-style shadow node, so re-attach on demand.
		if (!tooltip.isConnected) {
			shadow.append(tooltip);
		}

		tooltip.classList.add("show");

		const anchor = target.getBoundingClientRect();
		const tip = tooltip.getBoundingClientRect();
		const left = Math.max(8, Math.min(anchor.left, window.innerWidth - tip.width - 8));
		const above = anchor.top - tip.height - 6;
		const top = above < 8 ? anchor.bottom + 6 : above;

		tooltip.style.left = `${left}px`;
		tooltip.style.top = `${top}px`;
	}

	shadow.addEventListener("mouseover", (ev) => {
		const target = (ev.target as HTMLElement).closest?.("[data-tip]");

		if (target) {
			showTooltip(target);
		}
	});

	shadow.addEventListener("mouseout", (ev) => {
		if ((ev.target as HTMLElement).closest?.("[data-tip]")) {
			tooltip.classList.remove("show");
		}
	});

	let store: Store = { mode: "clear", comments: [] };
	let syncState: SyncState = "synced";
	let commentMode = false;
	let panelOpen = false;
	let settingsOpen = false;
	// Setting (persisted in chrome.storage.local, not the worker store): when on,
	// list/composer/pin swap raw HTML tags + selectors for mapped component names
	// and the component tree. Off = raw HTML everywhere.
	let convertComponents = true;

	const CONVERT_KEY = "convertComponents";
	const localStore = (() => {
		try {
			return chrome?.storage?.local ?? null;
		} catch {
			return null;
		}
	})();

	function persistConvert(): void {
		try {
			localStore?.set({ [CONVERT_KEY]: convertComponents });
		} catch {
			// Storage can be unavailable if the extension is being torn down; the
			// in-memory value still drives this session's rendering.
		}
	}

	// --- worker I/O ---------------------------------------------------------

	async function refresh(): Promise<void> {
		let res: ListResponse | undefined;

		try {
			res = await send<ListResponse>({ type: "list", origin: window.location.origin });
		} catch {
			// The extension was reloaded or updated out from under this page,
			// so this orphaned copy can never reach the worker again. Remove
			// the overlay; re-enabling injects a fresh script that can.
			teardown();

			return;
		}

		if (res && res.ok) {
			store = { mode: res.mode, comments: res.comments };
			syncState = res.state;
		}

		render();
	}

	// A short-lived toast for failed saves/deletes. render() tears down every
	// non-style shadow node, so it also disappears on the next re-render —
	// that's fine, it only needs to be seen once.
	function showError(message: string): void {
		shadow.querySelectorAll(".error-toast").forEach((node) => {
			node.remove();
		});

		const toast = document.createElement("div");
		toast.className = "hint error-toast";
		toast.textContent = message;
		shadow.append(toast);
		setTimeout(() => {
			toast.remove();
		}, 4000);
	}

	// --- element capture ----------------------------------------------------

	const highlight = document.createElement("div");
	highlight.className = "highlight";
	highlight.style.display = "none";

	function frameElement(el: Element): void {
		const rect = el.getBoundingClientRect();
		highlight.style.display = "block";
		highlight.style.left = `${rect.left}px`;
		highlight.style.top = `${rect.top}px`;
		highlight.style.width = `${rect.width}px`;
		highlight.style.height = `${rect.height}px`;
	}

	// The open popover's anchor: the element it belongs to and the popover's
	// offset from that element's rect at open time, so scrolling can carry the
	// popover (and the frame) along with the element instead of stranding it.
	let anchor: { el: Element; pop: HTMLElement; dx: number; dy: number } | null = null;

	function anchorTransient(el: Element, pop: HTMLElement): void {
		const rect = el.getBoundingClientRect();
		anchor = {
			el,
			pop,
			dx: parseFloat(pop.style.left) - rect.left,
			dy: parseFloat(pop.style.top) - rect.top,
		};
		frameElement(el);
	}

	function repositionTransient(): void {
		if (!anchor) {
			return;
		}

		const rect = anchor.el.getBoundingClientRect();
		let left = rect.left + anchor.dx;
		let top = rect.top + anchor.dy;

		// While the element is on screen, keep the popover on screen too — an
		// element taller than the viewport puts the anchored offset far outside
		// the visible area even though the element itself fills the screen.
		// Only once the element leaves the viewport may the popover follow it
		// out, and only off the top/left — the right/bottom clamps always
		// apply, as they did before this branch existed.
		const onScreen =
			rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;

		if (onScreen) {
			left = Math.max(10, Math.min(left, window.innerWidth - 300));
			top = Math.max(10, Math.min(top, window.innerHeight - 200));
		} else {
			left = Math.min(left, window.innerWidth - 300);
			top = Math.min(top, window.innerHeight - 200);
		}

		anchor.pop.style.left = `${left}px`;
		anchor.pop.style.top = `${top}px`;
		frameElement(anchor.el);
	}

	// Scrolls so the element's top lands about 30% down the viewport — in view
	// with some context above it, and for elements taller than the viewport it
	// keeps the top (and the popover's clamped position) on screen where
	// centering would not. scrollIntoView (rather than window.scrollBy) so
	// scrollable ancestors inside the page get scrolled too; the temporary
	// scroll-margin-top supplies the 30% offset, which block: "start" alone
	// can't express.
	function scrollCommentIntoView(el: Element): void {
		if (!(el instanceof HTMLElement)) {
			el.scrollIntoView({ block: "start", behavior: "smooth" });

			return;
		}

		const previous = el.style.scrollMarginTop;
		el.style.scrollMarginTop = `${Math.round(window.innerHeight * 0.3)}px`;
		el.scrollIntoView({ block: "start", behavior: "smooth" });
		// The scroll target is computed at the call above; restore on the next
		// frame so the margin never leaks into the page's own styling.
		requestAnimationFrame(() => {
			el.style.scrollMarginTop = previous;
		});
	}

	function elementAtPoint(x: number, y: number): Element | null {
		host.style.pointerEvents = "none";
		const el = document.elementFromPoint(x, y);
		host.style.pointerEvents = "";

		return el && el !== document.body && el !== document.documentElement ? el : null;
	}

	function onMouseMove(event: MouseEvent): void {
		// While a popover is open the frame marks its anchor element — leave it.
		if (shadow.querySelector(".transient")) {
			return;
		}

		if (!commentMode) {
			highlight.style.display = "none";

			return;
		}

		const el = elementAtPoint(event.clientX, event.clientY);

		if (!el) {
			highlight.style.display = "none";

			return;
		}

		const rect = el.getBoundingClientRect();
		highlight.style.display = "block";
		highlight.style.left = `${rect.left}px`;
		highlight.style.top = `${rect.top}px`;
		highlight.style.width = `${rect.width}px`;
		highlight.style.height = `${rect.height}px`;
	}

	function onClickCapture(event: MouseEvent): void {
		if (!commentMode) {
			return;
		}

		if (event.composedPath().includes(host)) {
			return;
		}

		if (shadow.querySelector(".transient")) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();

		const el = elementAtPoint(event.clientX, event.clientY);

		if (!el) {
			return;
		}

		openComposer(el, event.clientX, event.clientY);
	}

	// --- composer (new comment) --------------------------------------------

	const DETECT_TIMEOUT_MS = 100;

	function requestComponentInfo(
		el: Element,
	): Promise<{ framework: string; components: string[] } | null> {
		// Component detection is best-effort: this promise must never reject, or
		// callers awaiting it (e.g. the save handler) would throw before the
		// comment is ever sent. Any failure here degrades to null instead.
		return new Promise((resolve) => {
			try {
				const nonce = generateNonce(crypto);

				const finish = (value: { framework: string; components: string[] } | null): void => {
					document.removeEventListener("claudback:detect-result", onResult);
					el.removeAttribute("data-claudback-probe");
					clearTimeout(timer);
					resolve(value);
				};

				const onResult = (event: Event): void => {
					try {
						const reply = parseDetectReply((event as CustomEvent<unknown>).detail, nonce);

						if (reply) {
							finish(reply);
						}
						// Wrong nonce/shape: keep listening until our reply or timeout.
					} catch {
						finish(null);
					}
				};

				const timer = setTimeout(() => finish(null), DETECT_TIMEOUT_MS);

				document.addEventListener("claudback:detect-result", onResult);
				el.setAttribute("data-claudback-probe", nonce);
				document.dispatchEvent(new CustomEvent("claudback:detect", { detail: nonce }));
			} catch {
				resolve(null);
			}
		});
	}

	function openComposer(el: Element, x: number, y: number): void {
		const componentPromise = requestComponentInfo(el);
		clearTransient();

		const pop = document.createElement("div");
		pop.className = "popover transient";
		pop.style.left = `${Math.min(x, window.innerWidth - 300)}px`;
		pop.style.top = `${Math.min(y, window.innerHeight - 200)}px`;

		const selector = buildSelector(el);
		const tag = el.tagName.toLowerCase();
		pop.innerHTML = `
			<div class="selector-line">
				<span class="tagchip mono">&lt;${escapeHtml(tag)}&gt;</span>
				<span class="selector-path mono" data-tip="${escapeHtml(selector)}">${escapeHtml(selector)}</span>
			</div>
			<textarea placeholder="What needs fixing here?"></textarea>
			<div class="row">
				<button class="btn ghost" data-act="cancel">Cancel</button>
				<button class="btn primary" data-act="save">Add comment</button>
			</div>`;
		shadow.append(pop);
		anchorTransient(el, pop);

		void componentPromise.then((component) => {
			// Setting off: leave the raw <tag> + selector, no component name in the
			// picker at all.
			if (!convertComponents || !component || !component.components.length || !pop.isConnected) {
				return;
			}

			// Setting on: swap the raw <tag> + selector for just the component name
			// pill (no path in the picker).
			const line = pop.querySelector(".selector-line");

			if (line) {
				line.innerHTML = componentNamePill(component.framework, component.components);
			}
		}).catch((error) => {
			// The promise itself never rejects; this guards the render callback.
			console.warn("[claudback] component render failed:", error);
		});

		const textarea = pop.querySelector("textarea") as HTMLTextAreaElement;
		textarea.focus();

		textarea.addEventListener("keydown", (ev) => {
			if (ev.key === "Enter" && ev.shiftKey) {
				ev.preventDefault();
				(pop.querySelector("[data-act='save']") as HTMLButtonElement)?.click();
			}
		});

		pop.addEventListener("click", async (ev) => {
			const act = (ev.target as HTMLElement).dataset?.act;

			if (act === "cancel") {
				clearTransient();
			}

			if (act === "save") {
				const text = textarea.value.trim();

				if (!text) {
					return;
				}

				const component = await componentPromise;

				// Keep the composer (and the typed text) open on failure — an
				// "Extension context invalidated" rejection must not eat the comment.
				const ok = await sendGuarded<CreateResponse>(
					{ type: "create", payload: buildPayload(el, selector, text, component) },
					"create",
					"Couldn't save — comment not stored.",
					showError,
					teardown,
				);

				if (ok) {
					clearTransient();
					await refresh();
				}
			}
		});
	}

	function buildPayload(
		el: Element,
		selector: string,
		text: string,
		component: { framework: string; components: string[] } | null,
	): NewCommentInput {
		const rect = el.getBoundingClientRect();

		return {
			origin: window.location.origin,
			url: window.location.href,
			selector,
			tag: el.tagName.toLowerCase(),
			text,
			textSnippet: (el.textContent || "").trim().slice(0, 512),
			// Names only — no attribute values ever leave the page.
			htmlExcerpt: excerptFromNames(el.tagName, el.getAttributeNames()),
			framework: component?.framework ?? null,
			componentPath: component?.components ?? [],
			rect: {
				x: rect.left + window.scrollX,
				y: rect.top + window.scrollY,
				width: rect.width,
				height: rect.height,
			},
			viewport: { width: window.innerWidth, height: window.innerHeight },
		};
	}

	// --- pin popover (edit / delete existing) ------------------------------

	function openPinPopover(comment: Comment, el: Element): void {
		clearTransient();

		const rect = el.getBoundingClientRect();
		const pop = document.createElement("div");
		pop.className = "popover transient";
		// Anchor at the element's bottom-left corner, unclamped — the anchor
		// offset must describe the true tie point so the popover tracks the
		// bottom edge as the element moves. repositionTransient below applies
		// the on-screen clamping for display.
		pop.style.left = `${rect.left}px`;
		pop.style.top = `${rect.bottom + 6}px`;
		const pinPath = convertComponents ? comment.componentPath ?? [] : [];
		const resolvedSuffix = comment.resolved ? " · resolved" : "";
		const pinHead =
			pinPath.length > 0
				? `<div class="selector-line">${componentNamePill(comment.framework ?? "", pinPath, componentTreeText(pinPath))}</div>${comment.resolved ? `<div class="meta mono">resolved</div>` : ""}`
				: `<div class="meta mono" data-tip="${escapeHtml(comment.selector)}">${escapeHtml(comment.selector)}${resolvedSuffix}</div>`;
		pop.innerHTML = `
			${pinHead}
			<textarea>${escapeHtml(comment.text)}</textarea>
			<div class="row">
				<button class="btn danger" data-act="delete">Delete</button>
				<button class="btn ghost" data-act="cancel">Close</button>
				<button class="btn primary" data-act="save">Save</button>
			</div>`;
		shadow.append(pop);
		anchorTransient(el, pop);
		repositionTransient();

		const textarea = pop.querySelector("textarea") as HTMLTextAreaElement;

		pop.addEventListener("click", async (ev) => {
			const act = (ev.target as HTMLElement).dataset?.act;

			if (act === "cancel") {
				clearTransient();
			}

			if (act === "delete") {
				const ok = await sendGuarded<SimpleResponse>(
					{ type: "delete", id: comment.id },
					"delete",
					"Couldn't delete — change not stored.",
					showError,
					teardown,
				);

				if (ok) {
					clearTransient();
					await refresh();
				}
			}

			if (act === "save") {
				const text = textarea.value.trim();

				if (!text) {
					clearTransient();

					return;
				}

				const ok = await sendGuarded<SimpleResponse>(
					{ type: "update", id: comment.id, text },
					"update",
					"Couldn't save — change not stored.",
					showError,
					teardown,
				);

				if (ok) {
					clearTransient();
					await refresh();
				}
			}
		});
	}

	// --- rendering ----------------------------------------------------------

	function clearTransient(): void {
		shadow.querySelectorAll(".transient").forEach((node) => {
			node.remove();
		});
		anchor = null;
		highlight.style.display = "none";
	}

	function setCommentMode(on: boolean): void {
		commentMode = on;
		highlight.style.display = "none";
		render();
	}

	function statusLabel(): string | null {
		switch (syncState) {
			case "unpaired": {
				return "Claudback isn't set up on this computer yet.";
			}
			case "offline": {
				return "Can't reach the local Claudback server.";
			}
			case "unauthorized": {
				return "Pairing token rejected — re-pair from the extension options page.";
			}
			case "pending": {
				return "Syncing buffered comments…";
			}
			default: {
				return null;
			}
		}
	}

	function render(): void {
		// The teardown below removes any open popover node, so drop the anchor
		// tracking with it or a later scroll would reposition a detached node.
		anchor = null;
		highlight.style.display = "none";

		shadow.querySelectorAll(":not(style):not(link)").forEach((node) => {
			node.remove();
		});
		shadow.append(highlight);

		const fabs = document.createElement("div");
		fabs.className = "fabs";

		const listBtn = document.createElement("button");
		listBtn.className = `fab secondary${panelOpen ? " active" : ""}`;
		listBtn.innerHTML = LIST_ICON;
		listBtn.title = panelOpen ? "Hide comments" : "Show comments";

		if (store.comments.length > 0) {
			const badge = document.createElement("span");
			badge.className = "count";
			badge.textContent = String(store.comments.length);
			listBtn.append(badge);
		}

		listBtn.addEventListener("click", () => {
			panelOpen = !panelOpen;
			render();
		});

		const addBtn = document.createElement("button");
		addBtn.className = `fab${commentMode ? " active" : ""}`;
		addBtn.innerHTML = commentMode ? CLOSE_ICON : ADD_ICON;
		addBtn.title = commentMode ? "Exit comment mode" : "Add a comment";
		addBtn.addEventListener("click", () => {
			setCommentMode(!commentMode);
		});

		fabs.append(listBtn, addBtn);
		shadow.append(fabs);

		if (commentMode) {
			const hint = document.createElement("div");
			hint.className = "hint";
			hint.innerHTML = 'Click any element to comment <span class="keycap">esc</span>';
			shadow.append(hint);
		}

		if (panelOpen) {
			renderPanel();
		}

		renderPins();
	}

	function renderPanel(): void {
		const panel = document.createElement("div");
		panel.className = "panel";

		const header = document.createElement("header");
		header.innerHTML = `
			<div class="identity">
				<span class="mark"></span>
				<div class="text">
					<span class="brand-name">Claudback</span>
					<span class="hostname mono" title="${escapeHtml(label)}">${escapeHtml(label)}</span>
				</div>
			</div>`;
		const clearAllBtn = document.createElement("button");
		clearAllBtn.className = "clear-all";
		clearAllBtn.textContent = "Clear all";
		clearAllBtn.disabled = store.comments.length === 0;
		clearAllBtn.addEventListener("click", async () => {
			try {
				const res = await send<SimpleResponse>({ type: "clear", origin: window.location.origin });

				await refresh();

				if (!res || !res.ok) {
					showError("Couldn't clear — comments not removed.");
				}
			} catch (error) {
				if (isContextInvalidated(error)) {
					teardown();

					return;
				}

				console.error("[claudback] clear failed:", error);
				showError("Couldn't clear — comments not removed.");
			}
		});
		const cog = document.createElement("button");
		cog.className = `cog${settingsOpen ? " open" : ""}`;
		cog.setAttribute("aria-label", "Settings");
		cog.title = "Settings";
		cog.innerHTML = COG_ICON;
		cog.addEventListener("click", () => {
			settingsOpen = !settingsOpen;
			render();
		});
		header.append(cog);
		header.append(clearAllBtn);

		if (settingsOpen) {
			// Absolute popover anchored to the header — floats over the list instead
			// of pushing it down. Holds the "after Claude reads" mode + view toggle.
			const menu = document.createElement("div");
			menu.className = "settings-menu";

			const modeRow = document.createElement("label");
			modeRow.className = "settings-row";
			modeRow.innerHTML = "<span>After Claude reads</span>";
			const modeSelect = document.createElement("select");
			modeSelect.innerHTML = `
				<option value="clear">Clear comments</option>
				<option value="keep">Keep comments</option>`;
			modeSelect.value = store.mode;
			modeSelect.addEventListener("change", async () => {
				try {
					const res = await send<SimpleResponse>({ type: "setMode", mode: modeSelect.value as StoreMode });

					await refresh();

					if (!res || !res.ok) {
						showError("Couldn't change mode — change not stored.");
					}
				} catch (error) {
					if (isContextInvalidated(error)) {
						teardown();

						return;
					}

					console.error("[claudback] setMode failed:", error);
					showError("Couldn't change mode — change not stored.");
				}
			});
			modeRow.append(modeSelect);
			menu.append(modeRow);

			const switchRow = document.createElement("label");
			switchRow.className = "settings-row";
			switchRow.innerHTML = `
				<span>Convert HTML to Component Names</span>
				<span class="switch">
					<input type="checkbox" ${convertComponents ? "checked" : ""}>
					<span class="slider"></span>
				</span>`;
			const toggle = switchRow.querySelector("input") as HTMLInputElement;
			toggle.addEventListener("change", () => {
				convertComponents = toggle.checked;
				persistConvert();
				render();
			});
			menu.append(switchRow);

			header.append(menu);
		}

		panel.append(header);

		const syncLabel = statusLabel();

		if (syncLabel !== null) {
			const status = document.createElement("div");
			status.className = "sync-strip";
			status.innerHTML = `<span class="dot"></span>${escapeHtml(syncLabel)}`;

			if (syncState === "offline") {
				const action = document.createElement("button");
				action.className = "sync-action";
				action.textContent = "Copy restart prompt for Claude";
				action.addEventListener("click", async () => {
					if (await copyToClipboard(CLAUDE_RESTART_PROMPT)) {
						action.textContent = "Copied!";
						setTimeout(() => {
							action.textContent = "Copy restart prompt for Claude";
						}, 1500);
					} else {
						showError("Couldn't copy — this page blocks clipboard access.");
					}
				});
				status.append(action);
			} else if (syncState === "unpaired") {
				const action = document.createElement("button");
				action.className = "sync-action";
				action.textContent = "Open setup guide";
				action.addEventListener("click", () => {
					void sendGuarded<SimpleResponse>(
						{ type: "openOnboarding" },
						"openOnboarding",
						"Couldn't open the setup guide.",
						showError,
						teardown,
					);
				});
				status.append(action);
			}

			panel.append(status);
		}

		// Header, sync strip, and mode stay pinned; only this list scrolls, so
		// Clear all and the prompt footer are always reachable.
		const items = document.createElement("div");
		items.className = "items";
		panel.append(items);

		if (store.comments.length === 0) {
			const empty = document.createElement("div");
			empty.className = "empty";
			empty.textContent = "No comments yet. Turn on comment mode, then click an element.";
			items.append(empty);
		}

		store.comments.forEach((comment, index) => {
			const item = document.createElement("div");
			item.className = `item${comment.resolved ? " resolved" : ""}`;
			const onThisPage = comment.url === window.location.href;
			// Empty path forces the helpers' raw HTML fallback when the setting is
			// off or the element was never mapped to a component.
			const path = convertComponents ? comment.componentPath ?? [] : [];
			item.innerHTML = `
				<div class="top">
					<span class="num">${index + 1}</span>
					<span class="meta-line">${componentNameHtml(comment.framework ?? "", path, comment.tag)} · ${onThisPage ? "this page" : escapeHtml(shortUrl(comment.url))}${comment.resolved ? " · resolved" : ""}</span>
				</div>
				<div class="txt">${escapeHtml(comment.text)}</div>
				<div class="ref mono" data-tip="${escapeHtml(pathTipText(path, comment.selector))}">${componentTreeHtml(comment.framework ?? "", path, comment.selector)}</div>
				<div class="acts">
					${comment.resolved ? `<a data-act="unresolve">Unresolve</a>` : `<a data-act="edit">Edit</a>`}
					<a class="del" data-act="delete">Delete</a>
				</div>`;
			item.addEventListener("click", async (ev) => {
				const act = (ev.target as HTMLElement).dataset?.act;

				if (act === "delete") {
					try {
						const res = await send<SimpleResponse>({ type: "delete", id: comment.id });

						await refresh();

						if (!res || !res.ok) {
							showError("Couldn't delete — change not stored.");
						}
					} catch (error) {
						if (isContextInvalidated(error)) {
							teardown();

							return;
						}

						console.error("[claudback] delete failed:", error);
						showError("Couldn't delete — change not stored.");
					}
				}

				if (act === "unresolve") {
					try {
						const res = await send<SimpleResponse>({ type: "unresolve", id: comment.id });

						await refresh();

						if (!res || !res.ok) {
							showError("Couldn't unresolve — change not stored.");
						}
					} catch (error) {
						if (isContextInvalidated(error)) {
							teardown();

							return;
						}

						console.error("[claudback] unresolve failed:", error);
						showError("Couldn't unresolve — change not stored.");
					}
				}

				if (act === "edit") {
					const onThisPage = comment.url === window.location.href;
					const el = onThisPage ? resolveElement(comment.selector) : null;

					if (el) {
						scrollCommentIntoView(el);
						openPinPopover(comment, el);
					} else if (!onThisPage) {
						// The comment lives on another page of this origin —
						// navigate there and let the freshly injected overlay
						// pick the edit back up via sessionStorage.
						try {
							sessionStorage.setItem(PENDING_EDIT_KEY, comment.id);
						} catch (error) {
							// Storage unavailable (e.g. blocked) — fall back to
							// editing in place rather than losing the click.
							console.error("[claudback] sessionStorage unavailable:", error);
							openInlineEdit(item, comment);

							return;
						}
						window.location.href = comment.url;
					} else {
						// On the right page but the element is gone, so there's
						// nothing to anchor a popover to — edit in place.
						openInlineEdit(item, comment);
					}
				}
			});
			items.append(item);
		});

		if (store.comments.length > 0) {
			const PROMPT = "Grab my Claudback comments";
			const footer = document.createElement("div");
			footer.className = "prompt-footer";
			footer.innerHTML = `
				<div class="label">Got your comments sorted? Ask Claude:</div>
				<div class="prompt-row">
					<span class="prompt-text">${escapeHtml(PROMPT)}</span>
					<button class="copy-prompt">
						<svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
							<rect x="5" y="5" width="9" height="9" rx="2" stroke="currentColor" stroke-width="1.5"/>
							<path d="M11 5V3a2 2 0 0 0-2-2H3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
						</svg>
						Copy
					</button>
				</div>`;
			footer.querySelector(".copy-prompt")?.addEventListener("click", async () => {
				if (!(await copyToClipboard(PROMPT))) {
					showError("Couldn't copy — this page blocks clipboard access.");
				}
			});
			panel.append(footer);
		}

		shadow.append(panel);
	}

	function openInlineEdit(item: HTMLElement, comment: Comment): void {
		if (item.querySelector(".inline-edit")) {
			return;
		}

		const txt = item.querySelector(".txt") as HTMLElement;
		const acts = item.querySelector(".acts") as HTMLElement;
		txt.style.display = "none";
		acts.style.display = "none";

		const editor = document.createElement("div");
		editor.className = "inline-edit";
		editor.innerHTML = `
			<textarea>${escapeHtml(comment.text)}</textarea>
			<div class="row">
				<button class="btn ghost" data-act="cancel-edit">Cancel</button>
				<button class="btn primary" data-act="save-edit">Save</button>
			</div>`;
		txt.after(editor);

		const textarea = editor.querySelector("textarea") as HTMLTextAreaElement;
		textarea.focus();

		textarea.addEventListener("keydown", (ev) => {
			if (ev.key === "Enter" && ev.shiftKey) {
				ev.preventDefault();
				(editor.querySelector("[data-act='save-edit']") as HTMLButtonElement)?.click();
			}
		});

		editor.addEventListener("click", async (ev) => {
			const act = (ev.target as HTMLElement).dataset?.act;

			if (act === "cancel-edit") {
				render();
			}

			if (act === "save-edit") {
				const text = textarea.value.trim();

				if (!text) {
					return;
				}

				const ok = await sendGuarded<SimpleResponse>(
					{ type: "update", id: comment.id, text },
					"update",
					"Couldn't save — change not stored.",
					showError,
					teardown,
				);

				if (ok) {
					await refresh();
				}
			}
		});
	}

	function renderPins(): void {
		shadow.querySelectorAll(".pin").forEach((node) => {
			node.remove();
		});

		store.comments.forEach((comment, index) => {
			if (comment.url !== window.location.href) {
				return;
			}

			const el = resolveElement(comment.selector);

			if (!el) {
				return;
			}

			const rect = el.getBoundingClientRect();
			const pin = document.createElement("button");
			pin.className = `pin${comment.resolved ? " resolved" : ""}`;
			pin.textContent = comment.resolved ? "✓" : String(index + 1);
			pin.style.left = `${rect.left + 12}px`;
			pin.style.top = `${rect.top}px`;
			pin.addEventListener("click", () => openPinPopover(comment, el));
			shadow.append(pin);
		});
	}

	function resolveElement(selector: string): Element | null {
		try {
			return document.querySelector(selector);
		} catch {
			return null;
		}
	}

	// --- wiring -------------------------------------------------------------

	const keydownHandler = (event: KeyboardEvent): void => {
		if (event.key === "Escape" && commentMode) {
			setCommentMode(false);
		}
	};

	// While a popover is open the page must not react to clicks — a stray
	// click following a link would strand the half-written comment. Scrolling
	// stays free; repositionTransient keeps the popover with its element.
	const blockPageClicks = (event: Event): void => {
		if (!shadow.querySelector(".popover.transient")) {
			return;
		}

		if (event.composedPath().includes(host)) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();
	};

	let raf = 0;
	const reposition = (): void => {
		cancelAnimationFrame(raf);
		raf = requestAnimationFrame(() => {
			renderPins();
			repositionTransient();
		});
	};

	// The store can change out-of-band (Claude reads and clears, or the file is
	// edited directly). We aren't notified, so re-sync when the tab regains
	// focus — but not while a composer is open, since render() tears down every
	// shadow node except <style>, which would close it mid-edit.
	function backgroundRefresh(): void {
		if (document.visibilityState !== "visible") {
			return;
		}

		if (shadow.querySelector(".transient, .inline-edit")) {
			return;
		}

		void refresh();
	}

	const unmountHandler = (message: { type?: string }): void => {
		if (message?.type === "unmount") {
			teardown();
		}
	};

	let tornDown = false;

	function teardown(): void {
		if (tornDown) {
			return;
		}

		tornDown = true;

		window.removeEventListener("mousemove", onMouseMove);
		window.removeEventListener("click", onClickCapture, true);
		window.removeEventListener("pointerdown", blockPageClicks, true);
		window.removeEventListener("mousedown", blockPageClicks, true);
		window.removeEventListener("click", blockPageClicks, true);
		window.removeEventListener("auxclick", blockPageClicks, true);
		window.removeEventListener("keydown", keydownHandler);
		window.removeEventListener("scroll", reposition, true);
		window.removeEventListener("resize", reposition);
		document.removeEventListener("visibilitychange", backgroundRefresh);
		window.removeEventListener("focus", backgroundRefresh);

		try {
			// chrome.runtime itself can throw "Extension context invalidated"
			// on touch once the extension has been reloaded or updated — this
			// is the very case teardown() exists to handle, so it must not be
			// able to throw its way out of running.
			chrome.runtime.onMessage.removeListener(unmountHandler);
		} catch {
			// Nothing to remove from — the runtime is already gone.
		}

		host.remove();
	}

	window.addEventListener("mousemove", onMouseMove);
	window.addEventListener("click", onClickCapture, true);
	window.addEventListener("pointerdown", blockPageClicks, true);
	window.addEventListener("mousedown", blockPageClicks, true);
	window.addEventListener("click", blockPageClicks, true);
	window.addEventListener("auxclick", blockPageClicks, true);
	window.addEventListener("keydown", keydownHandler);
	window.addEventListener("scroll", reposition, true);
	window.addEventListener("resize", reposition);
	document.addEventListener("visibilitychange", backgroundRefresh);
	window.addEventListener("focus", backgroundRefresh);

	try {
		chrome.runtime.onMessage.addListener(unmountHandler);
	} catch {
		// The context was invalidated between injection and this line — an
		// unlikely race, but teardown() below still runs the DOM cleanup.
		teardown();

		return;
	}

	// Finishes an edit that started on another page: find the pending comment
	// and open its popover. The target element may render late (client-side
	// hydration), so retry briefly before giving up and opening the panel.
	function resumePendingEdit(): void {
		let id: string | null = null;

		try {
			id = sessionStorage.getItem(PENDING_EDIT_KEY);

			if (id !== null) {
				sessionStorage.removeItem(PENDING_EDIT_KEY);
			}
		} catch (error) {
			console.error("[claudback] sessionStorage unavailable:", error);

			return;
		}

		if (id === null) {
			return;
		}

		const comment = store.comments.find((candidate) => candidate.id === id);

		if (!comment) {
			// Cleared out-of-band during the navigation (e.g. Claude read and
			// cleared it) — say so rather than landing the user on a page with
			// no acknowledgment of their click.
			showError("That comment is gone — it may have been cleared after Claude read it.");

			return;
		}

		let tries = 0;
		const attempt = (): void => {
			if (!host.isConnected) {
				return;
			}

			const el = resolveElement(comment.selector);

			if (el) {
				scrollCommentIntoView(el);
				openPinPopover(comment, el);

				return;
			}

			tries += 1;

			if (tries < 10) {
				setTimeout(attempt, 300);
			} else {
				// The element never appeared — show the panel so the comment
				// is still reachable for an inline edit. showError after
				// render(), which tears down every non-style shadow node.
				panelOpen = true;
				render();
				showError("Couldn't find that element on this page — edit the comment from the panel.");
			}
		};

		attempt();
	}

	function start(): void {
		void refresh().then(resumePendingEdit);
	}

	if (localStore) {
		localStore.get(CONVERT_KEY, (values) => {
			if (typeof values?.[CONVERT_KEY] === "boolean") {
				convertComponents = values[CONVERT_KEY];
			}

			start();
		});
	} else {
		start();
	}
}

// 12px inline framework marks, currentColor so they follow chip text color.
const FRAMEWORK_ICONS: Record<string, string> = {
	react:
		'<svg viewBox="-11 -11 22 22" width="12" height="12" aria-hidden="true"><circle r="2" fill="currentColor"/><g stroke="currentColor" fill="none"><ellipse rx="10" ry="4.2"/><ellipse rx="10" ry="4.2" transform="rotate(60)"/><ellipse rx="10" ry="4.2" transform="rotate(120)"/></g></svg>',
	vue:
		'<svg viewBox="0 0 24 22" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M14.8 0L12 4.8 9.2 0H0l12 21 12-21h-9.2zM3.6 2.1h3.2L12 11l5.2-8.9h3.2L12 16.9 3.6 2.1z"/></svg>',
};

// Green pill holding the nearest component name + framework icon, e.g. "⚛ <Button>".
// Pass `tip` to attach a hover tooltip (used in the pin popover to surface the
// full component path); omit it elsewhere so name pills stay tooltip-free.
function componentNamePill(framework: string, components: string[], tip = ""): string {
	const icon = FRAMEWORK_ICONS[framework] ?? "";
	const tipAttr = tip ? ` data-tip="${escapeHtml(tip)}"` : "";

	return `<span class="component-pill mono"${tipAttr}>${icon}<span class="pill-text">&lt;${escapeHtml(components[0])}&gt;</span></span>`;
}

// Single green pill holding the whole root → leaf component tree (icon once),
// truncating with ellipsis; the full breadcrumb lives in the tooltip.
function componentPathPill(framework: string, components: string[]): string {
	const icon = FRAMEWORK_ICONS[framework] ?? "";
	const tree = componentTreeText(components);

	return `<span class="component-pill path mono" data-tip="${escapeHtml(tree)}">${icon}<span class="pill-text">${escapeHtml(tree)}</span></span>`;
}

// List name cell: nearest component name pill, or raw HTML tag when unmapped/off.
function componentNameHtml(framework: string, components: string[], tag: string): string {
	if (components.length === 0) {
		return `<span class="mono">${escapeHtml(tag)}</span>`;
	}

	return componentNamePill(framework, components);
}

// Path cell body: single component-tree pill, or the raw DOM selector when
// unmapped/off. Untruncated text lives in the tooltip either way.
function componentTreeHtml(framework: string, components: string[], selector: string): string {
	if (components.length === 0) {
		return escapeHtml(selector);
	}

	return componentPathPill(framework, components);
}

// Plain (un-escaped) root → leaf breadcrumb of a component path, e.g.
// "<App> › <Layout> › <Button>". Feeds both the pill body and its tooltip.
function componentTreeText(components: string[]): string {
	return components
		.slice()
		.reverse()
		.map((name) => `<${name}>`)
		.join(" › ");
}

// Untruncated tooltip text for a path cell: the component tree when converting,
// otherwise the raw selector.
function pathTipText(components: string[], selector: string): string {
	return components.length > 0 ? componentTreeText(components) : selector;
}

// Gear icon for the settings popover trigger.
const COG_ICON =
	'<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function shortUrl(url: string): string {
	try {
		return new URL(url).pathname;
	} catch {
		return url;
	}
}

mountClaudback();
