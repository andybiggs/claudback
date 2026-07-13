import { z } from "zod";
import {
	COMMENT_TEXT_MAX_LENGTH,
	COMPONENT_NAME_MAX_LENGTH,
	COMPONENT_PATH_MAX_DEPTH,
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
	framework: z.string().max(32).nullable().default(null),
	componentPath: z
		.array(z.string().min(1).max(COMPONENT_NAME_MAX_LENGTH))
		.max(COMPONENT_PATH_MAX_DEPTH)
		.default([]),
});

// A component chain without a framework is a half-populated pair no producer
// emits; reject it rather than store it. The reverse (framework with an empty
// path) is tolerated: ingest sanitization can legitimately empty the path.
const componentPairing = {
	check: (value: { framework: string | null; componentPath: string[] }) =>
		value.componentPath.length === 0 || value.framework !== null,
	message: "componentPath requires framework",
};

export const newCommentInputSchema = newCommentFieldsSchema.refine(
	componentPairing.check,
	{ message: componentPairing.message, path: ["componentPath"] },
);

export const commentSchema = newCommentFieldsSchema.extend({
	id: z.string().uuid(),
	resolved: z.boolean().default(false),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
}).refine(componentPairing.check, { message: componentPairing.message, path: ["componentPath"] });

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
