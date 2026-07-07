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

	saveBtn.addEventListener("click", async () => {
		const token = input.value.trim();

		if (!token) {
			setStatus("Enter a token first.");

			return;
		}

		await chrome.storage.local.set({ [TOKEN_KEY]: token });
		input.value = "";
		setStatus("Token saved.");
	});

	testBtn.addEventListener("click", async () => {
		setStatus("Testing…");
		const result = (await chrome.runtime.sendMessage({ type: "testConnection" })) as TestConnectionResponse;

		switch (result.state) {
			case "unpaired": {
				setStatus("Not paired — save a token first.");

				return;
			}
			case "offline": {
				setStatus("Collector offline — is the MCP server running?");

				return;
			}
			default: {
				setStatus("Connected to the local collector.");
			}
		}
	});
}

void init();
