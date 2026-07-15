// New-comment composer: the popover shown when you click an element in comment
// mode. Owns element-scoped component detection and payload assembly.

import { buildSelector, type NewCommentInput } from "@claudback/shared";

import { excerptFromNames } from "../excerpt.js";
import { parseDetectReply } from "../detect-reply.js";
import { generateNonce } from "../nonce.js";
import type { CreateResponse } from "../../messages.js";
import { escapeHtml } from "../../ui/html.js";
import { componentNamePill } from "../../ui/component-pills.js";
import type { OverlayContext } from "./context.js";
import { sendGuarded } from "./messaging.js";
import { anchorTransient, clearTransient } from "./transient.js";
import { refresh, showError } from "./render.js";

const DETECT_TIMEOUT_MS = 100;

// Component detection is best-effort: this promise must never reject, or callers
// awaiting it (e.g. the save handler) would throw before the comment is ever
// sent. Any failure here degrades to null instead.
function requestComponentInfo(
	el: Element,
): Promise<{ framework: string; components: string[] } | null> {
	return new Promise((resolve) => {
		try {
			const nonce = generateNonce(crypto);

			const finish = (value: { framework: string; components: string[] } | null): void => {
				document.removeEventListener("claudback:detect-result", onResult);
				el.removeAttribute("data-claudback-probe");
				clearTimeout(timer);
				resolve(value);
			};

			const onResult = (event: Event): void => {
				try {
					const reply = parseDetectReply((event as CustomEvent<unknown>).detail, nonce);

					if (reply) {
						finish(reply);
					}
					// Wrong nonce/shape: keep listening until our reply or timeout.
				} catch {
					finish(null);
				}
			};

			const timer = setTimeout(() => finish(null), DETECT_TIMEOUT_MS);

			document.addEventListener("claudback:detect-result", onResult);
			el.setAttribute("data-claudback-probe", nonce);
			document.dispatchEvent(new CustomEvent("claudback:detect", { detail: nonce }));
		} catch {
			resolve(null);
		}
	});
}

function buildPayload(
	el: Element,
	selector: string,
	text: string,
	component: { framework: string; components: string[] } | null,
): NewCommentInput {
	const rect = el.getBoundingClientRect();

	return {
		origin: window.location.origin,
		url: window.location.href,
		selector,
		tag: el.tagName.toLowerCase(),
		text,
		textSnippet: (el.textContent || "").trim().slice(0, 512),
		// Names only — no attribute values ever leave the page.
		htmlExcerpt: excerptFromNames(el.tagName, el.getAttributeNames()),
		framework: component?.framework ?? null,
		componentPath: component?.components ?? [],
		rect: {
			x: rect.left + window.scrollX,
			y: rect.top + window.scrollY,
			width: rect.width,
			height: rect.height,
		},
		viewport: { width: window.innerWidth, height: window.innerHeight },
	};
}

export function openComposer(ctx: OverlayContext, el: Element, x: number, y: number): void {
	const componentPromise = requestComponentInfo(el);
	clearTransient(ctx);

	const pop = document.createElement("div");
	pop.className = "popover transient";
	pop.style.left = `${Math.min(x, window.innerWidth - 300)}px`;
	pop.style.top = `${Math.min(y, window.innerHeight - 200)}px`;

	const selector = buildSelector(el);
	const tag = el.tagName.toLowerCase();
	pop.innerHTML = `
		<div class="selector-line">
			<span class="tagchip mono">&lt;${escapeHtml(tag)}&gt;</span>
			<span class="selector-path mono" data-tip="${escapeHtml(selector)}">${escapeHtml(selector)}</span>
		</div>
		<textarea placeholder="What needs fixing here?"></textarea>
		<div class="row">
			<button class="btn ghost" data-act="cancel">Cancel</button>
			<button class="btn primary" data-act="save">Add comment</button>
		</div>`;
	ctx.shadow.append(pop);
	anchorTransient(ctx, el, pop);

	void componentPromise.then((component) => {
		// Setting off: leave the raw <tag> + selector, no component name in the
		// picker at all.
		if (!ctx.convertComponents || !component || !component.components.length || !pop.isConnected) {
			return;
		}

		// Setting on: swap the raw <tag> + selector for just the component name
		// pill (no path in the picker).
		const line = pop.querySelector(".selector-line");

		if (line) {
			line.innerHTML = componentNamePill(component.framework, component.components);
		}
	}).catch((error) => {
		// The promise itself never rejects; this guards the render callback.
		console.warn("[claudback] component render failed:", error);
	});

	const textarea = pop.querySelector("textarea") as HTMLTextAreaElement;
	textarea.focus();

	textarea.addEventListener("keydown", (ev) => {
		if (ev.key === "Enter" && ev.shiftKey) {
			ev.preventDefault();
			(pop.querySelector("[data-act='save']") as HTMLButtonElement)?.click();
		}
	});

	pop.addEventListener("click", async (ev) => {
		const act = (ev.target as HTMLElement).dataset?.act;

		if (act === "cancel") {
			clearTransient(ctx);
		}

		if (act === "save") {
			const text = textarea.value.trim();

			if (!text) {
				return;
			}

			const component = await componentPromise;

			// Keep the composer (and the typed text) open on failure — an
			// "Extension context invalidated" rejection must not eat the comment.
			const ok = await sendGuarded<CreateResponse>(
				{ type: "create", payload: buildPayload(el, selector, text, component) },
				"create",
				"Couldn't save — comment not stored.",
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
