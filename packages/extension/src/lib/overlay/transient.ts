// The highlight frame + transient-popover anchoring cluster. All operate on
// ctx.highlight and ctx.anchor so scrolling can keep an open popover glued to
// its element.

import type { OverlayContext } from "./context.js";

export function frameElement(ctx: OverlayContext, el: Element): void {
	const rect = el.getBoundingClientRect();
	ctx.highlight.style.display = "block";
	ctx.highlight.style.left = `${rect.left}px`;
	ctx.highlight.style.top = `${rect.top}px`;
	ctx.highlight.style.width = `${rect.width}px`;
	ctx.highlight.style.height = `${rect.height}px`;
}

export function anchorTransient(ctx: OverlayContext, el: Element, pop: HTMLElement): void {
	const rect = el.getBoundingClientRect();
	ctx.anchor = {
		el,
		pop,
		dx: parseFloat(pop.style.left) - rect.left,
		dy: parseFloat(pop.style.top) - rect.top,
	};
	frameElement(ctx, el);
}

export function repositionTransient(ctx: OverlayContext): void {
	if (!ctx.anchor) {
		return;
	}

	const rect = ctx.anchor.el.getBoundingClientRect();
	let left = rect.left + ctx.anchor.dx;
	let top = rect.top + ctx.anchor.dy;

	// While the element is on screen, keep the popover on screen too — an element
	// taller than the viewport puts the anchored offset far outside the visible
	// area even though the element itself fills the screen. Only once the element
	// leaves the viewport may the popover follow it out, and only off the
	// top/left — the right/bottom clamps always apply, as they did before this
	// branch existed.
	const onScreen =
		rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;

	if (onScreen) {
		left = Math.max(10, Math.min(left, window.innerWidth - 300));
		top = Math.max(10, Math.min(top, window.innerHeight - 200));
	} else {
		left = Math.min(left, window.innerWidth - 300);
		top = Math.min(top, window.innerHeight - 200);
	}

	ctx.anchor.pop.style.left = `${left}px`;
	ctx.anchor.pop.style.top = `${top}px`;
	frameElement(ctx, ctx.anchor.el);
}

export function clearTransient(ctx: OverlayContext): void {
	ctx.shadow.querySelectorAll(".transient").forEach((node) => {
		node.remove();
	});
	ctx.anchor = null;
	ctx.highlight.style.display = "none";
}
