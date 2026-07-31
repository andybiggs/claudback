import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
	createFeedbackTracker,
	FEEDBACK_ASK_THRESHOLD,
	FEEDBACK_MAX_ASKS,
	FEEDBACK_REASK_INTERVAL_MS,
	type FeedbackTracker,
} from "./feedback.js";

describe("feedback tracker", () => {
	let dir: string;
	let filePath: string;
	let clock: number;

	function tracker(opts?: { threshold?: number; reaskIntervalMs?: number }): FeedbackTracker {
		return createFeedbackTracker({
			filePath,
			now: () => clock,
			threshold: opts?.threshold,
			reaskIntervalMs: opts?.reaskIntervalMs,
		});
	}

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "claudback-feedback-"));
		filePath = join(dir, "feedback.json");
		clock = 1_753_920_000_000;
	});

	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it("stays silent below the threshold", async () => {
		const t = tracker({ threshold: 3 });

		expect(await t.recordActioned(1)).toBe(false);
		expect(await t.recordActioned(1)).toBe(false);
	});

	it("asks on the call that crosses the threshold and not within the interval", async () => {
		const t = tracker({ threshold: 3 });

		expect(await t.recordActioned(2)).toBe(false);
		expect(await t.recordActioned(2)).toBe(true);
		expect(await t.recordActioned(50)).toBe(false);
	});

	it("asks again once the re-ask interval has elapsed", async () => {
		const t = tracker({ threshold: 1, reaskIntervalMs: 1000 });

		expect(await t.recordActioned(1)).toBe(true);

		clock += 999;
		expect(await t.recordActioned(1)).toBe(false);

		clock += 1;
		expect(await t.recordActioned(1)).toBe(true);
	});

	it("uses the shipped four-month default interval", async () => {
		const t = tracker({ threshold: 1 });

		expect(await t.recordActioned(1)).toBe(true);

		clock += FEEDBACK_REASK_INTERVAL_MS - 1;
		expect(await t.recordActioned(1)).toBe(false);

		clock += 1;
		expect(await t.recordActioned(1)).toBe(true);
	});

	it("goes quiet for good after the maximum number of asks", async () => {
		const t = tracker({ threshold: 1, reaskIntervalMs: 1000 });

		for (let ask = 0; ask < FEEDBACK_MAX_ASKS; ask += 1) {
			expect(await t.recordActioned(1)).toBe(true);
			await t.recordOutcome("later");
			clock += 2000;
		}

		expect(await t.recordActioned(100)).toBe(false);

		clock += FEEDBACK_REASK_INTERVAL_MS * 10;
		expect(await t.recordActioned(1)).toBe(false);
	});

	it("never asks again after a done outcome, even after the interval", async () => {
		const t = tracker({ threshold: 1, reaskIntervalMs: 1000 });

		expect(await t.recordActioned(1)).toBe(true);
		await t.recordOutcome("done");

		clock += 10_000;
		expect(await t.recordActioned(100)).toBe(false);
	});

	it("a later outcome restarts the interval from the response, not the ask", async () => {
		const t = tracker({ threshold: 1, reaskIntervalMs: 1000 });

		expect(await t.recordActioned(1)).toBe(true);

		clock += 600;
		await t.recordOutcome("later");

		clock += 999;
		expect(await t.recordActioned(1)).toBe(false);

		clock += 1;
		expect(await t.recordActioned(1)).toBe(true);
	});

	it("persists state across tracker instances", async () => {
		const first = tracker({ threshold: 4 });

		expect(await first.recordActioned(3)).toBe(false);

		const second = tracker({ threshold: 4 });

		expect(await second.recordActioned(1)).toBe(true);
		await second.recordOutcome("done");

		const third = tracker({ threshold: 4 });

		clock += FEEDBACK_REASK_INTERVAL_MS * 2;
		expect(await third.recordActioned(10)).toBe(false);
	});

	it("ignores zero and negative counts", async () => {
		const t = tracker({ threshold: 1 });

		expect(await t.recordActioned(0)).toBe(false);
		expect(await t.recordActioned(-5)).toBe(false);

		const raw = await readFile(filePath, "utf8").catch(() => null);

		expect(raw).toBeNull();
	});

	it("treats a corrupt file as a fresh start", async () => {
		await writeFile(filePath, "not json", "utf8");

		const t = tracker({ threshold: 2 });

		expect(await t.recordActioned(1)).toBe(false);
		expect(await t.recordActioned(1)).toBe(true);
	});

	it("treats a schema-invalid file as a fresh start", async () => {
		await writeFile(filePath, JSON.stringify({ actionedTotal: "many", askedAt: 7 }), "utf8");

		const t = tracker({ threshold: 2 });

		expect(await t.recordActioned(2)).toBe(true);
	});

	it("does not double-ask under concurrent calls in one process", async () => {
		const t = tracker({ threshold: 5, reaskIntervalMs: 60_000 });

		const results = await Promise.all(
			Array.from({ length: 10 }, () => t.recordActioned(1)),
		);

		expect(results.filter(Boolean)).toHaveLength(1);
	});

	it("persists the ask timestamp from the injected clock", async () => {
		const t = tracker({ threshold: 1 });

		expect(await t.recordActioned(1)).toBe(true);

		const state = JSON.parse(await readFile(filePath, "utf8")) as { lastAskedAt: string; done: boolean };

		expect(state.lastAskedAt).toBe(new Date(clock).toISOString());
		expect(state.done).toBe(false);
	});

	it("defaults to the shipped threshold", async () => {
		const t = tracker();

		expect(await t.recordActioned(FEEDBACK_ASK_THRESHOLD - 1)).toBe(false);
		expect(await t.recordActioned(1)).toBe(true);
	});
});
