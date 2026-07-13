# Component Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user pins a Claudback comment, detect the React or Vue component that rendered the element and attach a capped component-ancestry chain to the comment, surfaced in the composer UI and in `get_comments`.

**Architecture:** A new main-world `detector.js` bundle hosts a framework-agnostic detector registry (React fiber walk, Vue instance walk). The isolated-world content script talks to it over a nonce-matched CustomEvent bridge with a 100 ms timeout; detection is best-effort and silent on failure. Two optional schema fields (`framework`, `componentPath`) flow through the existing collector → store → MCP pipeline.

**Tech Stack:** TypeScript, MV3 Chrome extension (esbuild, `chrome.scripting.executeScript`), zod, vitest, npm workspaces.

**Spec:** `specs/2026-07-13-component-mapping-design.md` — read it before starting.

## Global Constraints

- Component chain is nearest-first, **max 5** named components.
- New constant `COMPONENT_NAME_MAX_LENGTH = 128`.
- Detection failure of any kind → comment saves exactly as today (`framework: null`, `componentPath: []`). No error UI, no console noise in production paths.
- Detect replies are **untrusted page input**: nonce-matched and schema-validated in the content script before use.
- The detector bundle must not touch comments, storage, or the network — it only answers detect events.
- No manifest permission changes. No new runtime dependencies.
- Backward compatibility: old comments and old-extension payloads must still parse (new fields default).
- Repo conventions: tabs for indentation, `.js` extension on relative TS imports, vitest tests colocated next to source, `npm run typecheck` (tsc -b) and `npm test` must pass before every commit.

---

### Task 1: Shared schema — `framework` + `componentPath` fields

**Files:**
- Modify: `packages/shared/src/constants.ts`
- Modify: `packages/shared/src/schema.ts`
- Test: `packages/shared/src/schema.test.ts`

**Interfaces:**
- Consumes: existing `newCommentFieldsSchema`, `commentSchema`.
- Produces: `Comment`/`NewCommentInput` types gain `framework: string | null` and `componentPath: string[]`; constants `COMPONENT_NAME_MAX_LENGTH = 128` and `COMPONENT_PATH_MAX_DEPTH = 5` exported from `@claudback/shared`.

- [ ] **Step 1: Write the failing tests**

Add to `packages/shared/src/schema.test.ts` (follow the file's existing describe/it style):

```ts
describe("component fields", () => {
	it("defaults framework and componentPath when absent (old payloads)", () => {
		const parsed = newCommentInputSchema.parse(baseInput()); // reuse the file's existing valid-input helper; add one if absent
		expect(parsed.framework).toBeNull();
		expect(parsed.componentPath).toEqual([]);
	});

	it("accepts a react component chain", () => {
		const parsed = newCommentInputSchema.parse({
			...baseInput(),
			framework: "react",
			componentPath: ["SubmitButton", "CheckoutForm", "CheckoutPage", "App"],
		});
		expect(parsed.componentPath).toHaveLength(4);
	});

	it("rejects more than 5 components", () => {
		const result = newCommentInputSchema.safeParse({
			...baseInput(),
			framework: "react",
			componentPath: ["A1", "B2", "C3", "D4", "E5", "F6"],
		});
		expect(result.success).toBe(false);
	});

	it("rejects component names over COMPONENT_NAME_MAX_LENGTH", () => {
		const result = newCommentInputSchema.safeParse({
			...baseInput(),
			componentPath: ["x".repeat(COMPONENT_NAME_MAX_LENGTH + 1)],
		});
		expect(result.success).toBe(false);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace=@claudback/shared`
Expected: FAIL — new tests error (`framework`/`componentPath` unknown, constants not exported).

- [ ] **Step 3: Implement**

`packages/shared/src/constants.ts` — add:

```ts
export const COMPONENT_NAME_MAX_LENGTH = 128;
export const COMPONENT_PATH_MAX_DEPTH = 5;
```

`packages/shared/src/schema.ts` — import the constants and add to `newCommentFieldsSchema`:

```ts
	framework: z.string().max(32).nullable().default(null),
	componentPath: z
		.array(z.string().min(1).max(COMPONENT_NAME_MAX_LENGTH))
		.max(COMPONENT_PATH_MAX_DEPTH)
		.default([]),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace=@claudback/shared && npm run typecheck`
Expected: PASS. (Typecheck must pass repo-wide — downstream packages tolerate the new optional fields because they default.)

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/constants.ts packages/shared/src/schema.ts packages/shared/src/schema.test.ts
git commit -m "feat(shared): add framework and componentPath comment fields"
```

---

### Task 2: Pure detection walkers (React + Vue)

**Files:**
- Create: `packages/extension/src/lib/component-detect.ts`
- Test: `packages/extension/src/lib/component-detect.test.ts`

**Interfaces:**
- Consumes: `COMPONENT_PATH_MAX_DEPTH`, `COMPONENT_NAME_MAX_LENGTH` from `@claudback/shared`.
- Produces:
  - `type DetectResult = { framework: string; components: string[] }`
  - `detectComponents(el: Element): DetectResult | null` — runs the registry (react, then vue), first non-null wins, every detector wrapped in try/catch.
  - Internal walkers exported for tests: `reactComponentsFromFiber(fiber: unknown): string[]`, `vueComponentsFromInstance(instance: unknown): string[]`.

These are pure functions with no chrome.* or window dependencies, so they unit-test cleanly and the main-world entry (Task 3) stays a thin shell. Pattern precedent: `packages/extension/src/lib/excerpt.ts`.

- [ ] **Step 1: Write the failing tests**

`packages/extension/src/lib/component-detect.test.ts`:

```ts
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
```

Note: these tests need a DOM. Check `packages/extension/vitest.config.ts` — if `environment` is not already `jsdom` (or `happy-dom`), add `environment: "jsdom"` via a `// @vitest-environment jsdom` comment at the top of this test file only, and add `jsdom` as a devDependency of the extension package if it isn't installed (`npm install -D jsdom --workspace=@claudback/extension`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace=@claudback/extension`
Expected: FAIL — module `./component-detect.js` not found.

- [ ] **Step 3: Implement**

`packages/extension/src/lib/component-detect.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace=@claudback/extension && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/extension/src/lib/component-detect.ts packages/extension/src/lib/component-detect.test.ts packages/extension/vitest.config.ts packages/extension/package.json package-lock.json
git commit -m "feat(extension): add pure React/Vue component-detection walkers"
```

(Include vitest.config/package files only if Step 1's jsdom note required touching them.)

---

### Task 3: Main-world detector entry + esbuild bundle + injection

**Files:**
- Create: `packages/extension/src/detector.ts`
- Modify: `packages/extension/esbuild.mjs` (entryPoints, ~line 30)
- Modify: `packages/extension/src/background.ts` (three `executeScript` sites: ~lines 354, 582, 602)

**Interfaces:**
- Consumes: `detectComponents` from `./lib/component-detect.js`.
- Produces (bridge protocol, consumed by Task 4):
  - Request: CustomEvent `"claudback:detect"` on `document`, `detail` is the nonce string; target element carries attribute `data-claudback-probe="<nonce>"`.
  - Response: CustomEvent `"claudback:detect-result"` on `document`, `detail` is a JSON **string**: `{"nonce": string, "framework": string, "components": string[]}`. No reply is sent when nothing is detected.

No unit test for this task (it's chrome-API and event glue); verification is typecheck + build + the Task 6 manual matrix. Keep it thin — all logic lives in Task 2's module.

- [ ] **Step 1: Write `packages/extension/src/detector.ts`**

```ts
// Main-world detector. Injected alongside content.js (which runs isolated)
// because React/Vue internals are main-world expandos on DOM nodes. This file
// must stay a thin event-answering shell: it never touches comments, storage,
// or the network, and only ever replies with component names.

import { detectComponents } from "./lib/component-detect.js";

const FLAG = "__claudbackDetector";

// Guard against double injection (enable + re-injection retry).
if (!(window as unknown as Record<string, unknown>)[FLAG]) {
	(window as unknown as Record<string, unknown>)[FLAG] = true;

	document.addEventListener("claudback:detect", (event) => {
		const nonce = (event as CustomEvent<unknown>).detail;

		if (typeof nonce !== "string" || nonce.length === 0 || nonce.length > 64) {
			return;
		}

		const el = document.querySelector(`[data-claudback-probe="${CSS.escape(nonce)}"]`);

		if (!el) {
			return;
		}

		const result = detectComponents(el);

		if (!result) {
			return;
		}

		document.dispatchEvent(
			new CustomEvent("claudback:detect-result", {
				// JSON string, not an object: cross-world structured clone of
				// page-created objects is inconsistent across Chrome versions.
				detail: JSON.stringify({ nonce, framework: result.framework, components: result.components }),
			}),
		);
	});
}
```

- [ ] **Step 2: Add the bundle to esbuild**

In `packages/extension/esbuild.mjs`, add to `entryPoints`:

```js
		detector: root("./src/detector.ts"),
```

- [ ] **Step 3: Inject `detector.js` wherever `content.js` is injected**

In `packages/extension/src/background.ts` there are three `chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] })` calls (~lines 354, 582, 602 — the enable flow and the v0.1.4 re-injection retry paths). Immediately after each, add:

```ts
	await chrome.scripting.executeScript({
		target: { tabId },
		files: ["detector.js"],
		world: "MAIN",
	});
```

If the surrounding code wraps the content.js call in error handling (the retry path does), the detector call goes inside the same handling — a detector injection failure must not disable the tab; detection just won't happen. Where the two calls are adjacent with no special handling, prefer wrapping only the detector call in its own `try { … } catch { /* detection is best-effort */ }`.

- [ ] **Step 4: Build and typecheck**

Run: `npm run typecheck && npm run build --workspace=@claudback/extension && ls packages/extension/dist/detector.js`
Expected: typecheck passes; `detector.js` exists in dist.

- [ ] **Step 5: Commit**

```bash
git add packages/extension/src/detector.ts packages/extension/esbuild.mjs packages/extension/src/background.ts
git commit -m "feat(extension): inject main-world detector bundle"
```

---

### Task 4: Content-script bridge — request, validate, attach to payload

**Files:**
- Create: `packages/extension/src/lib/detect-reply.ts`
- Test: `packages/extension/src/lib/detect-reply.test.ts`
- Modify: `packages/extension/src/content.ts` (`openComposer` ~line 485, `buildPayload` ~line 550)

**Interfaces:**
- Consumes: bridge protocol from Task 3; schema constants from Task 1.
- Produces:
  - `parseDetectReply(raw: unknown, expectedNonce: string): { framework: string; components: string[] } | null` (in `detect-reply.ts`) — validates an untrusted reply.
  - In `content.ts`: `requestComponentInfo(el: Element): Promise<{ framework: string; components: string[] } | null>` and `buildPayload` gains a `component` parameter.

- [ ] **Step 1: Write the failing tests for reply validation**

`packages/extension/src/lib/detect-reply.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { parseDetectReply } from "./detect-reply.js";

const NONCE = "abc-123";
const good = JSON.stringify({ nonce: NONCE, framework: "react", components: ["SubmitButton", "App"] });

describe("parseDetectReply", () => {
	it("accepts a valid reply", () => {
		expect(parseDetectReply(good, NONCE)).toEqual({ framework: "react", components: ["SubmitButton", "App"] });
	});

	it("rejects a nonce mismatch", () => {
		expect(parseDetectReply(good, "other-nonce")).toBeNull();
	});

	it("rejects junk JSON and non-strings", () => {
		expect(parseDetectReply("{not json", NONCE)).toBeNull();
		expect(parseDetectReply({ nonce: NONCE }, NONCE)).toBeNull();
		expect(parseDetectReply(undefined, NONCE)).toBeNull();
	});

	it("rejects oversized chains and names", () => {
		const tooMany = JSON.stringify({ nonce: NONCE, framework: "react", components: ["A1", "B2", "C3", "D4", "E5", "F6"] });
		const tooLong = JSON.stringify({ nonce: NONCE, framework: "react", components: ["x".repeat(200)] });
		expect(parseDetectReply(tooMany, NONCE)).toBeNull();
		expect(parseDetectReply(tooLong, NONCE)).toBeNull();
	});

	it("rejects empty or non-string component entries and weird frameworks", () => {
		expect(parseDetectReply(JSON.stringify({ nonce: NONCE, framework: "react", components: [""] }), NONCE)).toBeNull();
		expect(parseDetectReply(JSON.stringify({ nonce: NONCE, framework: "react", components: [42] }), NONCE)).toBeNull();
		expect(parseDetectReply(JSON.stringify({ nonce: NONCE, framework: "x".repeat(64), components: ["App"] }), NONCE)).toBeNull();
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace=@claudback/extension`
Expected: FAIL — module `./detect-reply.js` not found.

- [ ] **Step 3: Implement `packages/extension/src/lib/detect-reply.ts`**

```ts
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
```

Check `packages/extension/package.json`: if `zod` is not already a dependency (content.ts currently only imports from `@claudback/shared`, which depends on zod), add it explicitly rather than relying on hoisting: `npm install zod --workspace=@claudback/extension` matching the version in `packages/shared/package.json`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace=@claudback/extension`
Expected: PASS.

- [ ] **Step 5: Wire the bridge into `content.ts`**

Add near the other helpers (imports at top: `import { parseDetectReply } from "./lib/detect-reply.js";`):

```ts
	const DETECT_TIMEOUT_MS = 100;

	function requestComponentInfo(
		el: Element,
	): Promise<{ framework: string; components: string[] } | null> {
		return new Promise((resolve) => {
			const nonce = crypto.randomUUID();

			const finish = (value: { framework: string; components: string[] } | null): void => {
				document.removeEventListener("claudback:detect-result", onResult);
				el.removeAttribute("data-claudback-probe");
				clearTimeout(timer);
				resolve(value);
			};

			const onResult = (event: Event): void => {
				const reply = parseDetectReply((event as CustomEvent<unknown>).detail, nonce);

				if (reply) {
					finish(reply);
				}
				// Wrong nonce/shape: keep listening until our reply or timeout.
			};

			const timer = setTimeout(() => finish(null), DETECT_TIMEOUT_MS);

			document.addEventListener("claudback:detect-result", onResult);
			el.setAttribute("data-claudback-probe", nonce);
			document.dispatchEvent(new CustomEvent("claudback:detect", { detail: nonce }));
		});
	}
```

In `openComposer` (~line 485), kick off detection as the composer opens and stash the promise; in the `save` handler pass its result to `buildPayload`:

```ts
		const componentPromise = requestComponentInfo(el); // first line of openComposer
		…
		// inside the save branch, before sendGuarded:
		const component = await componentPromise;
		…
		{ type: "create", payload: buildPayload(el, selector, text, component) },
```

Extend `buildPayload` (~line 550):

```ts
	function buildPayload(
		el: Element,
		selector: string,
		text: string,
		component: { framework: string; components: string[] } | null,
	): NewCommentInput {
		const rect = el.getBoundingClientRect();

		return {
			origin: window.location.origin,
			url: window.location.href,
			selector,
			tag: el.tagName.toLowerCase(),
			text,
			textSnippet: (el.textContent || "").trim().slice(0, 512),
			// Names only — no attribute values ever leave the page.
			htmlExcerpt: excerptFromNames(el.tagName, el.getAttributeNames()),
			framework: component?.framework ?? null,
			componentPath: component?.components ?? [],
			rect: {
				x: rect.left + window.scrollX,
				y: rect.top + window.scrollY,
				width: rect.width,
				height: rect.height,
			},
			viewport: { width: window.innerWidth, height: window.innerHeight },
		};
	}
```

- [ ] **Step 6: Typecheck, full test run**

Run: `npm run typecheck && npm test`
Expected: PASS across all workspaces.

- [ ] **Step 7: Commit**

```bash
git add packages/extension/src/lib/detect-reply.ts packages/extension/src/lib/detect-reply.test.ts packages/extension/src/content.ts packages/extension/package.json package-lock.json
git commit -m "feat(extension): bridge component detection into comment payloads"
```

---

### Task 5: Composer + pin-popover component chip with framework icon

**Files:**
- Modify: `packages/extension/src/content.ts` (`openComposer` ~line 495 popover HTML, `openPinPopover` ~line 574, and the overlay stylesheet — find the `.tagchip` CSS rule in the same file)

**Interfaces:**
- Consumes: `componentPromise` from Task 4; `Comment.framework` / `Comment.componentPath` from Task 1.
- Produces: `componentChipHtml(framework: string, components: string[]): string` helper inside content.ts. No downstream consumers.

No unit test (shadow-DOM UI); verified by the Task 6 manual matrix. Keep the chip consistent with the existing `tagchip mono` styling.

- [ ] **Step 1: Add the chip helper and icons**

In `content.ts`, near `escapeHtml`:

```ts
	// 12px inline framework marks, currentColor so they follow chip text color.
	const FRAMEWORK_ICONS: Record<string, string> = {
		react:
			'<svg viewBox="-11 -11 22 22" width="12" height="12" aria-hidden="true"><circle r="2" fill="currentColor"/><g stroke="currentColor" fill="none"><ellipse rx="10" ry="4.2"/><ellipse rx="10" ry="4.2" transform="rotate(60)"/><ellipse rx="10" ry="4.2" transform="rotate(120)"/></g></svg>',
		vue:
			'<svg viewBox="0 0 24 22" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M14.8 0L12 4.8 9.2 0H0l12 21 12-21h-9.2zM3.6 2.1h3.2L12 11l5.2-8.9h3.2L12 16.9 3.6 2.1z"/></svg>',
	};

	function componentChipHtml(framework: string, components: string[]): string {
		if (components.length === 0) {
			return "";
		}

		const icon = FRAMEWORK_ICONS[framework] ?? "";
		const chain = components.join(" < ");

		return `<span class="componentchip mono" title="${escapeHtml(chain)}">${icon}&lt;${escapeHtml(components[0])}&gt;</span>`;
	}
```

- [ ] **Step 2: Render the chip in the composer when detection resolves**

In `openComposer`, after `shadow.append(pop)`, append asynchronously so the composer never waits on detection:

```ts
		void componentPromise.then((component) => {
			if (!component || !pop.isConnected) {
				return;
			}

			pop.querySelector(".selector-line")?.insertAdjacentHTML(
				"beforeend",
				componentChipHtml(component.framework, component.components),
			);
		});
```

(The `save` handler still awaits the same `componentPromise` from Task 4 — one detection per composer, shared by chip and payload.)

- [ ] **Step 3: Show the chip on existing pins**

In `openPinPopover` (~line 574), the popover already renders comment metadata; where it shows the tag chip, append for saved comments:

```ts
		componentChipHtml(comment.framework ?? "", comment.componentPath ?? [])
```

(Nullish fallbacks cover comments stored before this feature.) Match however that popover builds its HTML — inline template string or `insertAdjacentHTML`.

- [ ] **Step 4: Style the chip**

In the overlay stylesheet inside `content.ts`, next to the `.tagchip` rule, add (mirror the tagchip's colors/padding — copy its declarations and adjust):

```css
	.componentchip {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		/* same font-size / padding / border-radius / colors as .tagchip */
	}
	.componentchip svg { flex: none; }
```

- [ ] **Step 5: Build and typecheck**

Run: `npm run typecheck && npm run build --workspace=@claudback/extension`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/extension/src/content.ts
git commit -m "feat(extension): show component chip with framework icon in composer and pins"
```

---

### Task 6: Server — sanitize, envelope, tool description + manual verification

**Files:**
- Modify: `packages/mcp-server/src/collector.ts` (`sanitizeCommentFields`, ~line 78)
- Modify: `packages/mcp-server/src/envelope.ts` (payload mapping, ~line 22)
- Modify: `packages/mcp-server/src/tools.ts` (`get_comments` description, ~line 102)
- Test: `packages/mcp-server/src/envelope.test.ts`, `packages/mcp-server/src/collector.test.ts`

**Interfaces:**
- Consumes: `Comment.framework`/`Comment.componentPath` from Task 1.
- Produces: `get_comments` JSON payload entries gain `framework` and `component` fields; `component` is the human-readable line `"SubmitButton (in CheckoutForm < CheckoutPage < App)"` or absent when there's no chain.

- [ ] **Step 1: Write the failing tests**

In `packages/mcp-server/src/envelope.test.ts`, following the file's existing fixtures:

```ts
	it("includes a component line when componentPath is present", () => {
		const rendered = renderCommentsEnvelope(
			[comment({ framework: "react", componentPath: ["SubmitButton", "CheckoutForm", "App"] })],
			"clear",
		);
		expect(rendered).toContain('"component": "SubmitButton (in CheckoutForm < App)"');
		expect(rendered).toContain('"framework": "react"');
	});

	it("omits component fields when componentPath is empty", () => {
		const rendered = renderCommentsEnvelope([comment({})], "clear");
		expect(rendered).not.toContain('"component"');
		expect(rendered).not.toContain('"framework"');
	});
```

(Adapt `comment({...})` to the test file's existing comment-fixture helper; add the override support if its helper doesn't have it.)

In `packages/mcp-server/src/collector.test.ts`, find the existing POST-comment test and add a case posting a comment with `framework: "react"` and `componentPath: ["Submit​Button"]`, asserting the stored comment's `componentPath[0]` equals `"SubmitButton"` (invisible characters stripped by sanitize).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace=claudback-mcp`
Expected: FAIL — component fields missing from envelope; sanitize not applied to array.

- [ ] **Step 3: Implement**

`collector.ts` — extend `sanitizeCommentFields` to also clean the array field:

```ts
	if (Array.isArray(cleaned.componentPath)) {
		cleaned.componentPath = cleaned.componentPath.map((entry) =>
			typeof entry === "string" ? sanitizeText(entry) : entry,
		);
	}
```

(Leave non-string entries for zod to reject.) Add `"framework"` to the existing string-fields loop array.

`envelope.ts` — in the `payload` mapping, after `tag`:

```ts
		...(comment.componentPath.length > 0
			? {
					framework: comment.framework,
					component:
						comment.componentPath.length === 1
							? comment.componentPath[0]
							: `${comment.componentPath[0]} (in ${comment.componentPath.slice(1).join(" < ")})`,
				}
			: {}),
```

`tools.ts` — extend the `get_comments` description array with one line:

```ts
					"When the page runs React or Vue, comments may include the owning component chain",
					"(component + framework fields) — grep for the component name to find the source file.",
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS across all workspaces.

- [ ] **Step 5: Commit**

```bash
git add packages/mcp-server/src/collector.ts packages/mcp-server/src/envelope.ts packages/mcp-server/src/tools.ts packages/mcp-server/src/envelope.test.ts packages/mcp-server/src/collector.test.ts
git commit -m "feat(mcp-server): surface component chain in get_comments"
```

- [ ] **Step 6: Manual verification matrix (from the spec)**

Build (`npm run build --workspace=@claudback/extension`, `npm run build --workspace=claudback-mcp`), load the unpacked extension, run the server from source, then verify:

1. **Vite React dev app** (`npm create vite@latest -- --template react-ts` in the scratchpad, add a named `SubmitButton` inside a `CheckoutForm`): pin a comment on the button → chip shows `⚛ <SubmitButton>`, tooltip shows the chain; `get_comments` shows `component`/`framework`.
2. **Vue 3 dev app** (`--template vue-ts`): same expectations with the Vue mark.
3. **Production React site** (e.g. react.dev): comment saves; chip may be absent or show partial names; no console errors.
4. **Plain static page** (e.g. example.com): no chip, comment saves, `componentPath: []` not rendered in `get_comments`.

Record results in the PR description. Any failure: stop and fix before Task 7.

---

### Task 7: Docs — PLAN.md security note + README mention

**Files:**
- Modify: `PLAN.md` (security model section — add component-name note)
- Modify: `README.md` (feature mention in the intro/tools paragraph)

**Interfaces:** none.

- [ ] **Step 1: PLAN.md**

In the security-model section, add a short paragraph:

> **Component detection.** When the page runs React or Vue, comments also carry the owning component names (e.g. `SubmitButton < CheckoutForm`), read from the framework's runtime by a main-world detector script. The detector only answers detect events with names — it never reads comment data or touches the network — and replies are nonce-matched and schema-validated in the content script as untrusted page input. Component names are source-code identifiers; like all comment data they travel only to the loopback collector and `~/.claudback/`.

- [ ] **Step 2: README.md**

In the intro paragraph (after "click the thing, say what you want"), extend the pitch, e.g.: "On React and Vue apps, comments also name the component that rendered the element, so Claude can jump straight to the source."

- [ ] **Step 3: Final full check and commit**

Run: `npm run typecheck && npm test`
Expected: PASS.

```bash
git add PLAN.md README.md
git commit -m "docs: describe component mapping and its security posture"
```

---

## Post-plan checks (before PR)

- `npm run typecheck && npm test` green at HEAD.
- Manual matrix (Task 6 Step 6) recorded.
- Version bump / zip is **out of scope** — release happens via RELEASING.md separately.
