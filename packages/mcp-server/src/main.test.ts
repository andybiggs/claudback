import type { Server } from "node:http";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { retryTakeover } from "./main.js";

const fakeResult = { server: {} as Server, port: 12345 };

describe("retryTakeover", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("keeps retrying while the port is taken, then reports the takeover once", async () => {
		const start = vi
			.fn<() => Promise<typeof fakeResult | undefined>>()
			.mockResolvedValueOnce(undefined)
			.mockResolvedValueOnce(undefined)
			.mockResolvedValue(fakeResult);
		const onTaken = vi.fn();

		retryTakeover(start, 2_000, onTaken);

		await vi.advanceTimersByTimeAsync(2_000);
		expect(onTaken).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(4_000);
		expect(onTaken).toHaveBeenCalledExactlyOnceWith(12345);
		expect(start).toHaveBeenCalledTimes(3);

		// The interval must be cleared after success — further ticks would
		// bind (and leak) fresh servers.
		await vi.advanceTimersByTimeAsync(10_000);
		expect(start).toHaveBeenCalledTimes(3);
		expect(onTaken).toHaveBeenCalledTimes(1);
	});

	it("logs rejections and keeps retrying instead of dying silently", async () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const start = vi
			.fn<() => Promise<typeof fakeResult | undefined>>()
			.mockRejectedValueOnce(new Error("EACCES"))
			.mockResolvedValue(fakeResult);
		const onTaken = vi.fn();

		retryTakeover(start, 2_000, onTaken);

		await vi.advanceTimersByTimeAsync(2_000);
		expect(error).toHaveBeenCalledOnce();
		expect(onTaken).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(2_000);
		expect(onTaken).toHaveBeenCalledExactlyOnceWith(12345);
	});
});
