import type { Comment, NewCommentInput, Store, StoreMode } from "@claudback/shared";

export interface CommentFilter {
	origin?: string;
	urlContains?: string;
}

export interface OriginSummary {
	origin: string;
	total: number;
	unresolved: number;
}

export type ResolveOutcome = "removed" | "resolved" | "not_found";

// Contract between the collector/tools (lead-owned) and the persistence layer.
// Implementations read and write the store file on every call — no in-memory
// state — so the file can safely change out-of-band between requests.
export interface StoreApi {
	read(): Promise<Store>;
	addComment(input: NewCommentInput): Promise<Comment>;
	updateCommentText(id: string, text: string): Promise<Comment | null>;
	deleteComment(id: string): Promise<boolean>;
	getComments(filter?: CommentFilter): Promise<Comment[]>;
	// Returns matching comments and applies the mode to each: "clear" removes
	// them from the store, "keep" marks them resolved.
	consumeComments(filter?: CommentFilter): Promise<{ mode: StoreMode; comments: Comment[] }>;
	// "clear" mode removes the comment ("removed"); "keep" mode retains it
	// flagged resolved ("resolved").
	resolveComment(id: string): Promise<ResolveOutcome>;
	clearComments(origin?: string): Promise<number>;
	setMode(mode: StoreMode): Promise<Store>;
	listOrigins(): Promise<OriginSummary[]>;
}
