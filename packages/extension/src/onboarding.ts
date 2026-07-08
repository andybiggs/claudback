import type { TestConnectionResponse } from "./messages.js";

const TOKEN_KEY = "claudback_token";
const STEP_COUNT = 4;
const PAIR_STEP = 2;
const POLL_INTERVAL_MS = 2000;

let step = 0;
let pollTimer: number | null = null;
// Whether a saved token has successfully reached the collector this session.
// The pairing step's Next button stays disabled until it has.
let connected = false;

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
			setStatus("No token saved yet — paste the one from ~/.claudback/token.");

			return false;
		}
		case "offline": {
			setStatus("Collector offline — is the MCP server running?");

			return false;
		}
		case "unauthorized": {
			setStatus("Token rejected by the collector — paste the current one from ~/.claudback/token.");

			return false;
		}
		case "synced":
		case "pending": {
			setStatus("Connected to the local collector.", true);
			connected = true;
			updateNav();

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

function pollTick(): void {
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
}

// While the pairing step is visible, quietly re-test so the status flips to
// "Connected" on its own once the user has saved a token and started the
// server — no button mashing needed.
function startPolling(): void {
	stopPolling();
	// Interval first, immediate tick second: if the first tick already reports
	// connected, its stopPolling() must have a timer to clear.
	pollTimer = window.setInterval(pollTick, POLL_INTERVAL_MS);
	pollTick();
}

function updateNav(): void {
	const back = $("back") as HTMLButtonElement;
	const nextBtn = $("next") as HTMLButtonElement;
	const hint = $("nav-hint");
	const gated = step === PAIR_STEP && !connected;

	back.disabled = step === 0;
	nextBtn.textContent = step === STEP_COUNT - 1 ? "Done" : "Next";
	nextBtn.disabled = gated;
	hint.hidden = !gated;
}

function showStep(next: number): void {
	step = Math.max(0, Math.min(STEP_COUNT - 1, next));

	document.querySelectorAll<HTMLElement>(".step").forEach((section) => {
		section.classList.toggle("active", Number(section.dataset.step) === step);
	});
	document.querySelectorAll<HTMLElement>("#step-dots .step-dot").forEach((dot, index) => {
		dot.classList.toggle("active", index <= step);
	});

	updateNav();

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

// Both pairing buttons behave the same: save whatever is in the input (if
// anything), then test. Users shouldn't have to know that "save" and "test"
// are separate operations.
async function saveAndTest(input: HTMLInputElement): Promise<void> {
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

	reportState((await testConnection()).state);
}

function initPairing(): void {
	const input = $("token") as HTMLInputElement;
	const saveBtn = $("save") as HTMLButtonElement;
	const testBtn = $("test") as HTMLButtonElement;
	const onClick = () => {
		void saveAndTest(input).catch(pairingError);
	};

	saveBtn.addEventListener("click", onClick);
	testBtn.addEventListener("click", onClick);

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
