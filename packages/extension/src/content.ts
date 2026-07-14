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
import { STYLES } from "./ui/styles.js";
import { ADD_ICON, CLOSE_ICON, COG_ICON, LIST_ICON } from "./ui/icons.js";
import { escapeHtml, shortUrl } from "./ui/html.js";
import { initTooltip } from "./ui/tooltip.js";
import {
	componentNameHtml,
	componentNamePill,
	componentTreeHtml,
	componentTreeText,
	pathTipText,
} from "./ui/component-pills.js";

interface Store {
	mode: StoreMode;
	comments: Comment[];
}

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

	initTooltip(shadow);

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

mountClaudback();
