// Claudback overlay content script — composition root.
//
// A framework-agnostic, dependency-free visual-feedback overlay. Mounts into a
// Shadow DOM so the host page's CSS can neither leak in nor be affected. Lets
// you click any element and attach a comment to it; comments are sent to the
// background worker (never the collector directly), which owns the pairing
// token, the offline buffer, and all collector I/O.
//
// This file only wires things together: it builds the OverlayContext, registers
// the page-level event listeners, and owns teardown. All UI/behaviour lives in
// src/lib/overlay/* helpers that take the context.

import { STYLES } from "./ui/styles.js";
import { initTooltip } from "./ui/tooltip.js";
import {
	CONVERT_KEY,
	PENDING_EDIT_KEY,
	resolveLocalStore,
	type OverlayContext,
} from "./lib/overlay/context.js";
import { elementAtPoint, resolveElement, scrollCommentIntoView } from "./lib/overlay/element.js";
import { refresh, render, setCommentMode, showError } from "./lib/overlay/render.js";
import { repositionTransient } from "./lib/overlay/transient.js";
import { renderPins } from "./lib/overlay/pins.js";
import { openComposer } from "./lib/overlay/composer.js";
import { openPinPopover } from "./lib/overlay/pin-popover.js";

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

	const highlight = document.createElement("div");
	highlight.className = "highlight";
	highlight.style.display = "none";

	const ctx: OverlayContext = {
		host,
		shadow,
		label,
		highlight,
		localStore: resolveLocalStore(),
		convertKey: CONVERT_KEY,
		store: { mode: "clear", comments: [] },
		syncState: "synced",
		commentMode: false,
		panelOpen: false,
		settingsOpen: false,
		// Setting (persisted in chrome.storage.local, not the worker store): when
		// on, list/composer/pin swap raw HTML tags + selectors for mapped component
		// names and the component tree. Off = raw HTML everywhere.
		convertComponents: true,
		anchor: null,
		// Reassigned to the real teardown below (a function declaration, so it is
		// hoisted and safe to reference here).
		teardown,
	};

	// --- element capture ----------------------------------------------------

	function onMouseMove(event: MouseEvent): void {
		// While a popover is open the frame marks its anchor element — leave it.
		if (shadow.querySelector(".transient")) {
			return;
		}

		if (!ctx.commentMode) {
			highlight.style.display = "none";

			return;
		}

		const el = elementAtPoint(host, event.clientX, event.clientY);

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
		if (!ctx.commentMode) {
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

		const el = elementAtPoint(host, event.clientX, event.clientY);

		if (!el) {
			return;
		}

		openComposer(ctx, el, event.clientX, event.clientY);
	}

	// --- wiring -------------------------------------------------------------

	const keydownHandler = (event: KeyboardEvent): void => {
		if (event.key === "Escape" && ctx.commentMode) {
			setCommentMode(ctx, false);
		}
	};

	// While a popover is open the page must not react to clicks — a stray click
	// following a link would strand the half-written comment. Scrolling stays
	// free; repositionTransient keeps the popover with its element.
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
			renderPins(ctx);
			repositionTransient(ctx);
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

		void refresh(ctx);
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
			// chrome.runtime itself can throw "Extension context invalidated" on
			// touch once the extension has been reloaded or updated — this is the
			// very case teardown() exists to handle, so it must not be able to
			// throw its way out of running.
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

	// Finishes an edit that started on another page: find the pending comment and
	// open its popover. The target element may render late (client-side
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

		const comment = ctx.store.comments.find((candidate) => candidate.id === id);

		if (!comment) {
			// Cleared out-of-band during the navigation (e.g. Claude read and
			// cleared it) — say so rather than landing the user on a page with no
			// acknowledgment of their click.
			showError(ctx, "That comment is gone — it may have been cleared after Claude read it.");

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
				openPinPopover(ctx, comment, el);

				return;
			}

			tries += 1;

			if (tries < 10) {
				setTimeout(attempt, 300);
			} else {
				// The element never appeared — show the panel so the comment is
				// still reachable for an inline edit. showError after render(),
				// which tears down every non-style shadow node.
				ctx.panelOpen = true;
				render(ctx);
				showError(ctx, "Couldn't find that element on this page — edit the comment from the panel.");
			}
		};

		attempt();
	}

	function start(): void {
		void refresh(ctx).then(resumePendingEdit);
	}

	if (ctx.localStore) {
		ctx.localStore.get(CONVERT_KEY, (values) => {
			if (typeof values?.[CONVERT_KEY] === "boolean") {
				ctx.convertComponents = values[CONVERT_KEY];
			}

			start();
		});
	} else {
		start();
	}
}

mountClaudback();
