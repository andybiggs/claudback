// Validates detect-result replies from the main-world detector. The reply
// crosses the page boundary, so treat it as hostile: any deviation from the
// exact expected shape is dropped and the comment saves without component
// data.

import { z } from "zod";
import { COMPONENT_NAME_MAX_LENGTH, COMPONENT_PATH_MAX_DEPTH } from "@claudback/shared";

const replySchema = z.object({
	nonce: z.string().min(1),
	framework: z.string().min(1).max(32),
	components: z
		.array(z.string().min(1).max(COMPONENT_NAME_MAX_LENGTH))
		.min(1)
		.max(COMPONENT_PATH_MAX_DEPTH),
});

export function parseDetectReply(
	raw: unknown,
	expectedNonce: string,
): { framework: string; components: string[] } | null {
	if (typeof raw !== "string" || raw.length > 4096) {
		return null;
	}

	let parsed: unknown;

	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}

	const result = replySchema.safeParse(parsed);

	if (!result.success || result.data.nonce !== expectedNonce) {
		return null;
	}

	return { framework: result.data.framework, components: result.data.components };
}
