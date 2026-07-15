// Numbered pins overlaid on the commented elements present on this page.

import type { OverlayContext } from "./context.js";
import { resolveElement } from "./element.js";
import { openPinPopover } from "./pin-popover.js";

export function renderPins(ctx: OverlayContext): void {
	ctx.shadow.querySelectorAll(".pin").forEach((node) => {
		node.remove();
	});

	ctx.store.comments.forEach((comment, index) => {
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
		pin.addEventListener("click", () => openPinPopover(ctx, comment, el));
		ctx.shadow.append(pin);
	});
}
