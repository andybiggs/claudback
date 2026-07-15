// The comment list panel: header (identity, settings cog, clear-all), sync
// strip, scrollable comment list, and the "grab my comments" footer.

import type { StoreMode } from "@claudback/shared";

import type { SimpleResponse } from "../../messages.js";
import { COG_ICON } from "../../ui/icons.js";
import { escapeHtml, shortUrl } from "../../ui/html.js";
import { componentNameHtml, componentTreeHtml, pathTipText } from "../../ui/component-pills.js";
import { CLAUDE_RESTART_PROMPT } from "../../prompts.js";
import { PENDING_EDIT_KEY, type OverlayContext } from "./context.js";
import { copyToClipboard, isContextInvalidated, send, sendGuarded } from "./messaging.js";
import { refresh, render, showError } from "./render.js";
import { resolveElement, scrollCommentIntoView } from "./element.js";
import { openPinPopover } from "./pin-popover.js";
import { openInlineEdit } from "./inline-edit.js";

function statusLabel(ctx: OverlayContext): string | null {
	switch (ctx.syncState) {
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

function persistConvert(ctx: OverlayContext): void {
	try {
		ctx.localStore?.set({ [ctx.convertKey]: ctx.convertComponents });
	} catch {
		// Storage can be unavailable if the extension is being torn down; the
		// in-memory value still drives this session's rendering.
	}
}

export function renderPanel(ctx: OverlayContext): void {
	const panel = document.createElement("div");
	panel.className = "panel";

	const header = document.createElement("header");
	header.innerHTML = `
		<div class="identity">
			<span class="mark"></span>
			<div class="text">
				<span class="brand-name">Claudback</span>
				<span class="hostname mono" title="${escapeHtml(ctx.label)}">${escapeHtml(ctx.label)}</span>
			</div>
		</div>`;
	const clearAllBtn = document.createElement("button");
	clearAllBtn.className = "clear-all";
	clearAllBtn.textContent = "Clear all";
	clearAllBtn.disabled = ctx.store.comments.length === 0;
	clearAllBtn.addEventListener("click", async () => {
		try {
			const res = await send<SimpleResponse>({ type: "clear", origin: window.location.origin });

			await refresh(ctx);

			if (!res || !res.ok) {
				showError(ctx, "Couldn't clear — comments not removed.");
			}
		} catch (error) {
			if (isContextInvalidated(error)) {
				ctx.teardown();

				return;
			}

			console.error("[claudback] clear failed:", error);
			showError(ctx, "Couldn't clear — comments not removed.");
		}
	});
	const cog = document.createElement("button");
	cog.className = `cog${ctx.settingsOpen ? " open" : ""}`;
	cog.setAttribute("aria-label", "Settings");
	cog.title = "Settings";
	cog.innerHTML = COG_ICON;
	cog.addEventListener("click", () => {
		ctx.settingsOpen = !ctx.settingsOpen;
		render(ctx);
	});
	header.append(cog);
	header.append(clearAllBtn);

	if (ctx.settingsOpen) {
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
		modeSelect.value = ctx.store.mode;
		modeSelect.addEventListener("change", async () => {
			try {
				const res = await send<SimpleResponse>({ type: "setMode", mode: modeSelect.value as StoreMode });

				await refresh(ctx);

				if (!res || !res.ok) {
					showError(ctx, "Couldn't change mode — change not stored.");
				}
			} catch (error) {
				if (isContextInvalidated(error)) {
					ctx.teardown();

					return;
				}

				console.error("[claudback] setMode failed:", error);
				showError(ctx, "Couldn't change mode — change not stored.");
			}
		});
		modeRow.append(modeSelect);
		menu.append(modeRow);

		const switchRow = document.createElement("label");
		switchRow.className = "settings-row";
		switchRow.innerHTML = `
			<span>Convert HTML to Component Names</span>
			<span class="switch">
				<input type="checkbox" ${ctx.convertComponents ? "checked" : ""}>
				<span class="slider"></span>
			</span>`;
		const toggle = switchRow.querySelector("input") as HTMLInputElement;
		toggle.addEventListener("change", () => {
			ctx.convertComponents = toggle.checked;
			persistConvert(ctx);
			render(ctx);
		});
		menu.append(switchRow);

		header.append(menu);
	}

	panel.append(header);

	const syncLabel = statusLabel(ctx);

	if (syncLabel !== null) {
		const status = document.createElement("div");
		status.className = "sync-strip";
		status.innerHTML = `<span class="dot"></span>${escapeHtml(syncLabel)}`;

		if (ctx.syncState === "offline") {
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
					showError(ctx, "Couldn't copy — this page blocks clipboard access.");
				}
			});
			status.append(action);
		} else if (ctx.syncState === "unpaired") {
			const action = document.createElement("button");
			action.className = "sync-action";
			action.textContent = "Open setup guide";
			action.addEventListener("click", () => {
				void sendGuarded<SimpleResponse>(
					{ type: "openOnboarding" },
					"openOnboarding",
					"Couldn't open the setup guide.",
					(message) => showError(ctx, message),
					ctx.teardown,
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

	if (ctx.store.comments.length === 0) {
		const empty = document.createElement("div");
		empty.className = "empty";
		empty.textContent = "No comments yet. Turn on comment mode, then click an element.";
		items.append(empty);
	}

	ctx.store.comments.forEach((comment, index) => {
		const item = document.createElement("div");
		item.className = `item${comment.resolved ? " resolved" : ""}`;
		const onThisPage = comment.url === window.location.href;
		// Empty path forces the helpers' raw HTML fallback when the setting is
		// off or the element was never mapped to a component.
		const path = ctx.convertComponents ? comment.componentPath ?? [] : [];
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

					await refresh(ctx);

					if (!res || !res.ok) {
						showError(ctx, "Couldn't delete — change not stored.");
					}
				} catch (error) {
					if (isContextInvalidated(error)) {
						ctx.teardown();

						return;
					}

					console.error("[claudback] delete failed:", error);
					showError(ctx, "Couldn't delete — change not stored.");
				}
			}

			if (act === "unresolve") {
				try {
					const res = await send<SimpleResponse>({ type: "unresolve", id: comment.id });

					await refresh(ctx);

					if (!res || !res.ok) {
						showError(ctx, "Couldn't unresolve — change not stored.");
					}
				} catch (error) {
					if (isContextInvalidated(error)) {
						ctx.teardown();

						return;
					}

					console.error("[claudback] unresolve failed:", error);
					showError(ctx, "Couldn't unresolve — change not stored.");
				}
			}

			if (act === "edit") {
				const editOnThisPage = comment.url === window.location.href;
				const el = editOnThisPage ? resolveElement(comment.selector) : null;

				if (el) {
					scrollCommentIntoView(el);
					openPinPopover(ctx, comment, el);
				} else if (!editOnThisPage) {
					// The comment lives on another page of this origin — navigate
					// there and let the freshly injected overlay pick the edit back
					// up via sessionStorage.
					try {
						sessionStorage.setItem(PENDING_EDIT_KEY, comment.id);
					} catch (error) {
						// Storage unavailable (e.g. blocked) — fall back to editing
						// in place rather than losing the click.
						console.error("[claudback] sessionStorage unavailable:", error);
						openInlineEdit(ctx, item, comment);

						return;
					}
					window.location.href = comment.url;
				} else {
					// On the right page but the element is gone, so there's nothing
					// to anchor a popover to — edit in place.
					openInlineEdit(ctx, item, comment);
				}
			}
		});
		items.append(item);
	});

	if (ctx.store.comments.length > 0) {
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
				showError(ctx, "Couldn't copy — this page blocks clipboard access.");
			}
		});
		panel.append(footer);
	}

	ctx.shadow.append(panel);
}
