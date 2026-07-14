import type { PairResponse, TestConnectionResponse } from "./messages.js";

const TOKEN_KEY = "claudback_token";
const CONVERT_KEY = "convertComponents";

async function hasToken(): Promise<boolean> {
	const result = await chrome.storage.local.get(TOKEN_KEY);
	const token = result[TOKEN_KEY];

	return typeof token === "string" && token.length > 0;
}

function setStatus(text: string, ok = false): void {
	const statusText = document.getElementById("status-text") as HTMLSpanElement;
	const dot = document.getElementById("status-dot") as HTMLSpanElement;

	statusText.textContent = text;
	dot.classList.toggle("ok", ok);
}

function reportState(state: TestConnectionResponse["state"]): void {
	switch (state) {
		case "unpaired": {
			setStatus("Not paired yet — ask Claude for a pairing code.");

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
			setStatus("Connected to the local collector.", true);

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

async function testConnection(): Promise<void> {
	setStatus("Testing…");

	const result = (await chrome.runtime.sendMessage({ type: "testConnection" })) as TestConnectionResponse;

	reportState(result.state);
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

// Mirrors content.ts: defaults on, only the explicit `false` turns it off.
async function initConvertToggle(): Promise<void> {
	const toggle = document.getElementById("convert-toggle") as HTMLInputElement;
	const stored = await chrome.storage.local.get(CONVERT_KEY);
	toggle.checked = stored[CONVERT_KEY] !== false;

	toggle.addEventListener("change", () => {
		void chrome.storage.local.set({ [CONVERT_KEY]: toggle.checked });
	});
}

async function init(): Promise<void> {
	const codeInput = document.getElementById("pair-code") as HTMLInputElement;
	const pairBtn = document.getElementById("pair") as HTMLButtonElement;
	const testBtn = document.getElementById("test") as HTMLButtonElement;

	if (await hasToken()) {
		setStatus("Paired. Pair again with a fresh code to replace the token.", true);
	} else {
		setStatus("Not paired yet.");
	}

	initCopyPrompt();
	await initConvertToggle();
	pairBtn.addEventListener("click", () => {
		void pairWithCode(codeInput).catch(reportError);
	});
	codeInput.addEventListener("keydown", (event) => {
		if (event.key === "Enter") {
			void pairWithCode(codeInput).catch(reportError);
		}
	});
	testBtn.addEventListener("click", () => {
		void testConnection().catch(reportError);
	});
}

function reportError(error: unknown): void {
	console.error("[claudback] options error:", error);
	setStatus("Something went wrong — reload this page and try again.");
}

void init().catch(reportError);
