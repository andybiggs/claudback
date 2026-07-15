// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import {
	detectComponents,
	reactComponentsFromFiber,
	vueComponentsFromInstance,
	vueComponentsFromVnodeTree,
} from "./component-detect.js";

// Minimal fiber mocks. tag numbers per react-reconciler: 0 FunctionComponent,
// 1 ClassComponent, 5 HostComponent, 10 ContextProvider, 7 Fragment.
function fiber(tag: number, type: unknown, parent: unknown = null): Record<string, unknown> {
	return { tag, type, return: parent };
}

describe("reactComponentsFromFiber", () => {
	it("collects named function/class components nearest-first", () => {
		const App = { name: "App" };
		const Form = { displayName: "CheckoutForm" };
		const Button = { name: "SubmitButton" };
		const tree = fiber(0, Button, fiber(5, "div", fiber(0, Form, fiber(1, App))));
		expect(reactComponentsFromFiber(tree)).toEqual(["SubmitButton", "CheckoutForm", "App"]);
	});

	it("skips host elements, fragments, providers, and minified short names", () => {
		// "t" and "er" are minifier output (real example: production React
		// chains polluted with "er"/"Tr"/"Ke"); anything under 3 chars goes.
		const tree = fiber(0, { name: "t" }, fiber(7, null, fiber(0, { name: "er" }, fiber(10, {}, fiber(0, { name: "Page" })))));
		expect(reactComponentsFromFiber(tree)).toEqual(["Page"]);
	});

	it("skips library wrappers and any *Route component (custom guards included)", () => {
		// A user cell wrapped in react-router internals, a custom ProtectedRoute
		// guard, and a redux Provider: only the user's own components surface.
		const tree = fiber(
			0,
			{ name: "PriceCell" },
			fiber(
				0,
				{ displayName: "RenderedRoute" },
				fiber(0, { name: "ProtectedRoute" }, fiber(0, { name: "Provider" }, fiber(0, { name: "App" }))),
			),
		);
		expect(reactComponentsFromFiber(tree)).toEqual(["PriceCell", "App"]);
	});

	it("reads names off memo/forwardRef wrappers and skips routes + links", () => {
		// Realistic mobx chain: click inside a NavLink (forwardRef) whose parent is
		// observer(InsightsNavigation) (memo, name on the wrapper), under a
		// ProtectedRoutes guard, under App.
		const app = { tag: 0, type: { name: "App" }, return: null };
		const guard = { tag: 0, type: { name: "ProtectedRoutes" }, return: app };
		const observed = {
			tag: 15,
			type: { name: "InsightsNavigation" },
			elementType: { displayName: "InsightsNavigation" },
			return: guard,
		};
		const navLink = { tag: 11, type: { render: () => undefined }, elementType: { displayName: "NavLink" }, return: observed };

		expect(reactComponentsFromFiber(navLink)).toEqual(["InsightsNavigation", "App"]);
	});

	it("prefers the render-owner chain, skipping DOM wrappers in the return chain", () => {
		// The clicked <span> is owned by HeaderActionsResync (observer/memo), which
		// is owned by App. Its .return chain runs through an antd Wave wrapper that
		// the owner chain never visits.
		const app = { tag: 0, type: { name: "App" }, return: null };
		const header = {
			tag: 15,
			type: { name: "HeaderActionsResync" },
			elementType: { displayName: "HeaderActionsResync" },
			_debugOwner: app,
		};
		const wave = { tag: 0, type: { name: "Wave" }, return: app };
		const hostSpan = { tag: 5, type: "span", _debugOwner: header, return: wave };

		expect(reactComponentsFromFiber(hostSpan)).toEqual(["HeaderActionsResync", "App"]);
	});

	it("falls back to the return chain when owner data is absent (production)", () => {
		// No _debugOwner anywhere → behaves like the classic parent-chain walk.
		const tree = fiber(0, { name: "SubmitButton" }, fiber(0, { name: "App" }));
		expect(reactComponentsFromFiber(tree)).toEqual(["SubmitButton", "App"]);
	});

	it("reads a forwardRef component's name from its render function", () => {
		function PriceField(): null {
			return null;
		}
		const fwd = { tag: 11, type: { render: PriceField }, return: null };

		expect(reactComponentsFromFiber(fwd)).toEqual(["PriceField"]);
	});

	it("caps the chain at 5 names", () => {
		let node: Record<string, unknown> | null = null;
		for (const name of ["Ggg", "Fff", "Eee", "Ddd", "Ccc", "Bbb", "Aaa"]) {
			node = fiber(0, { name }, node);
		}
		expect(reactComponentsFromFiber(node)).toEqual(["Aaa", "Bbb", "Ccc", "Ddd", "Eee"]);
	});

	it("truncates names longer than COMPONENT_NAME_MAX_LENGTH", () => {
		const long = "X".repeat(300);
		const result = reactComponentsFromFiber(fiber(0, { name: long }));
		expect(result[0]).toHaveLength(128);
	});

	it("returns [] for null/garbage input", () => {
		expect(reactComponentsFromFiber(null)).toEqual([]);
		expect(reactComponentsFromFiber({ return: "junk" })).toEqual([]);
	});
});

describe("vueComponentsFromInstance", () => {
	it("collects component names via parent chain (Vue 3 shape)", () => {
		const app = { type: { name: "App" }, parent: null };
		const form = { type: { __name: "CheckoutForm" }, parent: app };
		const button = { type: { name: "SubmitButton" }, parent: form };
		expect(vueComponentsFromInstance(button)).toEqual(["SubmitButton", "CheckoutForm", "App"]);
	});

	it("returns [] for garbage input", () => {
		expect(vueComponentsFromInstance(undefined)).toEqual([]);
	});
});

// Production Vue 3 attaches no per-element instance refs; detection walks the
// vnode tree from the app root by DOM containment instead. Mock instances
// mirror the runtime-core shape: { type, subTree: { el, children, component } }.
describe("vueComponentsFromVnodeTree", () => {
	function nest(): { root: Record<string, unknown>; target: Element } {
		const rootEl = document.createElement("div");
		const pageEl = document.createElement("main");
		const cardEl = document.createElement("section");
		const target = document.createElement("button");
		cardEl.append(target);
		pageEl.append(cardEl);
		rootEl.append(pageEl);
		document.body.append(rootEl);

		const card = { type: { name: "ProjectCard" }, subTree: { el: cardEl, children: [] } };
		const sidebar = {
			type: { name: "Sidebar" },
			subTree: { el: document.createElement("aside"), children: [] },
		};
		const page = {
			type: { __name: "Explore" },
			subTree: { el: pageEl, children: [{ component: sidebar }, { component: card }] },
		};
		const routerView = {
			type: { name: "RouterView" },
			subTree: { el: pageEl, children: [{ component: page }] },
		};
		const root = {
			type: { name: "App" },
			subTree: { el: rootEl, children: [{ component: routerView }] },
		};

		return { root, target };
	}

	it("collects the containment chain nearest-first, skipping vue built-ins", () => {
		const { root, target } = nest();
		expect(vueComponentsFromVnodeTree(root, target)).toEqual(["ProjectCard", "Explore", "App"]);
	});

	it("keeps the 5 nearest names on deep chains", () => {
		const target = document.createElement("button");
		let el: Element = target;
		let child: Record<string, unknown> | null = null;
		for (const name of ["Lv1", "Lv2", "Lv3", "Lv4", "Lv5", "Lv6", "Lv7"]) {
			const wrap = document.createElement("div");
			wrap.append(el);
			el = wrap;
			child = {
				type: { name },
				subTree: { el: wrap, children: child ? [{ component: child }] : [] },
			};
		}
		document.body.append(el);
		expect(vueComponentsFromVnodeTree(child, target)).toEqual(["Lv1", "Lv2", "Lv3", "Lv4", "Lv5"]);
	});

	it("returns [] for garbage input", () => {
		expect(vueComponentsFromVnodeTree(null, document.createElement("div"))).toEqual([]);
		expect(vueComponentsFromVnodeTree({ subTree: "junk" }, document.createElement("div"))).toEqual([]);
	});

	it("terminates on cyclic trees and respects the depth cap", () => {
		const target = document.createElement("button");
		document.body.append(target);
		// A self-referential component whose subtree always contains the target
		// would descend forever without the depth/budget bounds.
		const cyclic: Record<string, unknown> = { type: { name: "Loop" } };
		cyclic.subTree = { el: document.body, children: [{ component: cyclic }] };
		const result = vueComponentsFromVnodeTree(cyclic, target);
		expect(result.length).toBeLessThanOrEqual(5);
		expect(result.every((name) => name === "Loop")).toBe(true);
	});
});

describe("detectComponents", () => {
	it("finds react via the __reactFiber$ expando", () => {
		const el = document.createElement("button");
		(el as unknown as Record<string, unknown>)["__reactFiber$abc123"] = fiber(0, { name: "SubmitButton" });
		expect(detectComponents(el)).toEqual({ framework: "react", components: ["SubmitButton"] });
	});

	it("finds vue via __vueParentComponent", () => {
		const el = document.createElement("button");
		(el as unknown as Record<string, unknown>).__vueParentComponent = {
			type: { name: "SubmitButton" },
			parent: null,
		};
		expect(detectComponents(el)).toEqual({ framework: "vue", components: ["SubmitButton"] });
	});

	it("returns null on a plain element", () => {
		expect(detectComponents(document.createElement("div"))).toBeNull();
	});

	it("finds production vue via __vue_app__ + _vnode on an ancestor", () => {
		const rootEl = document.createElement("div");
		const target = document.createElement("button");
		rootEl.append(target);
		document.body.append(rootEl);

		const rootComponent = {
			type: { name: "App" },
			subTree: { el: rootEl, children: [] },
		};
		const record = rootEl as unknown as Record<string, unknown>;
		record.__vue_app__ = {};
		record._vnode = { component: rootComponent };

		expect(detectComponents(target)).toEqual({ framework: "vue", components: ["App"] });
	});

	it("climbs to an ancestor carrying the react fiber", () => {
		const wrapper = document.createElement("div");
		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		wrapper.append(svg);
		(wrapper as unknown as Record<string, unknown>)["__reactFiber$abc123"] = fiber(0, { name: "IconButton" });
		expect(detectComponents(svg)).toEqual({ framework: "react", components: ["IconButton"] });
	});

	it("climbs to an ancestor carrying the vue instance", () => {
		const wrapper = document.createElement("div");
		const child = document.createElement("span");
		wrapper.append(child);
		(wrapper as unknown as Record<string, unknown>).__vueParentComponent = {
			type: { name: "IconButton" },
			parent: null,
		};
		expect(detectComponents(child)).toEqual({ framework: "vue", components: ["IconButton"] });
	});

	it("gives up past the 5-level ancestor cap", () => {
		const target = document.createElement("span");
		let el: Element = target;
		for (let i = 0; i < 5; i += 1) {
			const wrap = document.createElement("div");
			wrap.append(el);
			el = wrap;
		}
		// el is now the 5th ancestor — one past the walk's last probe (self + 4).
		(el as unknown as Record<string, unknown>)["__reactFiber$abc123"] = fiber(0, { name: "TooFarUp" });
		expect(detectComponents(target)).toBeNull();
	});

	it("terminates on a cyclic react fiber chain at the name cap", () => {
		const node = fiber(0, { name: "Loop" });
		node.return = node;
		expect(reactComponentsFromFiber(node)).toEqual(["Loop", "Loop", "Loop", "Loop", "Loop"]);
	});

	it("survives a hostile expando getter", () => {
		const el = document.createElement("div");
		Object.defineProperty(el, "__reactFiber$boom", {
			enumerable: true,
			get() {
				throw new Error("boom");
			},
		});
		expect(detectComponents(el)).toBeNull();
	});
});
