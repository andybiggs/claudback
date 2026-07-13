// Framework-component detection for a picked element. Pure logic — no
// chrome.* or window access — so the main-world detector entry stays a thin
// shell and this walks are unit-testable. Runs against UNTRUSTED page
// internals: every entry point tolerates hostile getters and garbage shapes.

import { COMPONENT_NAME_MAX_LENGTH, COMPONENT_PATH_MAX_DEPTH } from "@claudback/shared";

export type DetectResult = { framework: string; components: string[] };

// react-reconciler work tags for renderable user components.
const REACT_FUNCTION_COMPONENT = 0;
const REACT_CLASS_COMPONENT = 1;

function componentName(type: unknown): string | null {
	if (typeof type !== "function" && (typeof type !== "object" || type === null)) {
		return null;
	}

	const candidate =
		(type as { displayName?: unknown }).displayName ?? (type as { name?: unknown }).name;

	if (typeof candidate !== "string" || candidate.length < 2) {
		// Single-letter names are minifier output — useless to Claude.
		return null;
	}

	return candidate.slice(0, COMPONENT_NAME_MAX_LENGTH);
}

export function reactComponentsFromFiber(fiber: unknown): string[] {
	const components: string[] = [];
	let node = fiber;
	// Bounded walk: fiber trees are finite, but a hostile page could hand us a
	// cyclic structure.
	let hops = 0;

	while (node && typeof node === "object" && hops < 500 && components.length < COMPONENT_PATH_MAX_DEPTH) {
		hops += 1;

		const { tag, type } = node as { tag?: unknown; type?: unknown };

		if (tag === REACT_FUNCTION_COMPONENT || tag === REACT_CLASS_COMPONENT) {
			const name = componentName(type);

			if (name) {
				components.push(name);
			}
		}

		node = (node as { return?: unknown }).return;
	}

	return components;
}

export function vueComponentsFromInstance(instance: unknown): string[] {
	const components: string[] = [];
	let node = instance;
	let hops = 0;

	while (node && typeof node === "object" && hops < 500 && components.length < COMPONENT_PATH_MAX_DEPTH) {
		hops += 1;

		const type = (node as { type?: unknown; $options?: unknown }).type ??
			(node as { $options?: unknown }).$options;
		const raw =
			(type as { name?: unknown; __name?: unknown } | undefined)?.name ??
			(type as { __name?: unknown } | undefined)?.__name;

		if (typeof raw === "string" && raw.length >= 2) {
			components.push(raw.slice(0, COMPONENT_NAME_MAX_LENGTH));
		}

		node = (node as { parent?: unknown; $parent?: unknown }).parent ??
			(node as { $parent?: unknown }).$parent;
	}

	return components;
}

type Detector = { framework: string; detect(el: Element): string[] | null };

const reactDetector: Detector = {
	framework: "react",
	detect(el) {
		for (const key of Object.getOwnPropertyNames(el)) {
			if (key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$")) {
				const components = reactComponentsFromFiber((el as unknown as Record<string, unknown>)[key]);

				return components.length > 0 ? components : null;
			}
		}

		return null;
	},
};

const vueDetector: Detector = {
	framework: "vue",
	detect(el) {
		const record = el as unknown as Record<string, unknown>;
		const instance = record.__vueParentComponent ?? record.__vue__;

		if (!instance) {
			return null;
		}

		const components = vueComponentsFromInstance(instance);

		return components.length > 0 ? components : null;
	},
};

const detectors: Detector[] = [reactDetector, vueDetector];

export function detectComponents(el: Element): DetectResult | null {
	// Walk up the DOM a few levels: the picked node is often a host child
	// (svg, span) of the element the fiber is attached to.
	let current: Element | null = el;

	for (let depth = 0; depth < 5 && current; depth += 1) {
		for (const detector of detectors) {
			try {
				const components = detector.detect(current);

				if (components) {
					return { framework: detector.framework, components };
				}
			} catch {
				// Hostile getter or exotic framework fork — try the next detector.
			}
		}

		current = current.parentElement;
	}

	return null;
}
