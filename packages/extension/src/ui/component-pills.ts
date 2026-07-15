// Green component "pill" building blocks: name pills, path pills, and the
// name/tree cell variants that fall back to raw HTML tags/selectors when an
// element wasn't mapped to a React/Vue component (or the setting is off).

import { FRAMEWORK_ICONS } from "./icons.js";
import { escapeHtml } from "./html.js";

// Green pill holding the nearest component name + framework icon, e.g. "⚛ <Button>".
// Pass `tip` to attach a hover tooltip (used in the pin popover to surface the
// full component path); omit it elsewhere so name pills stay tooltip-free.
export function componentNamePill(framework: string, components: string[], tip = ""): string {
	const icon = FRAMEWORK_ICONS[framework] ?? "";
	const tipAttr = tip ? ` data-tip="${escapeHtml(tip)}"` : "";

	return `<span class="component-pill mono"${tipAttr}>${icon}<span class="pill-text">&lt;${escapeHtml(components[0])}&gt;</span></span>`;
}

// List name cell: nearest component name pill, or raw HTML tag when unmapped/off.
export function componentNameHtml(framework: string, components: string[], tag: string): string {
	if (components.length === 0) {
		return `<span class="mono">${escapeHtml(tag)}</span>`;
	}

	return componentNamePill(framework, components);
}

// Path cell body: the plain (muted, ellipsis-truncated) component tree, or the
// raw DOM selector when unmapped/off. Untruncated text lives in the tooltip.
export function componentTreeHtml(components: string[], selector: string): string {
	if (components.length === 0) {
		return escapeHtml(selector);
	}

	return escapeHtml(componentTreeText(components));
}

// Plain (un-escaped) root → leaf breadcrumb of a component path, e.g.
// "<App> › <Layout> › <Button>". Feeds both the pill body and its tooltip.
export function componentTreeText(components: string[]): string {
	return components
		.slice()
		.reverse()
		.map((name) => `<${name}>`)
		.join(" › ");
}

// Untruncated tooltip text for a path cell: the component tree when converting,
// otherwise the raw selector.
export function pathTipText(components: string[], selector: string): string {
	return components.length > 0 ? componentTreeText(components) : selector;
}
