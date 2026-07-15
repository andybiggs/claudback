// Worker messaging + clipboard helpers. Pure of overlay state — they take
// everything they need as arguments.

import type { ContentRequest } from "../../messages.js";

interface OkResponse {
	ok: boolean;
}

export function send<T>(message: ContentRequest): Promise<T> {
	return chrome.runtime.sendMessage(message) as Promise<T>;
}

// The extension was reloaded or updated out from under this page: the runtime
// rejects every message with this exact error. It isn't a real failure to
// report — the orphaned overlay should tear itself down instead.
export function isContextInvalidated(error: unknown): boolean {
	return error instanceof Error && error.message.includes("Extension context invalidated");
}

// Sends a message and reports failure uniformly via onError, without ever
// throwing. A thrown "extension context invalidated" error routes to
// onInvalidated instead (when given) so the caller can tear down rather than
// show a misleading "couldn't save" toast for what is really an orphaned
// overlay. Returns whether the call succeeded, so callers can decide what to
// do next.
export async function sendGuarded<T extends OkResponse>(
	message: ContentRequest,
	label: string,
	errorMessage: string,
	onError: (message: string) => void,
	onInvalidated?: () => void,
): Promise<boolean> {
	try {
		const res = await send<T>(message);

		if (!res || !res.ok) {
			onError(errorMessage);

			return false;
		}

		return true;
	} catch (error) {
		if (onInvalidated && isContextInvalidated(error)) {
			onInvalidated();

			return false;
		}

		console.error(`[claudback] ${label} failed:`, error);
		onError(errorMessage);

		return false;
	}
}

// Clipboard write that also works where navigator.clipboard doesn't exist —
// content scripts on insecure origins (plain-http LAN dev servers) — by falling
// back to a scratch textarea + execCommand("copy"). Returns whether the text
// actually made it onto the clipboard, so callers can surface failure instead
// of showing a false "Copied!".
export async function copyToClipboard(text: string): Promise<boolean> {
	try {
		if (navigator.clipboard) {
			await navigator.clipboard.writeText(text);

			return true;
		}
	} catch {
		// e.g. the page's Permissions-Policy blocks clipboard-write, or the
		// document lost focus — try the legacy path below.
	}

	try {
		const scratch = document.createElement("textarea");
		scratch.value = text;
		scratch.style.position = "fixed";
		scratch.style.opacity = "0";
		document.body.append(scratch);
		scratch.select();
		const ok = document.execCommand("copy");
		scratch.remove();

		return ok;
	} catch {
		return false;
	}
}
