// Framework-component detection for a picked element. Pure logic — no
// chrome.* or window access — so the main-world detector entry stays a thin
// shell and this walks are unit-testable. Runs against UNTRUSTED page
// internals: every entry point tolerates hostile getters and garbage shapes.

// Constants come via the subpath export: the barrel index pulls in the zod
// schemas, which would bloat the main-world detector bundle by ~125KB.
import { COMPONENT_NAME_MAX_LENGTH, COMPONENT_PATH_MAX_DEPTH } from "@claudback/shared/constants";

export type Framework = "react" | "vue";

export type DetectResult = { framework: Framework; components: string[] };

// react-reconciler work tags for renderable user components.
const REACT_FUNCTION_COMPONENT = 0;
const REACT_CLASS_COMPONENT = 1;

function validName(candidate: unknown): string | null {
	if (typeof candidate !== "string" || candidate.length < 3) {
		// One- and two-letter names are minifier output — useless to Claude.
		return null;
	}

	return candidate.slice(0, COMPONENT_NAME_MAX_LENGTH);
}

function componentName(type: unknown): string | null {
	if (typeof type !== "function" && (typeof type !== "object" || type === null)) {
		return null;
	}

	return validName(
		(type as { displayName?: unknown }).displayName ?? (type as { name?: unknown }).name,
	);
}

// Vue's own wrapper components carry no source-locating value.
const VUE_BUILTIN_NAMES = new Set([
	"RouterView",
	"RouterLink",
	"AsyncComponentWrapper",
	"BaseTransition",
	"Transition",
	"TransitionGroup",
	"KeepAlive",
	"Suspense",
	"Teleport",
]);

function vueName(type: unknown): string | null {
	if (typeof type !== "function" && (typeof type !== "object" || type === null)) {
		return null;
	}

	const name = validName(
		(type as { name?: unknown }).name ?? (type as { __name?: unknown }).__name,
	);

	if (name === null || VUE_BUILTIN_NAMES.has(name)) {
		return null;
	}

	return name;
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
		const name = vueName(type);

		if (name) {
			components.push(name);
		}

		node = (node as { parent?: unknown; $parent?: unknown }).parent ??
			(node as { $parent?: unknown }).$parent;
	}

	return components;
}

// Production Vue 3 builds attach no per-element instance refs (those are
// dev/devtools-only), but the renderer keeps the vnode tree on the app
// container for patching. Walk it top-down, at each level descending into the
// child component whose rendered subtree contains the target element.
type VueVnode = { el?: unknown; children?: unknown; component?: unknown; suspense?: unknown };
type VueInstance = { type?: unknown; subTree?: VueVnode };

function subtreeContains(instance: unknown, target: Element): boolean {
	const el = (instance as VueInstance).subTree?.el;

	return (
		typeof el === "object" &&
		el !== null &&
		(el as Node).nodeType === 1 &&
		(el as Element).contains(target)
	);
}

function childComponentInstances(instance: unknown, budget: { nodes: number }): unknown[] {
	const out: unknown[] = [];

	const walk = (vnode: unknown, depth: number): void => {
		if (!vnode || typeof vnode !== "object" || depth > 25 || budget.nodes <= 0) {
			return;
		}

		budget.nodes -= 1;
		const v = vnode as VueVnode;

		if (v.component) {
			out.push(v.component);

			return;
		}

		if (Array.isArray(v.children)) {
			for (const child of v.children) {
				walk(child, depth + 1);
			}
		}

		const suspense = v.suspense as { activeBranch?: unknown } | undefined;

		if (suspense && typeof suspense === "object") {
			walk(suspense.activeBranch, depth + 1);
		}
	};

	walk((instance as VueInstance).subTree, 0);

	return out;
}

export function vueComponentsFromVnodeTree(rootComponent: unknown, target: Element): string[] {
	const names: string[] = [];
	// One shared budget bounds the whole walk against huge or cyclic trees.
	const budget = { nodes: 5000 };
	let current = rootComponent;

	for (let depth = 0; depth < 60 && current && typeof current === "object"; depth += 1) {
		const name = vueName((current as VueInstance).type);

		if (name) {
			names.push(name);
		}

		current = childComponentInstances(current, budget).find((child) =>
			subtreeContains(child, target),
		);
	}

	// Collected top-down; the comment wants nearest-first, keeping the
	// deepest (most specific) names when the chain is long.
	names.reverse();

	return names.slice(0, COMPONENT_PATH_MAX_DEPTH);
}

function findVueRootComponent(el: Element): unknown {
	let current: Element | null = el;

	for (let hops = 0; hops < 200 && current; hops += 1) {
		const record = current as unknown as Record<string, unknown>;

		if (record.__vue_app__) {
			const vnode = record._vnode as { component?: unknown } | undefined;

			if (vnode && typeof vnode === "object" && vnode.component) {
				return vnode.component;
			}
		}

		current = current.parentElement;
	}

	return null;
}

type Detector = { framework: Framework; detect(el: Element): string[] | null };

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

		if (instance) {
			const components = vueComponentsFromInstance(instance);

			return components.length > 0 ? components : null;
		}

		const rootComponent = findVueRootComponent(el);

		if (!rootComponent) {
			return null;
		}

		const components = vueComponentsFromVnodeTree(rootComponent, el);

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
