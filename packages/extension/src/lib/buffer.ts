import type { NewCommentInput } from "@claudback/shared";

// Comments created while the collector is unreachable are appended to a buffer
// in chrome.storage.local and flushed later, in order. The flush is factored
// out of the chrome APIs so it can be tested against plain functions.
export interface BufferDeps {
	read(): Promise<NewCommentInput[]>;
	write(items: NewCommentInput[]): Promise<void>;
	post(input: NewCommentInput): Promise<void>;
}

export interface FlushResult {
	flushed: number;
	remaining: number;
}

// Post buffered comments oldest-first. Stop at the first failure and persist
// the unsent tail (failed item included) so ordering is preserved and nothing
// is dropped; the caller retries later with backoff.
export async function flushBuffer(deps: BufferDeps): Promise<FlushResult> {
	const items = await deps.read();
	let index = 0;

	for (; index < items.length; index += 1) {
		try {
			await deps.post(items[index]);
		} catch {
			break;
		}
	}

	const remaining = items.slice(index);

	if (index > 0) {
		await deps.write(remaining);
	}

	return { flushed: index, remaining: remaining.length };
}
