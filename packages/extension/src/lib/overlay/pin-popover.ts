// Pin popover: edit/delete an existing comment, opened from its pin or list row.

import type { Comment } from "@claudback/shared";

import type { SimpleResponse } from "../../messages.js";
import { escapeHtml } from "../../ui/html.js";
import { componentNamePill, componentTreeText } from "../../ui/component-pills.js";
import type { OverlayContext } from "./context.js";
import { sendGuarded } from "./messaging.js";
import { anchorTransient, clearTransient, repositionTransient } from "./transient.js";
import { refresh, showError } from "./render.js";
import { submitOnEnter } from "./submit-on-enter.js";

export function openPinPopover(ctx: OverlayContext, comment: Comment, el: Element): void {
	clearTransient(ctx);

	const rect = el.getBoundingClientRect();
	const pop = document.createElement("div");
	pop.className = "popover transient";
	// Anchor at the element's bottom-left corner, unclamped — the anchor offset
	// must describe the true tie point so the popover tracks the bottom edge as
	// the element moves. repositionTransient below applies the on-screen clamping
	// for display.
	pop.style.left = `${rect.left}px`;
	pop.style.top = `${rect.bottom + 6}px`;
	const pinPath = ctx.convertComponents ? comment.componentPath ?? [] : [];
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
	ctx.shadow.append(pop);
	anchorTransient(ctx, el, pop);
	repositionTransient(ctx);

	const textarea = pop.querySelector("textarea") as HTMLTextAreaElement;

	submitOnEnter(textarea, () => (pop.querySelector("[data-act='save']") as HTMLButtonElement)?.click());

	pop.addEventListener("click", async (ev) => {
		const act = (ev.target as HTMLElement).dataset?.act;

		if (act === "cancel") {
			clearTransient(ctx);
		}

		if (act === "delete") {
			const ok = await sendGuarded<SimpleResponse>(
				{ type: "delete", id: comment.id },
				"delete",
				"Couldn't delete — change not stored.",
				(message) => showError(ctx, message),
				ctx.teardown,
			);

			if (ok) {
				clearTransient(ctx);
				await refresh(ctx);
			}
		}

		if (act === "save") {
			const text = textarea.value.trim();

			if (!text) {
				clearTransient(ctx);

				return;
			}

			const ok = await sendGuarded<SimpleResponse>(
				{ type: "update", id: comment.id, text },
				"update",
				"Couldn't save — change not stored.",
				(message) => showError(ctx, message),
				ctx.teardown,
			);

			if (ok) {
				clearTransient(ctx);
				await refresh(ctx);
			}
		}
	});
}
