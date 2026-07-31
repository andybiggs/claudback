import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createFeedbackTracker, FEEDBACK_ASK_THRESHOLD } from "./feedback.js";

describe("feedback tracker", () => {
	let dir: string;
	let filePath: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "claudback-feedback-"));
		filePath = join(dir, "feedback.json");
	});

	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it("stays silent below the threshold", async () => {
		const tracker = createFeedbackTracker({ filePath, threshold: 3 });

		expect(await tracker.recordActioned(1)).toBe(false);
		expect(await tracker.recordActioned(1)).toBe(false);
	});

	it("asks exactly once, on the call that crosses the threshold", async () => {
		const tracker = createFeedbackTracker({ filePath, threshold: 3 });

		expect(await tracker.recordActioned(2)).toBe(false);
		expect(await tracker.recordActioned(2)).toBe(true);
		expect(await tracker.recordActioned(50)).toBe(false);
	});

	it("never asks again in a fresh process once asked", async () => {
		const first = createFeedbackTracker({ filePath, threshold: 1 });

		expect(await first.recordActioned(1)).toBe(true);

		const second = createFeedbackTracker({ filePath, threshold: 1 });

		expect(await second.recordActioned(100)).toBe(false);
	});

	it("accumulates the count across tracker instances", async () => {
		const first = createFeedbackTracker({ filePath, threshold: 4 });

		expect(await first.recordActioned(3)).toBe(false);

		const second = createFeedbackTracker({ filePath, threshold: 4 });

		expect(await second.recordActioned(1)).toBe(true);
	});

	it("ignores zero and negative counts", async () => {
		const tracker = createFeedbackTracker({ filePath, threshold: 1 });

		expect(await tracker.recordActioned(0)).toBe(false);
		expect(await tracker.recordActioned(-5)).toBe(false);

		const raw = await readFile(filePath, "utf8").catch(() => null);

		expect(raw).toBeNull();
	});

	it("treats a corrupt file as a fresh start", async () => {
		await writeFile(filePath, "not json", "utf8");

		const tracker = createFeedbackTracker({ filePath, threshold: 2 });

		expect(await tracker.recordActioned(1)).toBe(false);
		expect(await tracker.recordActioned(1)).toBe(true);
	});

	it("treats a schema-invalid file as a fresh start", async () => {
		await writeFile(filePath, JSON.stringify({ actionedTotal: "many", askedAt: 7 }), "utf8");

		const tracker = createFeedbackTracker({ filePath, threshold: 2 });

		expect(await tracker.recordActioned(2)).toBe(true);
	});

	it("does not double-ask under concurrent calls in one process", async () => {
		const tracker = createFeedbackTracker({ filePath, threshold: 5 });

		const results = await Promise.all(
			Array.from({ length: 10 }, () => tracker.recordActioned(1)),
		);

		expect(results.filter(Boolean)).toHaveLength(1);
	});

	it("persists the asked timestamp from the injected clock", async () => {
		const tracker = createFeedbackTracker({ filePath, threshold: 1, now: () => 1_753_920_000_000 });

		expect(await tracker.recordActioned(1)).toBe(true);

		const state = JSON.parse(await readFile(filePath, "utf8")) as { askedAt: string };

		expect(state.askedAt).toBe(new Date(1_753_920_000_000).toISOString());
	});

	it("defaults to the shipped threshold", async () => {
		const tracker = createFeedbackTracker({ filePath });

		expect(await tracker.recordActioned(FEEDBACK_ASK_THRESHOLD - 1)).toBe(false);
		expect(await tracker.recordActioned(1)).toBe(true);
	});
});
