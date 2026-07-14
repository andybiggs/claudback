// Custom hover tooltip for the overlay. One node, event-delegated off the shadow
// root (which survives re-renders) so any [data-tip] element gets a styled,
// untruncated hover label instead of the browser's native title.

import { escapeHtml } from "./html.js";

export function initTooltip(shadow: ShadowRoot): void {
	const tooltip = document.createElement("div");
	tooltip.className = "cb-tooltip";

	function showTooltip(target: Element): void {
		const text = target.getAttribute("data-tip");

		if (!text) {
			return;
		}

		// Escape first, then paint the path separators (component "›" and CSS ">")
		// green so the breadcrumb reads as segments.
		tooltip.innerHTML = escapeHtml(text)
			.replace(/ › /g, ' <span class="tip-sep">›</span> ')
			.replace(/ &gt; /g, ' <span class="tip-sep">&gt;</span> ');

		// render() nukes every non-style shadow node, so re-attach on demand.
		if (!tooltip.isConnected) {
			shadow.append(tooltip);
		}

		tooltip.classList.add("show");

		const anchor = target.getBoundingClientRect();
		const tip = tooltip.getBoundingClientRect();
		const left = Math.max(8, Math.min(anchor.left, window.innerWidth - tip.width - 8));
		const above = anchor.top - tip.height - 6;
		const top = above < 8 ? anchor.bottom + 6 : above;

		tooltip.style.left = `${left}px`;
		tooltip.style.top = `${top}px`;
	}

	shadow.addEventListener("mouseover", (ev) => {
		const target = (ev.target as HTMLElement).closest?.("[data-tip]");

		if (target) {
			showTooltip(target);
		}
	});

	shadow.addEventListener("mouseout", (ev) => {
		if ((ev.target as HTMLElement).closest?.("[data-tip]")) {
			tooltip.classList.remove("show");
		}
	});
}
