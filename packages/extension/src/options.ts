import type { PairResponse, TestConnectionResponse } from "./messages.js";

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

function reportState(state: TestConnectionResponse["state"]): void {
	switch (state) {
		case "unpaired": {
			setStatus("Not paired yet — ask Claude for a pairing code, or paste the token from ~/.claudback/token.");

			return;
		}
		case "offline": {
			setStatus("Collector offline — is the MCP server running?");

			return;
		}
		case "unauthorized": {
			setStatus("Token rejected by the collector — ask Claude for a fresh pairing code.");

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
}

async function pairWithCode(input: HTMLInputElement): Promise<void> {
	const code = input.value.trim();

	if (!code) {
		setStatus("Enter the pairing code Claude gave you.");

		return;
	}

	setStatus("Pairing…");

	const response = (await chrome.runtime.sendMessage({ type: "pairWithCode", code })) as PairResponse;

	if (response.ok) {
		input.value = "";
		reportState(response.state);

		return;
	}

	if (response.error === "invalid_code") {
		setStatus("That code didn't work — it may have expired. Ask Claude for a fresh one.");

		return;
	}

	setStatus("Collector offline — is the MCP server running?");
}

function initCopyPrompt(): void {
	const button = document.getElementById("copy-prompt") as HTMLButtonElement;
	const prompt = document.getElementById("pair-prompt") as HTMLPreElement;

	button.addEventListener("click", () => {
		void navigator.clipboard
			.writeText(prompt.textContent ?? "")
			.then(() => {
				button.textContent = "Copied";
			})
			.catch(() => {
				// Rejects when the document loses focus mid-click; make the
				// failure visible so stale clipboard contents don't get pasted.
				button.textContent = "Copy failed — select it manually";
			})
			.finally(() => {
				setTimeout(() => {
					button.textContent = "Copy";
				}, 2000);
			});
	});
}

async function init(): Promise<void> {
	const codeInput = document.getElementById("pair-code") as HTMLInputElement;
	const pairBtn = document.getElementById("pair") as HTMLButtonElement;
	const input = document.getElementById("token") as HTMLInputElement;
	const saveBtn = document.getElementById("save") as HTMLButtonElement;
	const testBtn = document.getElementById("test") as HTMLButtonElement;

	const existing = await loadToken();

	if (existing) {
		setStatus("A token is saved. Pair again to replace it.");
	} else {
		setStatus("Not paired yet.");
	}

	initCopyPrompt();
	pairBtn.addEventListener("click", () => {
		void pairWithCode(codeInput).catch(reportError);
	});
	codeInput.addEventListener("keydown", (event) => {
		if (event.key === "Enter") {
			void pairWithCode(codeInput).catch(reportError);
		}
	});

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

			reportState(result.state);
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
