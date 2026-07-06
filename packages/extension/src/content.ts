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
import type { ContentRequest, CreateResponse, ListResponse, SimpleResponse, SyncState } from "./messages.js";

interface Store {
	mode: StoreMode;
	comments: Comment[];
}

const STYLES = `
:host { all: initial; }
* { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }
.fabs {
	position: fixed; bottom: 20px; right: 20px; z-index: 2147483647;
	display: flex; align-items: center; gap: 12px;
}
.fab {
	position: relative; width: 52px; height: 52px;
	border-radius: 50%; border: none; cursor: pointer;
	background: #16a34a; color: #fff; box-shadow: 0 4px 14px rgba(0,0,0,.25);
	display: flex; align-items: center; justify-content: center; transition: transform .12s ease;
}
.fab:hover { transform: scale(1.06); }
.fab.active { background: #15803d; }
.fab.secondary { width: 46px; height: 46px; background: #fff; color: #16a34a; border: 1px solid #e5e5e5; }
.fab.secondary.active { background: #16a34a; color: #fff; border-color: #16a34a; }
.fab svg { width: 24px; height: 24px; }
.fab.secondary svg { width: 20px; height: 20px; }
.count {
	position: absolute; top: -4px; right: -4px; min-width: 20px; height: 20px;
	padding: 0 5px; border-radius: 10px; background: #111; color: #fff;
	font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center;
}
.hint {
	position: fixed; top: 20px; left: 50%; transform: translateX(-50%); z-index: 2147483647;
	background: #111; color: #fff; padding: 8px 12px; border-radius: 8px;
	font-size: 13px; box-shadow: 0 4px 14px rgba(0,0,0,.25);
}
.highlight {
	position: fixed; pointer-events: none; z-index: 2147483646;
	border: 2px solid #16a34a; background: rgba(22,163,74,.12); border-radius: 3px;
	transition: all .04s linear;
}
.pin {
	position: fixed; z-index: 2147483646; width: 26px; height: 26px; border-radius: 50% 50% 50% 2px;
	background: #16a34a; color: #fff; border: 2px solid #fff; cursor: pointer;
	font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center;
	box-shadow: 0 2px 8px rgba(0,0,0,.3); transform: translate(-50%, -100%);
}
.pin.resolved { background: #9ca3af; }
.popover {
	position: fixed; z-index: 2147483647; width: 280px; background: #fff; color: #111;
	border-radius: 10px; box-shadow: 0 8px 30px rgba(0,0,0,.25); padding: 12px;
	border: 1px solid #e5e5e5;
}
.popover textarea {
	width: 100%; min-height: 64px; resize: vertical; border: 1px solid #d4d4d4;
	border-radius: 6px; padding: 8px; font-size: 13px;
}
.popover .meta { font-size: 11px; color: #777; margin: 6px 0; word-break: break-all; }
.row { display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; }
button.btn { border: none; border-radius: 6px; padding: 6px 12px; font-size: 13px; cursor: pointer; }
.btn.primary { background: #16a34a; color: #fff; }
.btn.ghost { background: #f0f0f0; color: #333; }
.btn.danger { background: #fde7e7; color: #c0271b; }
button.btn:disabled { opacity: .5; cursor: default; }
.panel {
	position: fixed; bottom: 84px; right: 20px; width: 340px; max-height: 70vh; overflow-y: auto;
	z-index: 2147483647; background: #fff; color: #111; border-radius: 12px;
	box-shadow: 0 8px 30px rgba(0,0,0,.25); border: 1px solid #e5e5e5;
}
.panel header { padding: 12px 14px; border-bottom: 1px solid #eee; display: flex; align-items: center; justify-content: space-between; }
.panel header h3 { margin: 0; font-size: 14px; font-weight: 700; }
.panel .status { font-size: 11px; color: #888; padding: 8px 14px; border-bottom: 1px solid #eee; }
.panel .mode { display: flex; align-items: center; gap: 6px; font-size: 12px; padding: 10px 14px; border-bottom: 1px solid #eee; }
.panel .mode select { font-size: 12px; padding: 3px 6px; border-radius: 5px; border: 1px solid #d4d4d4; }
.item { padding: 10px 14px; border-bottom: 1px solid #f3f3f3; }
.item.resolved { opacity: .6; }
.item .num { display: inline-block; min-width: 18px; height: 18px; line-height: 18px; text-align: center; background: #16a34a; color: #fff; border-radius: 9px; font-size: 11px; font-weight: 700; margin-right: 6px; }
.item.resolved .num { background: #9ca3af; }
.item .txt { font-size: 13px; margin: 4px 0; }
.item .ref { font-size: 11px; color: #888; word-break: break-all; }
.item .acts { margin-top: 6px; display: flex; gap: 8px; }
.item .acts a { font-size: 12px; color: #16a34a; cursor: pointer; }
.item .acts a.del { color: #c0271b; }
.empty { padding: 20px 14px; font-size: 13px; color: #888; text-align: center; }
`;

const ADD_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="12" y1="7" x2="12" y2="13"/><line x1="9" y1="10" x2="15" y2="10"/></svg>`;
const CLOSE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
const LIST_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`;

function send<T>(message: ContentRequest): Promise<T> {
	return chrome.runtime.sendMessage(message) as Promise<T>;
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

	let store: Store = { mode: "clear", comments: [] };
	let syncState: SyncState = "synced";
	let commentMode = false;
	let panelOpen = false;

	// --- worker I/O ---------------------------------------------------------

	async function refresh(): Promise<void> {
		const res = await send<ListResponse>({ type: "list", origin: window.location.origin });

		if (res && res.ok) {
			store = { mode: res.mode, comments: res.comments };
			syncState = res.state;
		}

		render();
	}

	// --- element capture ----------------------------------------------------

	const highlight = document.createElement("div");
	highlight.className = "highlight";
	highlight.style.display = "none";

	function elementAtPoint(x: number, y: number): Element | null {
		host.style.pointerEvents = "none";
		const el = document.elementFromPoint(x, y);
		host.style.pointerEvents = "";

		return el && el !== document.body && el !== document.documentElement ? el : null;
	}

	function onMouseMove(event: MouseEvent): void {
		if (!commentMode || shadow.querySelector(".transient")) {
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

	function openComposer(el: Element, x: number, y: number): void {
		clearTransient();

		const pop = document.createElement("div");
		pop.className = "popover transient";
		pop.style.left = `${Math.min(x, window.innerWidth - 300)}px`;
		pop.style.top = `${Math.min(y, window.innerHeight - 200)}px`;

		const selector = buildSelector(el);
		const meta = `<${el.tagName.toLowerCase()}> ${selector}`;
		pop.innerHTML = `
			<div class="meta">${escapeHtml(meta)}</div>
			<textarea placeholder="What needs fixing here?"></textarea>
			<div class="row">
				<button class="btn ghost" data-act="cancel">Cancel</button>
				<button class="btn primary" data-act="save">Add comment</button>
			</div>`;
		shadow.append(pop);

		const textarea = pop.querySelector("textarea") as HTMLTextAreaElement;
		textarea.focus();

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

				await send<CreateResponse>({ type: "create", payload: buildPayload(el, selector, text) });
				clearTransient();
				await refresh();
			}
		});
	}

	function buildPayload(el: Element, selector: string, text: string): NewCommentInput {
		const rect = el.getBoundingClientRect();

		return {
			origin: window.location.origin,
			url: window.location.href,
			selector,
			tag: el.tagName.toLowerCase(),
			text,
			textSnippet: (el.textContent || "").trim().slice(0, 120),
			// Names only — no attribute values ever leave the page.
			htmlExcerpt: excerptFromNames(el.tagName, el.getAttributeNames()),
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
		pop.style.left = `${Math.min(rect.left, window.innerWidth - 300)}px`;
		pop.style.top = `${Math.min(rect.bottom + 6, window.innerHeight - 200)}px`;
		pop.innerHTML = `
			<div class="meta">${escapeHtml(comment.selector)}${comment.resolved ? " · resolved" : ""}</div>
			<textarea>${escapeHtml(comment.text)}</textarea>
			<div class="row">
				<button class="btn danger" data-act="delete">Delete</button>
				<button class="btn ghost" data-act="cancel">Close</button>
				<button class="btn primary" data-act="save">Save</button>
			</div>`;
		shadow.append(pop);

		const textarea = pop.querySelector("textarea") as HTMLTextAreaElement;

		pop.addEventListener("click", async (ev) => {
			const act = (ev.target as HTMLElement).dataset?.act;

			if (act === "cancel") {
				clearTransient();
			}

			if (act === "delete") {
				await send<SimpleResponse>({ type: "delete", id: comment.id });
				clearTransient();
				await refresh();
			}

			if (act === "save") {
				const text = textarea.value.trim();

				if (text) {
					await send<SimpleResponse>({ type: "update", id: comment.id, text });
				}

				clearTransient();
				await refresh();
			}
		});
	}

	// --- rendering ----------------------------------------------------------

	function clearTransient(): void {
		shadow.querySelectorAll(".transient").forEach((node) => {
			node.remove();
		});
	}

	function setCommentMode(on: boolean): void {
		commentMode = on;
		highlight.style.display = "none";
		render();
	}

	function statusLabel(): string {
		switch (syncState) {
			case "unpaired": {
				return "Not paired — set the token in the extension options.";
			}
			case "offline": {
				return "Collector offline — comments are buffered locally.";
			}
			case "pending": {
				return "Syncing buffered comments…";
			}
			default: {
				return "Synced with the local collector.";
			}
		}
	}

	function render(): void {
		shadow.querySelectorAll(":not(style)").forEach((node) => {
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
			hint.textContent = "Click any element to comment · Esc to exit";
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
		header.innerHTML = `<h3>Claudback · ${escapeHtml(label)}</h3>`;
		const clearAllBtn = document.createElement("button");
		clearAllBtn.className = "btn danger";
		clearAllBtn.textContent = "Clear all";
		clearAllBtn.disabled = store.comments.length === 0;
		clearAllBtn.addEventListener("click", async () => {
			await send<SimpleResponse>({ type: "clear", origin: window.location.origin });
			await refresh();
		});
		header.append(clearAllBtn);
		panel.append(header);

		const status = document.createElement("div");
		status.className = "status";
		status.textContent = statusLabel();
		panel.append(status);

		const mode = document.createElement("div");
		mode.className = "mode";
		mode.innerHTML = "<span>After Claude reads:</span>";
		const select = document.createElement("select");
		select.innerHTML = `
			<option value="clear">Clear comments</option>
			<option value="keep">Keep comments</option>`;
		select.value = store.mode;
		select.addEventListener("change", async () => {
			await send<SimpleResponse>({ type: "setMode", mode: select.value as StoreMode });
			await refresh();
		});
		mode.append(select);
		panel.append(mode);

		if (store.comments.length === 0) {
			const empty = document.createElement("div");
			empty.className = "empty";
			empty.textContent = "No comments yet. Turn on comment mode, then click an element.";
			panel.append(empty);
		}

		store.comments.forEach((comment, index) => {
			const item = document.createElement("div");
			item.className = `item${comment.resolved ? " resolved" : ""}`;
			const onThisPage = comment.url === window.location.href;
			item.innerHTML = `
				<div><span class="num">${index + 1}</span><span class="ref">${escapeHtml(comment.tag)} · ${onThisPage ? "this page" : escapeHtml(shortUrl(comment.url))}${comment.resolved ? " · resolved" : ""}</span></div>
				<div class="txt">${escapeHtml(comment.text)}</div>
				<div class="ref">${escapeHtml(comment.selector)}</div>
				<div class="acts">
					<a data-act="edit">Edit</a>
					<a class="del" data-act="delete">Delete</a>
				</div>`;
			item.addEventListener("click", async (ev) => {
				const act = (ev.target as HTMLElement).dataset?.act;

				if (act === "delete") {
					await send<SimpleResponse>({ type: "delete", id: comment.id });
					await refresh();
				}

				if (act === "edit") {
					const el = resolveElement(comment.selector);

					if (el) {
						el.scrollIntoView({ block: "center", behavior: "smooth" });
						openPinPopover(comment, el);
					}
				}
			});
			panel.append(item);
		});

		shadow.append(panel);
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

	let raf = 0;
	const reposition = (): void => {
		cancelAnimationFrame(raf);
		raf = requestAnimationFrame(renderPins);
	};

	// The store can change out-of-band (Claude reads and clears, or the file is
	// edited directly). We aren't notified, so re-sync when the tab regains
	// focus — but not while a composer is open, since render() tears down every
	// shadow node except <style>, which would close it mid-edit.
	function backgroundRefresh(): void {
		if (document.visibilityState !== "visible") {
			return;
		}

		if (shadow.querySelector(".transient")) {
			return;
		}

		void refresh();
	}

	const unmountHandler = (message: { type?: string }): void => {
		if (message?.type === "unmount") {
			teardown();
		}
	};

	function teardown(): void {
		window.removeEventListener("mousemove", onMouseMove);
		window.removeEventListener("click", onClickCapture, true);
		window.removeEventListener("keydown", keydownHandler);
		window.removeEventListener("scroll", reposition, true);
		window.removeEventListener("resize", reposition);
		document.removeEventListener("visibilitychange", backgroundRefresh);
		window.removeEventListener("focus", backgroundRefresh);
		chrome.runtime.onMessage.removeListener(unmountHandler);
		host.remove();
	}

	window.addEventListener("mousemove", onMouseMove);
	window.addEventListener("click", onClickCapture, true);
	window.addEventListener("keydown", keydownHandler);
	window.addEventListener("scroll", reposition, true);
	window.addEventListener("resize", reposition);
	document.addEventListener("visibilitychange", backgroundRefresh);
	window.addEventListener("focus", backgroundRefresh);
	chrome.runtime.onMessage.addListener(unmountHandler);

	void refresh();
}

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
