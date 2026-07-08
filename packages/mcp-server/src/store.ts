import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
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
	// An unreadable store must never be silently replaced: the next write would
	// destroy the user's comments. Set the bad file aside so it can be recovered.
	async function quarantine(reason: string): Promise<Store> {
		const corruptPath = `${filePath}.corrupt-${new Date().toISOString()}`;

		console.error(`[claudback] store file ${filePath} is unreadable (${reason}); moving it to ${corruptPath}`);

		try {
			await rename(filePath, corruptPath);
		} catch (error) {
			console.error("[claudback] failed to set aside corrupt store file:", error);
		}

		return emptyStore();
	}

	async function read(): Promise<Store> {
		let raw: string;

		try {
			raw = await readFile(filePath, "utf8");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") {
				return emptyStore();
			}

			return quarantine(String(error));
		}

		let parsed: unknown;

		try {
			parsed = JSON.parse(raw);
		} catch {
			return quarantine("invalid JSON");
		}

		const result = storeSchema.safeParse(parsed);

		if (!result.success) {
			return quarantine("failed schema validation");
		}

		return result.data;
	}

	async function write(store: Store): Promise<void> {
		// 0700/0600: the store holds user-authored comment text; keep it private
		// to this user, matching the token file.
		await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });

		// Write-then-rename so a crash mid-write can never leave a truncated
		// store behind.
		const tmpPath = `${filePath}.tmp`;

		await writeFile(tmpPath, `${JSON.stringify(store, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
		await rename(tmpPath, filePath);
	}

	// Serialize mutations: each one is a read-modify-write of the whole file,
	// so two running concurrently would drop one's changes.
	let mutationChain: Promise<unknown> = Promise.resolve();

	function mutate<T>(operation: () => Promise<T>): Promise<T> {
		const result = mutationChain.then(operation, operation);

		mutationChain = result.catch(() => undefined);

		return result;
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

	async function unresolveComment(id: string): Promise<Comment | null> {
		const store = await read();
		const comment = store.comments.find((candidate) => candidate.id === id);

		if (!comment) {
			return null;
		}

		comment.resolved = false;
		comment.updatedAt = new Date().toISOString();
		await write(store);

		return comment;
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
		addComment: (input) => mutate(() => addComment(input)),
		updateCommentText: (id, text) => mutate(() => updateCommentText(id, text)),
		deleteComment: (id) => mutate(() => deleteComment(id)),
		getComments,
		consumeComments: (filter) => mutate(() => consumeComments(filter)),
		resolveComment: (id) => mutate(() => resolveComment(id)),
		unresolveComment: (id) => mutate(() => unresolveComment(id)),
		clearComments: (origin) => mutate(() => clearComments(origin)),
		setMode: (mode) => mutate(() => setMode(mode)),
		listOrigins,
	};
}
