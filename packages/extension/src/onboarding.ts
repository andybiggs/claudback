import type { TestConnectionResponse } from "./messages.js";

const TOKEN_KEY = "claudback_token";
const STEP_COUNT = 4;
const PAIR_STEP = 2;
const POLL_INTERVAL_MS = 2000;

let step = 0;
let pollTimer: number | null = null;

function $(id: string): HTMLElement {
	const el = document.getElementById(id);

	if (!el) {
		throw new Error(`missing element #${id}`);
	}

	return el;
}

function setStatus(text: string, ok = false): void {
	$("status-text").textContent = text;
	$("status-dot").classList.toggle("ok", ok);
}

async function loadToken(): Promise<string> {
	const result = await chrome.storage.local.get(TOKEN_KEY);
	const token = result[TOKEN_KEY];

	return typeof token === "string" ? token : "";
}

async function testConnection(): Promise<TestConnectionResponse> {
	return (await chrome.runtime.sendMessage({ type: "testConnection" })) as TestConnectionResponse;
}

function reportState(state: TestConnectionResponse["state"]): boolean {
	switch (state) {
		case "unpaired": {
			setStatus("Not paired — save a token first.");

			return false;
		}
		case "offline": {
			setStatus("Collector offline — is the MCP server running?");

			return false;
		}
		case "synced":
		case "pending": {
			setStatus("Connected to the local collector.", true);

			return true;
		}
		default: {
			setStatus("Unexpected response from the extension — try again.");

			return false;
		}
	}
}

function stopPolling(): void {
	if (pollTimer !== null) {
		clearInterval(pollTimer);
		pollTimer = null;
	}
}

// While the pairing step is visible, quietly re-test so the status flips to
// "Connected" on its own once the user has saved a token and started the
// server — no button mashing needed.
function startPolling(): void {
	stopPolling();
	pollTimer = window.setInterval(() => {
		void (async () => {
			if ((await loadToken()) === "") {
				return;
			}

			const result = await testConnection();

			if (reportState(result.state)) {
				stopPolling();
			}
		})().catch((error: unknown) => {
			// A rejected sendMessage here means the extension context is gone
			// (reloaded/updated), so further ticks can never succeed.
			stopPolling();
			console.error("[claudback] onboarding poll failed:", error);
			setStatus("Lost contact with the extension — reload this page.");
		});
	}, POLL_INTERVAL_MS);
}

function showStep(next: number): void {
	step = Math.max(0, Math.min(STEP_COUNT - 1, next));

	document.querySelectorAll<HTMLElement>(".step").forEach((section) => {
		section.classList.toggle("active", Number(section.dataset.step) === step);
	});
	document.querySelectorAll<HTMLElement>("#step-dots .step-dot").forEach((dot, index) => {
		dot.classList.toggle("active", index <= step);
	});

	const back = $("back") as HTMLButtonElement;
	const nextBtn = $("next") as HTMLButtonElement;

	back.disabled = step === 0;
	nextBtn.textContent = step === STEP_COUNT - 1 ? "Done" : "Next";

	if (step === PAIR_STEP) {
		startPolling();
	} else {
		stopPolling();
	}
}

function initTabs(): void {
	document.querySelectorAll<HTMLButtonElement>(".tab").forEach((tab) => {
		tab.addEventListener("click", () => {
			document.querySelectorAll<HTMLElement>(".tab").forEach((t) => {
				t.classList.toggle("active", t === tab);
			});
			document.querySelectorAll<HTMLElement>(".tab-panel").forEach((panel) => {
				panel.classList.toggle("active", panel.dataset.panel === tab.dataset.tab);
			});
		});
	});
}

function initCopyButtons(): void {
	document.querySelectorAll<HTMLButtonElement>(".copy").forEach((button) => {
		button.addEventListener("click", () => {
			const source = button.dataset.copy;
			const text = source ? document.getElementById(source)?.textContent : null;

			if (!text) {
				return;
			}

			void navigator.clipboard
				.writeText(text)
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
	});
}

function pairingError(error: unknown): void {
	console.error("[claudback] onboarding pairing failed:", error);
	setStatus("Something went wrong — reload this page and try again.");
}

function initPairing(): void {
	const input = $("token") as HTMLInputElement;
	const saveBtn = $("save") as HTMLButtonElement;
	const testBtn = $("test") as HTMLButtonElement;

	saveBtn.addEventListener("click", () => {
		void (async () => {
			const token = input.value.trim();

			if (!token) {
				setStatus("Enter a token first.");

				return;
			}

			await chrome.storage.local.set({ [TOKEN_KEY]: token });
			input.value = "";
			setStatus("Token saved — testing…");
			reportState((await testConnection()).state);
		})().catch(pairingError);
	});

	testBtn.addEventListener("click", () => {
		void (async () => {
			setStatus("Testing…");
			reportState((await testConnection()).state);
		})().catch(pairingError);
	});

	void loadToken()
		.then((token) => {
			if (token !== "") {
				setStatus("A token is saved. Paste a new one to replace it.");
			}
		})
		.catch(pairingError);
}

function initNav(): void {
	$("back").addEventListener("click", () => {
		showStep(step - 1);
	});
	$("next").addEventListener("click", () => {
		if (step === STEP_COUNT - 1) {
			window.close();

			return;
		}

		showStep(step + 1);
	});
}

initTabs();
initCopyButtons();
initNav();
initPairing();
showStep(0);
