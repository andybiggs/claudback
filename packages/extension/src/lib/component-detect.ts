// Framework-component detection for a picked element. Pure logic — no
// chrome.* or window access — so the main-world detector entry stays a thin
// shell and this walks are unit-testable. Runs against UNTRUSTED page
// internals: every entry point tolerates hostile getters and garbage shapes.

// Constants come via the subpath export: the barrel index pulls in the zod
// schemas, which would bloat the main-world detector bundle by ~125KB.
import { COMPONENT_NAME_MAX_LENGTH, COMPONENT_PATH_MAX_DEPTH } from "@claudback/shared/constants";

export type Framework = "react" | "vue";

export type DetectResult = { framework: Framework; components: string[] };

// react-reconciler work tags for component fibers we surface. Includes the HOC
// wrappers (ForwardRef, Memo, SimpleMemo) so a component wrapped by
// memo()/forwardRef()/mobx observer() — whose name lives on the wrapper, not a
// plain function fiber — isn't skipped and mistaken for a higher ancestor.
const RENDERABLE_FIBER_TAGS = new Set([
	0, // FunctionComponent
	1, // ClassComponent
	11, // ForwardRef
	14, // MemoComponent
	15, // SimpleMemoComponent
]);

function validName(candidate: unknown): string | null {
	if (typeof candidate !== "string" || candidate.length < 3) {
		// One- and two-letter names are minifier output — useless to Claude.
		return null;
	}

	return candidate.slice(0, COMPONENT_NAME_MAX_LENGTH);
}

// Router/provider/boundary wrappers from common React libraries. They're real
// fibers in the tree but carry no "which of my components is this" value, so
// they'd otherwise mask the user's own (often minified/anonymous) components —
// e.g. surfacing react-router's <RenderedRoute> for a table cell.
const REACT_LIBRARY_NAMES = new Set([
	// react-router (v5/v6 internals + public wrappers). Names ending in "Route"
	// are handled by isRouteWrapper instead.
	"Router",
	"Routes",
	"Switch",
	"Outlet",
	"Navigate",
	"BrowserRouter",
	"HashRouter",
	"MemoryRouter",
	"StaticRouter",
	"RouterProvider",
	"DataRouterProvider",
	"DataRoutes",
	"RenderErrorBoundary",
	// context providers / generic wrappers
	"Provider",
	"Consumer",
	"StrictMode",
	"Suspense",
	"Profiler",
	"Fragment",
	"QueryClientProvider",
	"HelmetProvider",
	// react-router link components — the user's own wrapping component is a more
	// useful "where is this" than the link itself.
	"Link",
	"NavLink",
	// Ant Design / rc-* internal wrappers (ripple, portals, triggers, motion).
	// These wrap interactive elements but never locate the user's own component.
	"Wave",
	"Ripple",
	"Trigger",
	"Portal",
	"Overlay",
	"Align",
	"CSSMotion",
	"CSSMotionList",
	"ResizeObserver",
	"DomWrapper",
	"Overflow",
]);

// A fiber's type/elementType can be the component directly, or a memo (.type) /
// forwardRef (.render) wrapper object. Read the name off whichever level carries
// it, peeling wrappers — HOCs like mobx observer set displayName on the wrapper.
function readComponentName(candidate: unknown, depth = 0): string | null {
	if (depth > 4 || (typeof candidate !== "function" && (typeof candidate !== "object" || candidate === null))) {
		return null;
	}

	const direct =
		validName((candidate as { displayName?: unknown }).displayName) ??
		validName((candidate as { name?: unknown }).name);

	if (direct) {
		return direct;
	}

	const inner = (candidate as { type?: unknown }).type ?? (candidate as { render?: unknown }).render;

	return inner ? readComponentName(inner, depth + 1) : null;
}

function componentNameFromFiber(node: { type?: unknown; elementType?: unknown }): string | null {
	// elementType is the original element (carries a HOC's displayName); type may
	// be the unwrapped inner component. Try the wrapper first.
	const name = readComponentName(node.elementType) ?? readComponentName(node.type);

	if (name === null || REACT_LIBRARY_NAMES.has(name) || isRouteWrapper(name)) {
		return null;
	}

	return name;
}

// Any component whose name ends in "Route"/"Routes" is a routing wrapper — the
// built-in RenderedRoute, or app guards like ProtectedRoute(s)/PrivateRoute.
// None locate the user's own UI, so skip them all rather than blocklisting each.
function isRouteWrapper(name: string): boolean {
	return /Routes?$/.test(name);
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
	// Prefer the render-owner chain: `_debugOwner` is the component that authored
	// each element, so it names the user's own components and steps over the
	// library DOM wrappers (antd Wave, router internals, …) that clutter the
	// parent chain. `_debugOwner` is dev-only, so fall back to the return
	// (DOM-parent) chain — with the same filters — when it's absent (production).
	const viaOwner = reactComponentsViaOwner(fiber);

	return viaOwner.length > 0 ? viaOwner : reactComponentsViaReturn(fiber);
}

function reactComponentsViaOwner(fiber: unknown): string[] {
	const components: string[] = [];
	// The passed fiber is the clicked element's (host) fiber; its owner is the
	// nearest component that rendered it.
	let node = (fiber as { _debugOwner?: unknown })?._debugOwner;
	let hops = 0;

	while (node && typeof node === "object" && hops < 500 && components.length < COMPONENT_PATH_MAX_DEPTH) {
		hops += 1;

		const name = componentNameFromFiber(node as { type?: unknown; elementType?: unknown });

		if (name) {
			components.push(name);
		}

		node = (node as { _debugOwner?: unknown })._debugOwner;
	}

	return components;
}

function reactComponentsViaReturn(fiber: unknown): string[] {
	const components: string[] = [];
	let node = fiber;
	// Bounded walk: fiber trees are finite, but a hostile page could hand us a
	// cyclic structure.
	let hops = 0;

	while (node && typeof node === "object" && hops < 500 && components.length < COMPONENT_PATH_MAX_DEPTH) {
		hops += 1;

		const current = node as { tag?: unknown; type?: unknown; elementType?: unknown; return?: unknown };

		if (RENDERABLE_FIBER_TAGS.has(current.tag as number)) {
			const name = componentNameFromFiber(current);

			if (name) {
				components.push(name);
			}
		}

		node = current.return;
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
