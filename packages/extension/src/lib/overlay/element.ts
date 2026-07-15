// Stateless DOM lookups/scrolling used across the overlay.

export function elementAtPoint(host: HTMLElement, x: number, y: number): Element | null {
	host.style.pointerEvents = "none";
	const el = document.elementFromPoint(x, y);
	host.style.pointerEvents = "";

	return el && el !== document.body && el !== document.documentElement ? el : null;
}

export function resolveElement(selector: string): Element | null {
	try {
		return document.querySelector(selector);
	} catch {
		return null;
	}
}

// Scrolls so the element's top lands about 30% down the viewport — in view with
// some context above it, and for elements taller than the viewport it keeps the
// top (and the popover's clamped position) on screen where centering would not.
// scrollIntoView (rather than window.scrollBy) so scrollable ancestors inside
// the page get scrolled too; the temporary scroll-margin-top supplies the 30%
// offset, which block: "start" alone can't express.
export function scrollCommentIntoView(el: Element): void {
	if (!(el instanceof HTMLElement)) {
		el.scrollIntoView({ block: "start", behavior: "smooth" });

		return;
	}

	const previous = el.style.scrollMarginTop;
	el.style.scrollMarginTop = `${Math.round(window.innerHeight * 0.3)}px`;
	el.scrollIntoView({ block: "start", behavior: "smooth" });
	// The scroll target is computed at the call above; restore on the next frame
	// so the margin never leaks into the page's own styling.
	requestAnimationFrame(() => {
		el.style.scrollMarginTop = previous;
	});
}
