import type {
	ListResponse,
	PopupRequest,
	StatusReport,
	SyncState,
	TabStateResponse,
} from "./messages.js";

function send<T>(message: PopupRequest | { type: "status" } | { type: "list"; origin: string }): Promise<T> {
	return chrome.runtime.sendMessage(message) as Promise<T>;
}

const CLAUDE_START_SERVER_PROMPT =
	"The Claudback MCP server (claudback-mcp) isn't running — check whether the " +
	"dev.claudback.mcp-server LaunchAgent is installed and running, and if not, " +
	"follow the setup in this repo's README.md to build and start it.";

function statusText(state: SyncState): string {
	switch (state) {
		case "unpaired": {
			return "Not paired";
		}
		case "offline": {
			return "Collector offline";
		}
		case "unauthorized": {
			return "Token rejected";
		}
		case "pending": {
			return "Syncing";
		}
		default: {
			return "Synced";
		}
	}
}

// Neutral (unpaired) / red (offline) / blue (pending — in progress, not
// wrong) / green (synced) — the same palette as the rest of the popup and
// overlay.
function statusClass(state: SyncState): string {
	return `status-${state}`;
}

function statusHint(state: SyncState): string | null {
	switch (state) {
		case "offline": {
			return "Can't reach the local Claudback server.";
		}
		case "unpaired": {
			return "Add the pairing token from claudback-mcp in Pairing & options.";
		}
		case "unauthorized": {
			return "The collector rejected the pairing token — re-pair in Pairing & options.";
		}
		default: {
			return null;
		}
	}
}

async function activeTab(): Promise<chrome.tabs.Tab | undefined> {
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

	return tab;
}

async function render(): Promise<void> {
	const toggle = document.getElementById("toggle") as HTMLInputElement;
	const count = document.getElementById("count") as HTMLSpanElement;
	const statusEl = document.getElementById("status") as HTMLSpanElement;
	const statusDotEl = document.getElementById("status-dot") as HTMLSpanElement;
	const spinnerEl = document.getElementById("status-spinner") as HTMLSpanElement;
	const hintEl = document.getElementById("status-hint") as HTMLDivElement;
	const hintTextEl = document.getElementById("status-hint-text") as HTMLSpanElement;
	const copyBtn = document.getElementById("copy-prompt") as HTMLButtonElement;

	const tab = await activeTab();

	if (!tab || tab.id === undefined || !tab.url) {
		toggle.disabled = true;
		statusEl.textContent = "no active tab";

		return;
	}

	const tabId = tab.id;
	const origin = new URL(tab.url).origin;

	const tabState = await send<TabStateResponse>({ type: "getTabState", tabId });
	toggle.checked = tabState.enabled;

	toggle.onchange = async () => {
		if (!toggle.checked) {
			await send<TabStateResponse>({ type: "disableTab", tabId });
			await render();

			return;
		}

		// Chrome closes the popup the moment its permission dialog takes focus,
		// which kills this function before it can send "enableTab" below — so
		// arm the background worker first; its onAdded listener finishes the
		// job even if this popup never gets to.
		await send<void>({ type: "armEnable", tabId });

		const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });

		if (granted) {
			await send<TabStateResponse>({ type: "enableTab", tabId });
		} else {
			await send<void>({ type: "disarmEnable", tabId });
			toggle.checked = false;
		}

		await render();
	};

	const status = await send<StatusReport>({ type: "status" });
	statusEl.textContent = statusText(status.state);
	statusEl.className = `status ${statusClass(status.state)}`;
	statusDotEl.className = `status-dot ${statusClass(status.state)}`;
	spinnerEl.hidden = status.state !== "pending";
	statusDotEl.hidden = status.state === "pending";

	const hint = statusHint(status.state);
	hintTextEl.textContent = hint ?? "";
	hintEl.hidden = hint === null;

	copyBtn.hidden = status.state !== "offline";
	copyBtn.onclick = async () => {
		await navigator.clipboard.writeText(CLAUDE_START_SERVER_PROMPT);
		copyBtn.textContent = "Copied!";
		setTimeout(() => {
			copyBtn.textContent = "Copy prompt for Claude";
		}, 1500);
	};

	const list = await send<ListResponse>({ type: "list", origin });
	count.textContent = String(list.comments.length);
}

document.getElementById("options")?.addEventListener("click", () => {
	chrome.runtime.openOptionsPage();
});

void render();
