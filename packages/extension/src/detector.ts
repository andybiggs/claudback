// Main-world detector. Injected alongside content.js (which runs isolated)
// because React/Vue internals are main-world expandos on DOM nodes. This file
// must stay a thin event-answering shell: it never touches comments, storage,
// or the network, and replies only with the nonce, framework, and component names.

import { detectComponents } from "./lib/component-detect.js";

const FLAG = "__claudbackDetector";

// Guard against double injection (enable + re-injection retry).
if (!(window as unknown as Record<string, unknown>)[FLAG]) {
	(window as unknown as Record<string, unknown>)[FLAG] = true;

	document.addEventListener("claudback:detect", (event) => {
		const nonce = (event as CustomEvent<unknown>).detail;

		if (typeof nonce !== "string" || nonce.length === 0 || nonce.length > 64) {
			return;
		}

		const el = document.querySelector(`[data-claudback-probe="${CSS.escape(nonce)}"]`);

		if (!el) {
			return;
		}

		const result = detectComponents(el);

		if (!result) {
			return;
		}

		document.dispatchEvent(
			new CustomEvent("claudback:detect-result", {
				// JSON string, not an object: cross-world structured clone of
				// page-created objects is inconsistent across Chrome versions.
				detail: JSON.stringify({ nonce, framework: result.framework, components: result.components }),
			}),
		);
	});
}
