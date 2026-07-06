import { z } from "zod";
import {
	COMMENT_TEXT_MAX_LENGTH,
	HTML_EXCERPT_MAX_LENGTH,
	TEXT_SNIPPET_MAX_LENGTH,
} from "./constants.js";

export const rectSchema = z.object({
	x: z.number().finite(),
	y: z.number().finite(),
	width: z.number().finite(),
	height: z.number().finite(),
});

export const viewportSchema = z.object({
	width: z.number().finite(),
	height: z.number().finite(),
});

const newCommentFieldsSchema = z.object({
	origin: z.string().min(1),
	url: z.string(),
	selector: z.string(),
	tag: z.string(),
	text: z.string().min(1).max(COMMENT_TEXT_MAX_LENGTH),
	textSnippet: z.string().max(TEXT_SNIPPET_MAX_LENGTH),
	htmlExcerpt: z.string().max(HTML_EXCERPT_MAX_LENGTH),
	rect: rectSchema.nullable().default(null),
	viewport: viewportSchema.nullable().default(null),
});

export const newCommentInputSchema = newCommentFieldsSchema;

export const commentSchema = newCommentFieldsSchema.extend({
	id: z.string().uuid(),
	resolved: z.boolean().default(false),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});

export const storeModeSchema = z.preprocess((value) => {
	if (value === "clear" || value === "keep") {
		return value;
	}

	return "clear";
}, z.enum(["clear", "keep"]));

export const storeSchema = z.object({
	mode: storeModeSchema.default("clear"),
	comments: z.array(commentSchema).default([]),
});

export type Rect = z.infer<typeof rectSchema>;
export type Viewport = z.infer<typeof viewportSchema>;
export type NewCommentInput = z.infer<typeof newCommentInputSchema>;
export type Comment = z.infer<typeof commentSchema>;
export type StoreMode = z.infer<typeof storeModeSchema>;
export type Store = z.infer<typeof storeSchema>;
