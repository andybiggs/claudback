// Inline edit: an in-place textarea inside a list row, used when the commented
// element isn't on the current page (so there's nothing to anchor a popover to).

import type { Comment } from "@claudback/shared";

import type { SimpleResponse } from "../../messages.js";
import { escapeHtml } from "../../ui/html.js";
import type { OverlayContext } from "./context.js";
import { sendGuarded } from "./messaging.js";
import { refresh, render, showError } from "./render.js";
import { submitOnEnter } from "./submit-on-enter.js";

export function openInlineEdit(ctx: OverlayContext, item: HTMLElement, comment: Comment): void {
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

	submitOnEnter(textarea, () => (editor.querySelector("[data-act='save-edit']") as HTMLButtonElement)?.click());

	editor.addEventListener("click", async (ev) => {
		const act = (ev.target as HTMLElement).dataset?.act;

		if (act === "cancel-edit") {
			render(ctx);
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
				(message) => showError(ctx, message),
				ctx.teardown,
			);

			if (ok) {
				await refresh(ctx);
			}
		}
	});
}
