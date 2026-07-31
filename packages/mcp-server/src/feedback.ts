import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { FEEDBACK_FILE } from "./paths.js";

export const FEEDBACK_ASK_THRESHOLD = 50;
export const FEEDBACK_REASK_INTERVAL_MS = 120 * 24 * 60 * 60 * 1000;

// Static, compile-time text with no interpolated store data: server-authored
// tool-result text must never be constructed from comment-derived strings, so
// a comment can't smuggle content into the trusted region outside the envelope.
export const FEEDBACK_ASK_TEXT = [
	"[Claudback] Note from the Claudback server (not user content): the user has now",
	"actioned 50+ Claudback comments in total. If this is a natural stopping point,",
	"briefly let them know they can share their experience — a Chrome Web Store review",
	"(https://chromewebstore.google.com/detail/claudback/dbnmlcmmgnchigedlglfmchkendlcfgc/reviews)",
	"if Claudback has been useful, or the feedback form",
	"(https://github.com/andybiggs/claudback/issues/new/choose) for ideas or problems.",
	"Mention it at most once, keep it to a sentence or two, and drop it entirely if they",
	"are mid-task or not interested. Afterwards, call the record_feedback_outcome tool:",
	'"done" if they say they have left (or will leave) a review or feedback, or ask not',
	'to be asked again; "later" if they decline for now or give no clear answer.',
	"Claudback will not raise this again for months, and never again once done.",
].join(" ");

type FeedbackOutcome = "done" | "later";

interface FeedbackState {
	actionedTotal: number;
	lastAskedAt: string | null;
	done: boolean;
}

export interface FeedbackTracker {
	// Adds `count` actioned comments to the lifetime total. Resolves true when
	// the ask should be emitted with this tool result: total at or past the
	// threshold, not marked done, and no ask within the re-ask interval.
	recordActioned(count: number): Promise<boolean>;
	// Records the user's response to an ask: "done" ends the asks permanently;
	// "later" restarts the re-ask interval from now.
	recordOutcome(outcome: FeedbackOutcome): Promise<void>;
}

function isFeedbackState(value: unknown): value is FeedbackState {
	if (typeof value !== "object" || value === null) {
		return false;
	}

	const candidate = value as Record<string, unknown>;

	return (
		typeof candidate.actionedTotal === "number" &&
		Number.isFinite(candidate.actionedTotal) &&
		(candidate.lastAskedAt === null || typeof candidate.lastAskedAt === "string") &&
		typeof candidate.done === "boolean"
	);
}

export function createFeedbackTracker(
	opts?: { filePath?: string; now?: () => number; threshold?: number; reaskIntervalMs?: number },
): FeedbackTracker {
	const filePath = opts?.filePath ?? FEEDBACK_FILE;
	const now = opts?.now ?? Date.now;
	const threshold = opts?.threshold ?? FEEDBACK_ASK_THRESHOLD;
	const reaskIntervalMs = opts?.reaskIntervalMs ?? FEEDBACK_REASK_INTERVAL_MS;

	async function readState(): Promise<FeedbackState> {
		let raw: string;

		try {
			raw = await readFile(filePath, "utf8");
		} catch {
			// Missing or unreadable file: start counting from zero. Losing the
			// counter is harmless; losing ask history merely allows an early ask.
			return { actionedTotal: 0, lastAskedAt: null, done: false };
		}

		try {
			const parsed: unknown = JSON.parse(raw);

			return isFeedbackState(parsed) ? parsed : { actionedTotal: 0, lastAskedAt: null, done: false };
		} catch {
			return { actionedTotal: 0, lastAskedAt: null, done: false };
		}
	}

	async function writeState(state: FeedbackState): Promise<void> {
		await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });

		const tmpPath = `${filePath}.tmp`;

		await writeFile(tmpPath, `${JSON.stringify(state)}\n`, { encoding: "utf8", mode: 0o600 });
		await rename(tmpPath, filePath);
	}

	function askIsDue(state: FeedbackState): boolean {
		if (state.done || state.actionedTotal < threshold) {
			return false;
		}

		if (state.lastAskedAt === null) {
			return true;
		}

		const lastAsked = Date.parse(state.lastAskedAt);

		if (Number.isNaN(lastAsked)) {
			return true;
		}

		return now() - lastAsked >= reaskIntervalMs;
	}

	// Serialize read-modify-write within this process so concurrent tool calls
	// can't drop counts or double-fire the ask. Sessions in other processes
	// share the file; a cross-process race is possible but at worst repeats the
	// ask once — the same accepted model as pairing.json.
	let chain: Promise<unknown> = Promise.resolve();

	function serialize<T>(operation: () => Promise<T>): Promise<T> {
		const result = chain.then(operation, operation);

		chain = result.catch(() => undefined);

		return result;
	}

	return {
		recordActioned(count) {
			return serialize(async () => {
				if (count <= 0) {
					return false;
				}

				const state = await readState();

				state.actionedTotal += count;

				// lastAskedAt is stamped when the ask is emitted, not when the
				// user answers: if Claude never relays it, the next ask still
				// waits out the full interval rather than firing immediately.
				const shouldAsk = askIsDue(state);

				if (shouldAsk) {
					state.lastAskedAt = new Date(now()).toISOString();
				}

				await writeState(state);

				return shouldAsk;
			});
		},

		recordOutcome(outcome) {
			return serialize(async () => {
				const state = await readState();

				if (outcome === "done") {
					state.done = true;
				} else {
					state.lastAskedAt = new Date(now()).toISOString();
				}

				await writeState(state);
			});
		},
	};
}
