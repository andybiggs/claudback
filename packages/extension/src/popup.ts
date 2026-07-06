import type { StoreMode } from "@claudback/shared";

import type {
	ListResponse,
	PopupRequest,
	StatusReport,
	SyncState,
	TabStateResponse,
} from "./messages.js";

function send<T>(message: PopupRequest | { type: "status" } | { type: "list"; origin: string } | { type: "setMode"; mode: StoreMode }): Promise<T> {
	return chrome.runtime.sendMessage(message) as Promise<T>;
}

function statusText(state: SyncState): string {
	switch (state) {
		case "unpaired": {
			return "not paired";
		}
		case "offline": {
			return "collector offline";
		}
		case "pending": {
			return "syncing…";
		}
		default: {
			return "synced";
		}
	}
}

async function activeTab(): Promise<chrome.tabs.Tab | undefined> {
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

	return tab;
}

async function render(): Promise<void> {
	const toggle = document.getElementById("toggle") as HTMLButtonElement;
	const count = document.getElementById("count") as HTMLSpanElement;
	const statusEl = document.getElementById("status") as HTMLSpanElement;
	const modeSelect = document.getElementById("mode") as HTMLSelectElement;

	const tab = await activeTab();

	if (!tab || tab.id === undefined || !tab.url) {
		toggle.disabled = true;
		statusEl.textContent = "no active tab";

		return;
	}

	const tabId = tab.id;
	const origin = new URL(tab.url).origin;

	const tabState = await send<TabStateResponse>({ type: "getTabState", tabId });
	toggle.textContent = tabState.enabled ? "Disable" : "Enable";
	toggle.className = tabState.enabled ? "" : "off";

	toggle.onclick = async () => {
		if (tabState.enabled) {
			await send<TabStateResponse>({ type: "disableTab", tabId });
		} else {
			await send<TabStateResponse>({ type: "enableTab", tabId });
		}

		await render();
	};

	const status = await send<StatusReport>({ type: "status" });
	statusEl.textContent = statusText(status.state);

	const list = await send<ListResponse>({ type: "list", origin });
	count.textContent = String(list.comments.length);
	modeSelect.value = list.mode;

	modeSelect.onchange = async () => {
		await send({ type: "setMode", mode: modeSelect.value as StoreMode });
		await render();
	};
}

document.getElementById("options")?.addEventListener("click", () => {
	chrome.runtime.openOptionsPage();
});

void render();
