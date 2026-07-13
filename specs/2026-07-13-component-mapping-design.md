# Component Mapping — Design

**Date:** 2026-07-13
**Branch:** `feature/react-component-mapping`
**Origin:** Chrome Web Store feature request (Anthony Suarez-McGrath, Jul 13 2026): map selected elements to their owning React components instead of only the DOM hierarchy (`div>div>div>button`), so Claude can find the right component without manual codebase searches.

## Goal

When a user pins a comment, Claudback detects the framework component that rendered the element (React or Vue in v1; architecture is framework-agnostic) and attaches a capped component-ancestry chain to the comment. Claude reads it via `get_comments` and can grep straight to the component source.

Detection is **best-effort and silent**: on any failure (no framework, minified prod build, injection failure, timeout), the comment saves exactly as today.

## Architecture

### Detector bundle (main world)

New `packages/extension/src/detector.ts`, built by esbuild as a separate `detector.js` bundle. The background service worker injects it with `chrome.scripting.executeScript({ world: "MAIN" })` at the same points it injects `content.js` (enable flow and the v0.1.4 re-injection retry). No manifest permission changes — existing `scripting` + activeTab cover it.

The bundle contains a framework-agnostic registry:

```ts
interface Detector {
	framework: string; // "react" | "vue" | future
	detect(el: Element): string[] | null; // nearest-first component names, or null if framework absent
}
```

Detectors run in order; first non-null result wins. Each `detect()` call is wrapped in try/catch so a hostile or unusual page cannot break commenting.

- **React detector:** locate the `__reactFiber$…` expando (legacy `__reactInternalInstance$…` for React 16/17), walk `fiber.return`, collect `type.displayName || type.name` for function/class components. Skip host elements, fragments, context providers, and unnamed or single-letter (minified) names. Note: `_debugSource` was removed in React 19, so component *names* are the reliable primitive; file paths are out of scope.
- **Vue detector:** read `el.__vueParentComponent` (Vue 3) or `el.__vue__` (Vue 2), walk `.parent`, collect component names.
- **Vue production fallback (amendment, 2026-07-13):** production Vue 3 builds attach no per-element instance refs — `__vueParentComponent` is dev/devtools-only — so the original detector found nothing on real Vue sites (discovered on behance.net). When the expando is absent, find the ancestor holding `__vue_app__`/`_vnode`, walk the vnode tree top-down descending into the child component whose rendered subtree contains the target, and collect names nearest-first. Vue built-in wrappers (RouterView, Transition, etc.) are skipped. The minified-name filter is ≥3 chars for both frameworks (production React chains showed 2-letter junk like `er`/`Tr`/`Ke`).

Chain is capped at **5** named components. The detector bundle never touches comments, storage, or the network; it only answers detect events.

### Bridge (isolated world ↔ main world)

1. On element pick, the content script sets a one-shot `data-claudback-probe="<nonce>"` attribute on the element and dispatches a `claudback:detect` CustomEvent on `document` carrying the nonce.
2. The detector finds the element by attribute (both worlds share the DOM), runs the registry, and dispatches `claudback:detect-result` with `{ nonce, framework, components }` serialized as a JSON string (avoids cross-world structured-clone quirks).
3. The content script matches the nonce, validates the reply, and resolves. Timeout ~100 ms; on timeout/absence the flow proceeds without component data. The probe attribute is removed in a `finally`.

**Trust boundary:** the reply is page-controlled input. Nonce mismatch, junk JSON, oversized names, or >5 entries → dropped before the payload is built.

## Schema

Two optional fields on the comment (`packages/shared/src/schema.ts`):

- `framework: z.string().nullable().default(null)` — e.g. `"react"`, `"vue"`.
- `componentPath: z.array(z.string().max(COMPONENT_NAME_MAX_LENGTH)).max(5).default([])` — nearest-first, e.g. `["SubmitButton", "CheckoutForm", "CheckoutPage", "App"]`.

New constant `COMPONENT_NAME_MAX_LENGTH = 128` in `constants.ts`. Names are sanitized like other string fields. Defaults keep old comments, old extension ↔ new server, and new extension ↔ old server all compatible — no migration.

## Composer UI

- The detect request fires when the composer opens.
- On result, a **component chip** renders next to the existing tag chip: a small inline-SVG framework icon (React atom / Vue "V" mark, keyed off `framework`) followed by the nearest component name, e.g. `⚛ <SubmitButton>`. The full ancestry chain is the chip's `title` tooltip. Unknown future frameworks fall back to a plain chip without an icon.
- No result → no chip; UI identical to today.
- The pin popover for existing comments shows the same chip when `componentPath` is non-empty.

## MCP surface

`get_comments` output (`packages/mcp-server/src/tools.ts`) includes a component line when present, alongside the selector:

```
component: SubmitButton (in CheckoutForm < CheckoutPage < App) [react]
```

Tool descriptions/prompts updated to mention comments may include the owning component.

## Privacy

Component names are source-code identifiers read from the page's own runtime. Like all comment data they travel only to the loopback collector and `~/.claudback/`. Consistent with the existing "names only, no attribute values" stance. PLAN.md security model gets a short note.

## Error handling summary

| Condition | Behaviour |
| --- | --- |
| No framework on page / static site | No chip; empty fields |
| Minified prod build, no usable names | No chip (or partial chain if some names survive) |
| detector.js injection failed | Timeout → no chip |
| Detect reply malformed/spoofed | Dropped by nonce + schema validation |
| Detector throws on weird page | Caught inside detector; no reply |

## Testing

- **Unit (vitest):** fiber-walk and Vue-walk against mock trees (named/unnamed/minified components, depth cap, provider skipping); schema round-trips incl. old payloads; reply validation (oversized names, bad nonce, junk JSON).
- **Server:** component-line formatting in `tools.ts`, presence and absence.
- **Manual matrix:** Vite React dev app; Vue 3 dev app; production React site (expect graceful no-chip/partial); plain static page (expect no chip). Verify chip render, stored payload, `get_comments` output.

## Out of scope (v1)

- Source file/line mapping (React 19 removed `_debugSource`).
- Svelte/Angular/other detectors (registry makes them additive later).
- User-facing component picker (choosing an ancestor to target).
- DOM-heuristic fallback (class-name/data-attribute inference).
