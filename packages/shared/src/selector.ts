// Builds a stable, human-readable CSS selector for an element so Claude can
// locate it in source. Prefers ids and data-testids; otherwise walks up the
// tree building an `:nth-of-type` path. Dependency-free.

function isUniqueId(id: string): boolean {
	try {
		return document.querySelectorAll(`#${CSS.escape(id)}`).length === 1;
	} catch {
		return false;
	}
}

function nthOfType(el: Element): string {
	const tag = el.tagName.toLowerCase();
	const parent = el.parentElement;

	if (!parent) {
		return tag;
	}

	const siblings = Array.from(parent.children).filter(
		(child) => child.tagName === el.tagName,
	);

	if (siblings.length === 1) {
		return tag;
	}

	const index = siblings.indexOf(el) + 1;

	return `${tag}:nth-of-type(${index})`;
}

export function buildSelector(el: Element): string {
	if (el.id && isUniqueId(el.id)) {
		return `#${CSS.escape(el.id)}`;
	}

	const testId = el.getAttribute("data-testid");

	if (testId) {
		const candidate = `[data-testid="${testId}"]`;

		if (document.querySelectorAll(candidate).length === 1) {
			return candidate;
		}
	}

	const path: string[] = [];
	let current: Element | null = el;

	while (current && current.tagName.toLowerCase() !== "html") {
		// Anchor the path early on the nearest id ancestor to keep it short.
		if (current.id && isUniqueId(current.id)) {
			path.unshift(`#${CSS.escape(current.id)}`);
			break;
		}

		path.unshift(nthOfType(current));

		if (current.tagName.toLowerCase() === "body") {
			break;
		}

		current = current.parentElement;
	}

	return path.join(" > ");
}
