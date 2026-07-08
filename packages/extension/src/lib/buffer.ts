import { CollectorHttpError } from "./collector.js";

// Comments created while the collector is unreachable are appended to a buffer
// in chrome.storage.local and flushed later, in order. The flush is factored
// out of the chrome APIs so it can be tested against plain functions.
export interface BufferDeps<T> {
	read(): Promise<T[]>;
	write(items: T[]): Promise<void>;
	post(item: T): Promise<void>;
}

export interface FlushResult {
	flushed: number;
	remaining: number;
}

// Post buffered comments oldest-first. A 4xx response (except 401) means the
// collector rejected that specific item — retrying it can never succeed, so
// drop it and keep flushing the rest. A 401 means the pairing token itself was
// rejected, and any other failure (network error, 5xx) means the collector is
// unreachable or unhealthy: stop and persist the unsent tail (failed item
// included) so ordering is preserved; the caller retries later.
export async function flushBuffer<T>(deps: BufferDeps<T>): Promise<FlushResult> {
	const items = await deps.read();
	const remaining: T[] = [];
	let flushed = 0;
	let stoppedAt = -1;

	for (let index = 0; index < items.length; index += 1) {
		try {
			await deps.post(items[index]);
			flushed += 1;
		} catch (error) {
			if (error instanceof CollectorHttpError && error.status >= 400 && error.status < 500 && error.status !== 401) {
				console.error("[claudback] collector rejected buffered comment, dropping it:", error.status);
				continue;
			}

			stoppedAt = index;
			break;
		}
	}

	if (stoppedAt >= 0) {
		remaining.push(...items.slice(stoppedAt));
	}

	if (remaining.length !== items.length) {
		await deps.write(remaining);
	}

	return { flushed, remaining: remaining.length };
}
