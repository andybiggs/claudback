import { HTML_EXCERPT_MAX_LENGTH } from "@pinback/shared";

// Capture only the element's tag and attribute NAMES — never attribute values.
// Values routinely carry tokens, session IDs, and PII, none of which should
// ever reach the store or the agent's context. Names alone are enough for it
// to identify the element in source.
export function excerptFromNames(tag: string, attributeNames: string[]): string {
	const names = attributeNames.map((name) => name.toLowerCase()).sort();
	const parts = [tag.toLowerCase(), ...names];

	return `<${parts.join(" ")}>`.slice(0, HTML_EXCERPT_MAX_LENGTH);
}
