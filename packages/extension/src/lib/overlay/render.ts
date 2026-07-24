// Core render loop + the small state mutations that trigger it.

import { ADD_ICON, CLOSE_ICON, LIST_ICON } from "../../ui/icons.js";
import type { ListResponse } from "../../messages.js";
import type { OverlayContext } from "./context.js";
import { createHint } from "./hint.js";
import { send } from "./messaging.js";
import { renderPanel } from "./panel.js";
import { renderPins } from "./pins.js";

// A short-lived toast for failed saves/deletes. render() tears down every
// non-style shadow node, so it also disappears on the next re-render — that's
// fine, it only needs to be seen once.
export function showError(ctx: OverlayContext, message: string): void {
	ctx.shadow.querySelectorAll(".error-toast").forEach((node) => {
		node.remove();
	});

	const toast = document.createElement("div");
	toast.className = "hint error-toast";
	toast.textContent = message;
	ctx.shadow.append(toast);
	setTimeout(() => {
		toast.remove();
	}, 4000);
}

export async function refresh(ctx: OverlayContext): Promise<void> {
	let res: ListResponse | undefined;

	try {
		res = await send<ListResponse>({ type: "list", origin: window.location.origin });
	} catch {
		// The extension was reloaded or updated out from under this page, so this
		// orphaned copy can never reach the worker again. Remove the overlay;
		// re-enabling injects a fresh script that can.
		ctx.teardown();

		return;
	}

	if (res && res.ok) {
		ctx.store = { mode: res.mode, comments: res.comments };
		ctx.syncState = res.state;
	}

	render(ctx);
}

export function setCommentMode(ctx: OverlayContext, on: boolean): void {
	ctx.commentMode = on;
	ctx.highlight.style.display = "none";
	render(ctx);
}

export function render(ctx: OverlayContext): void {
	// The teardown below removes any open popover node, so drop the anchor
	// tracking with it or a later scroll would reposition a detached node.
	ctx.anchor = null;
	ctx.highlight.style.display = "none";

	ctx.shadow.querySelectorAll(":not(style):not(link)").forEach((node) => {
		node.remove();
	});
	ctx.shadow.append(ctx.highlight);

	const fabs = document.createElement("div");
	fabs.className = "fabs";

	const listBtn = document.createElement("button");
	listBtn.className = `fab secondary${ctx.panelOpen ? " active" : ""}`;
	listBtn.innerHTML = LIST_ICON;
	listBtn.title = ctx.panelOpen ? "Hide comments" : "Show comments";

	if (ctx.store.comments.length > 0) {
		const badge = document.createElement("span");
		badge.className = "count";
		badge.textContent = String(ctx.store.comments.length);
		listBtn.append(badge);
	}

	listBtn.addEventListener("click", () => {
		ctx.panelOpen = !ctx.panelOpen;
		render(ctx);
	});

	const addBtn = document.createElement("button");
	addBtn.className = `fab${ctx.commentMode ? " active" : ""}`;
	addBtn.innerHTML = ctx.commentMode ? CLOSE_ICON : ADD_ICON;
	addBtn.title = ctx.commentMode ? "Exit comment mode (⌥C)" : "Add a comment (⌥C)";
	addBtn.addEventListener("click", () => {
		setCommentMode(ctx, !ctx.commentMode);
	});

	fabs.append(listBtn, addBtn);
	ctx.shadow.append(fabs);

	if (ctx.commentMode) {
		ctx.shadow.append(createHint(ctx));
	}

	if (ctx.panelOpen) {
		renderPanel(ctx);
	}

	renderPins(ctx);
}
