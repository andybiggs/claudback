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
	const toggle = document.getElementById("toggle") as HTMLInputElement;
	const count = document.getElementById("count") as HTMLSpanElement;
	const statusEl = document.getElementById("status") as HTMLSpanElement;

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

		const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });

		if (granted) {
			await send<TabStateResponse>({ type: "enableTab", tabId });
		} else {
			toggle.checked = false;
		}

		await render();
	};

	const status = await send<StatusReport>({ type: "status" });
	statusEl.textContent = statusText(status.state);

	const list = await send<ListResponse>({ type: "list", origin });
	count.textContent = String(list.comments.length);
}

document.getElementById("options")?.addEventListener("click", () => {
	chrome.runtime.openOptionsPage();
});

void render();
