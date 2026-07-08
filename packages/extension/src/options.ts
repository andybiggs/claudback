import type { TestConnectionResponse } from "./messages.js";

const TOKEN_KEY = "claudback_token";

async function loadToken(): Promise<string> {
	const result = await chrome.storage.local.get(TOKEN_KEY);
	const token = result[TOKEN_KEY];

	return typeof token === "string" ? token : "";
}

function setStatus(text: string): void {
	const statusText = document.getElementById("status-text") as HTMLSpanElement;
	statusText.textContent = text;
}

async function init(): Promise<void> {
	const input = document.getElementById("token") as HTMLInputElement;
	const saveBtn = document.getElementById("save") as HTMLButtonElement;
	const testBtn = document.getElementById("test") as HTMLButtonElement;

	const existing = await loadToken();

	if (existing) {
		setStatus("A token is saved. Paste a new one to replace it.");
	} else {
		setStatus("No token saved yet.");
	}

	// Both buttons save whatever is in the input (if anything), then test —
	// users shouldn't have to know save and test are separate operations.
	const onClick = () => {
		void (async () => {
			const typed = input.value.trim();

			if (typed) {
				await chrome.storage.local.set({ [TOKEN_KEY]: typed });
				input.value = "";
				setStatus("Token saved — testing…");
			} else if ((await loadToken()) === "") {
				setStatus("Paste your token first.");

				return;
			} else {
				setStatus("Testing…");
			}

			const result = (await chrome.runtime.sendMessage({ type: "testConnection" })) as TestConnectionResponse;

			switch (result.state) {
				case "unpaired": {
					setStatus("No token saved yet — paste the one from ~/.claudback/token.");

					return;
				}
				case "offline": {
					setStatus("Collector offline — is the MCP server running?");

					return;
				}
				case "unauthorized": {
					setStatus("Token rejected by the collector — paste the current one from ~/.claudback/token.");

					return;
				}
				case "synced":
				case "pending": {
					setStatus("Connected to the local collector.");

					return;
				}
				default: {
					setStatus("Unexpected response from the extension — try again.");
				}
			}
		})().catch(reportError);
	};

	saveBtn.addEventListener("click", onClick);
	testBtn.addEventListener("click", onClick);
}

function reportError(error: unknown): void {
	console.error("[claudback] options error:", error);
	setStatus("Something went wrong — reload this page and try again.");
}

void init().catch(reportError);
