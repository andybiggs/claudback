// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import {
	detectComponents,
	reactComponentsFromFiber,
	vueComponentsFromInstance,
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

	it("skips host elements, fragments, providers, and minified single-letter names", () => {
		const tree = fiber(0, { name: "t" }, fiber(7, null, fiber(10, {}, fiber(0, { name: "Page" }))));
		expect(reactComponentsFromFiber(tree)).toEqual(["Page"]);
	});

	it("caps the chain at 5 names", () => {
		let node: Record<string, unknown> | null = null;
		for (const name of ["G7", "F6", "E5", "D4", "C3", "B2", "A1"]) {
			node = fiber(0, { name }, node);
		}
		expect(reactComponentsFromFiber(node)).toEqual(["A1", "B2", "C3", "D4", "E5"]);
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
