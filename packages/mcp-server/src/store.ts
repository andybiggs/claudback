import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

import { storeSchema, type Comment, type NewCommentInput, type Store, type StoreMode } from "@claudback/shared";

import type { CommentFilter, OriginSummary, ResolveOutcome, StoreApi } from "./store-api.js";

// A fresh object every call: callers mutate the returned store in place
// (push/splice), so a shared singleton here would leak state across calls.
function emptyStore(): Store {
	return { mode: "clear", comments: [] };
}

function matchesFilter(comment: Comment, filter?: CommentFilter): boolean {
	if (filter?.origin !== undefined && comment.origin !== filter.origin) {
		return false;
	}

	if (filter?.urlContains !== undefined && !comment.url.includes(filter.urlContains)) {
		return false;
	}

	return true;
}

// Every method reads and writes the file fresh: the file can change
// out-of-band (extension sync, manual edits), so no in-memory state is kept.
export function createStore(filePath: string): StoreApi {
	async function read(): Promise<Store> {
		try {
			const raw = await readFile(filePath, "utf8");
			const parsed = JSON.parse(raw);
			const result = storeSchema.safeParse(parsed);

			if (!result.success) {
				return emptyStore();
			}

			return result.data;
		} catch {
			return emptyStore();
		}
	}

	async function write(store: Store): Promise<void> {
		await mkdir(dirname(filePath), { recursive: true });
		await writeFile(filePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
	}

	async function addComment(input: NewCommentInput): Promise<Comment> {
		const store = await read();
		const now = new Date().toISOString();
		const comment: Comment = {
			...input,
			id: randomUUID(),
			resolved: false,
			createdAt: now,
			updatedAt: now,
		};

		store.comments.push(comment);
		await write(store);

		return comment;
	}

	async function updateCommentText(id: string, text: string): Promise<Comment | null> {
		const store = await read();
		const comment = store.comments.find((candidate) => candidate.id === id);

		if (!comment) {
			return null;
		}

		comment.text = text;
		comment.updatedAt = new Date().toISOString();
		await write(store);

		return comment;
	}

	async function deleteComment(id: string): Promise<boolean> {
		const store = await read();
		const index = store.comments.findIndex((candidate) => candidate.id === id);

		if (index === -1) {
			return false;
		}

		store.comments.splice(index, 1);
		await write(store);

		return true;
	}

	async function getComments(filter?: CommentFilter): Promise<Comment[]> {
		const store = await read();

		return store.comments.filter((comment) => matchesFilter(comment, filter));
	}

	async function consumeComments(filter?: CommentFilter): Promise<{ mode: StoreMode; comments: Comment[] }> {
		const store = await read();
		const matched: Comment[] = [];
		const now = new Date().toISOString();

		if (store.mode === "clear") {
			const remaining: Comment[] = [];

			for (const comment of store.comments) {
				if (matchesFilter(comment, filter)) {
					matched.push(comment);
				} else {
					remaining.push(comment);
				}
			}

			store.comments = remaining;
		} else {
			for (const comment of store.comments) {
				if (matchesFilter(comment, filter)) {
					comment.resolved = true;
					comment.updatedAt = now;
					matched.push(comment);
				}
			}
		}

		await write(store);

		return { mode: store.mode, comments: matched };
	}

	async function resolveComment(id: string): Promise<ResolveOutcome> {
		const store = await read();
		const index = store.comments.findIndex((candidate) => candidate.id === id);

		if (index === -1) {
			return "not_found";
		}

		if (store.mode === "clear") {
			store.comments.splice(index, 1);
			await write(store);

			return "removed";
		}

		store.comments[index].resolved = true;
		store.comments[index].updatedAt = new Date().toISOString();
		await write(store);

		return "resolved";
	}

	async function clearComments(origin?: string): Promise<number> {
		const store = await read();
		const remaining =
			origin === undefined ? [] : store.comments.filter((comment) => comment.origin !== origin);
		const removed = store.comments.length - remaining.length;

		store.comments = remaining;
		await write(store);

		return removed;
	}

	async function setMode(mode: StoreMode): Promise<Store> {
		const store = await read();

		store.mode = mode;
		await write(store);

		return store;
	}

	async function listOrigins(): Promise<OriginSummary[]> {
		const store = await read();
		const summaries = new Map<string, OriginSummary>();

		for (const comment of store.comments) {
			const existing = summaries.get(comment.origin) ?? {
				origin: comment.origin,
				total: 0,
				unresolved: 0,
			};

			existing.total += 1;

			if (!comment.resolved) {
				existing.unresolved += 1;
			}

			summaries.set(comment.origin, existing);
		}

		return [...summaries.values()].sort((a, b) => a.origin.localeCompare(b.origin));
	}

	return {
		read,
		addComment,
		updateCommentText,
		deleteComment,
		getComments,
		consumeComments,
		resolveComment,
		clearComments,
		setMode,
		listOrigins,
	};
}
