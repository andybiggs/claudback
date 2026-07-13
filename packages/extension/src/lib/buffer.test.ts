import { describe, expect, it, vi } from "vitest";

import type { NewCommentInput } from "@claudback/shared";

import { flushBuffer } from "./buffer.js";
import { CollectorHttpError } from "./collector.js";

function makeInput(text: string): NewCommentInput {
	return {
		origin: "https://example.com",
		url: "https://example.com/x",
		selector: "button",
		tag: "button",
		text,
		textSnippet: "",
		htmlExcerpt: "<button>",
		rect: null,
		viewport: null,
		framework: null,
		componentPath: [],
	};
}

describe("flushBuffer", () => {
	it("posts all buffered comments in order and empties the buffer", async () => {
		let stored: NewCommentInput[] = [makeInput("a"), makeInput("b"), makeInput("c")];
		const posted: string[] = [];

		const result = await flushBuffer({
			read: async () => stored,
			write: async (items) => {
				stored = items;
			},
			post: async (input) => {
				posted.push(input.text);
			},
		});

		expect(posted).toEqual(["a", "b", "c"]);
		expect(result).toEqual({ flushed: 3, remaining: 0 });
		expect(stored).toEqual([]);
	});

	it("stops at the first failure and keeps the failed item plus its tail, in order", async () => {
		let stored: NewCommentInput[] = [makeInput("a"), makeInput("b"), makeInput("c")];
		const post = vi
			.fn<(input: NewCommentInput) => Promise<void>>()
			.mockResolvedValueOnce(undefined)
			.mockRejectedValueOnce(new Error("offline"))
			.mockResolvedValue(undefined);

		const result = await flushBuffer({
			read: async () => stored,
			write: async (items) => {
				stored = items;
			},
			post,
		});

		expect(result).toEqual({ flushed: 1, remaining: 2 });
		expect(stored.map((item) => item.text)).toEqual(["b", "c"]);
	});

	it("does not rewrite the buffer when nothing could be sent", async () => {
		const stored = [makeInput("a")];
		const write = vi.fn();

		const result = await flushBuffer({
			read: async () => stored,
			write,
			post: async () => {
				throw new Error("offline");
			},
		});

		expect(result).toEqual({ flushed: 0, remaining: 1 });
		expect(write).not.toHaveBeenCalled();
	});

	it("drops an item rejected with a 4xx and keeps flushing the rest", async () => {
		let stored: NewCommentInput[] = [makeInput("a"), makeInput("b"), makeInput("c")];
		const posted: string[] = [];
		const post = vi
			.fn<(input: NewCommentInput) => Promise<void>>()
			.mockImplementation(async (input) => {
				if (input.text === "b") {
					throw new CollectorHttpError(400);
				}

				posted.push(input.text);
			});

		const result = await flushBuffer({
			read: async () => stored,
			write: async (items) => {
				stored = items;
			},
			post,
		});

		expect(posted).toEqual(["a", "c"]);
		expect(result).toEqual({ flushed: 2, remaining: 0 });
		expect(stored).toEqual([]);
	});

	it("treats a 401 as a stop, not a poisoned item", async () => {
		let stored: NewCommentInput[] = [makeInput("a"), makeInput("b")];

		const result = await flushBuffer({
			read: async () => stored,
			write: async (items) => {
				stored = items;
			},
			post: async () => {
				throw new CollectorHttpError(401);
			},
		});

		expect(result).toEqual({ flushed: 0, remaining: 2 });
		expect(stored.map((item) => item.text)).toEqual(["a", "b"]);
	});

	it("still stops on a network error and preserves order", async () => {
		let stored: NewCommentInput[] = [makeInput("a"), makeInput("b"), makeInput("c")];
		const post = vi
			.fn<(input: NewCommentInput) => Promise<void>>()
			.mockResolvedValueOnce(undefined)
			.mockRejectedValueOnce(new TypeError("fetch failed"))
			.mockResolvedValue(undefined);

		const result = await flushBuffer({
			read: async () => stored,
			write: async (items) => {
				stored = items;
			},
			post,
		});

		expect(result).toEqual({ flushed: 1, remaining: 2 });
		expect(stored.map((item) => item.text)).toEqual(["b", "c"]);
	});

	it("retries successfully on a later flush once the collector returns", async () => {
		let stored: NewCommentInput[] = [makeInput("a")];
		let online = false;
		const deps = {
			read: async () => stored,
			write: async (items: NewCommentInput[]) => {
				stored = items;
			},
			post: async () => {
				if (!online) {
					throw new Error("offline");
				}
			},
		};

		expect(await flushBuffer(deps)).toEqual({ flushed: 0, remaining: 1 });

		online = true;

		expect(await flushBuffer(deps)).toEqual({ flushed: 1, remaining: 0 });
		expect(stored).toEqual([]);
	});
});
