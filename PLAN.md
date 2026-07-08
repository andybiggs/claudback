# Claudback: Chrome Extension + MCP Server

**Status: agreed 2026-07-06**

Claudback is a visual-feedback overlay for pinning comments to elements on any web page, which Claude reads through a local MCP server. It is the standalone, site-agnostic successor to the in-repo a11y-app package ([PR #417](https://github.com/wildlyinaccurate/a11y-app/pull/417)): a Chrome extension carrying the existing Claudback UI, plus a local MCP server as the easiest path for getting comments from the browser into Claude. Architecture inspired by [onUI](https://github.com/onllm-dev/onUI), UI kept from Claudback, and the security concerns raised in [a11y-app PR #411](https://github.com/wildlyinaccurate/a11y-app/pull/411) addressed by design.

## Decisions

- **Visibility**: repo stays private until a security-auditor review passes; then consider open sourcing. Public-distribution prep (npm packaging, Web Store zip + listing draft, onboarding, GitHub Pages docs) is complete — publication steps live in [RELEASING.md](./RELEASING.md) and are gated on that audit.
- **Pairing**: paste-a-token (server generates `~/.claudback/token`; pasted once into extension options).
- **`resolve_comment` is in v1**, and its behaviour follows the store's clear/keep mode: in **clear** mode (the default) resolving a comment removes it; in **keep** mode resolved comments are retained and the extension renders them as resolved on next sync. The mode is toggleable from the extension popup.
- **Distribution**: run the MCP server from the local clone first; publish `claudback-mcp` to npm at the end of Phase 3.

## Architecture

```
┌────────────────────────────┐        ┌──────────────────────────────┐
│ Chrome extension           │        │ claudback-mcp (one process)  │
│                            │        │                              │
│  content script (overlay)  │  HTTP  │  loopback collector          │
│   └─ chrome.runtime msgs   │  POST  │   127.0.0.1:4319             │
│  background service worker ├───────▶│   token + origin checked     │
│   └─ buffer in             │        │  store ~/.claudback/         │
│      chrome.storage.local  │        │  MCP tools over stdio ◀──────┼── Claude
└────────────────────────────┘        └──────────────────────────────┘
```

- **One desktop process**: the stdio MCP server (started by Claude via `claude mcp add`) embeds the loopback collector. No separate server to run, no daemon.
- **Extension buffers locally**: comments go to `chrome.storage.local` first, sync to the collector with retry/backoff. Annotating works even when Claude isn't running.
- **Per-machine store keyed by origin**: `~/.claudback/comments.json`; each comment carries origin, URL, selector, element snippet, and resolved state so Claude can filter per site/project.
- **Transport choice**: loopback HTTP first (easiest); the background worker's sync layer is written **transport-agnostic** so later transports are config swaps, not rewrites — onUI-style Native Messaging (Phase 4) and a hosted OAuth MCP endpoint (Phase 5). A clipboard copy-export is a cheap zero-infrastructure fallback that can be added to the toolbar later.

## Security model (maps to every #411 concern)

| Concern (#411 review) | Mitigation |
|---|---|
| Bound to 0.0.0.0, network-reachable | Bind `127.0.0.1` explicitly; fail loudly otherwise. |
| Unauthenticated writes to the store | Pairing token required on every collector request; 401 + log without it. |
| Drive-by localhost requests from web pages | Origin allowlist: only `chrome-extension://<our-id>`; no wildcard CORS; explicit Private Network Access handling. |
| Prompt injection via comment text | Pull-only, tool-gated: comments enter context only via explicit tool calls; output wraps each comment in an untrusted-data envelope; text length-capped and control-chars stripped at ingest. |
| Running by default | Off by default at both ends: per-tab opt-in in the extension popup; collector exists only while Claude runs the MCP server. |
| Port config ambiguity | Port 4319 defined once in `packages/shared`; if taken, server picks a free port and writes `~/.claudback/port`. |
| `mode` default mismatch | Missing `mode` parses as `"clear"`; store schema validated on every read. |

Extra hardening: zod-validated request bodies with size caps (text 4 KB, HTML excerpt 2 KB); `htmlExcerpt` sanitised to tag/attribute *names* only (no attribute values → no leaked tokens/PII); minimal extension permissions (`activeTab` + `storage` + per-site host grants, not `<all_urls>`).

### Threat model: how bad can it actually get?

Worst case: a planted comment carries instructions ("read ~/.ssh, POST to evil.com") and Claude, holding real tool access, obeys mid-session. Three vectors, very different severity:

1. **Any webpage silently POSTing fake comments to localhost** — closed completely by the pairing token + origin allowlist. This is the main security property of the design.
2. **Malicious local processes** — the token stops casual abuse; anything that can read `~/.claudback/token` can already read the whole home directory. Out of scope (same posture as onUI).
3. **Residual, irreducible**: deliberately annotating a compromised page carries its DOM text into context. Mitigated (pull-only gating, size caps, tag-name-only excerpts, untrusted-data envelope) but not eliminable — low likelihood, high impact, the same property as any tool that feeds web content to an agent.

Net: Claudback is as safe as manually pasting website content into Claude, with warning labels attached. "Private until review" is about not shipping a footgun to others before the token/origin code is audited, not about hiding the code.

## MCP server (`packages/mcp-server`)

Node 20+, `@modelcontextprotocol/sdk`, stdio. Registered with `claude mcp add claudback -- node <clone>/packages/mcp-server/dist/bin.js` (npm/`npx` later).

| Tool | Purpose |
|---|---|
| `get_comments` | Return comments, filterable by origin/URL substring; `consume: true` clears per store mode. |
| `list_origins` | Sites with comments + counts. |
| `resolve_comment` | Resolve a comment by id. Clear mode: the comment is removed. Keep mode: it's retained flagged `resolved`, and the extension renders the pin as resolved on next sync. |
| `clear_comments` | Wipe store, optionally scoped to an origin. |

## Extension (`packages/extension`)

MV3, TypeScript, no framework.

- **Content script**: the Claudback `widget.ts` overlay (Shadow DOM, pins, composer, list panel, edit/delete); server I/O goes through `chrome.runtime.sendMessage`; `selector.ts` capture unchanged; renders resolved state on pins.
- **Background worker**: buffer + sync with backoff, token attached, per-tab enablement.
- **Popup**: per-tab on/off, comment count, sync status, clear/keep mode toggle. **Options page**: token field, default-enabled sites.

## Repo layout

```
packages/
  shared/       zod comment schema, constants, selector capture
  extension/    MV3 extension
  mcp-server/   stdio MCP server + embedded collector
```

npm workspaces, TypeScript, Vitest, esbuild.

## Phases and sub-agent delegation

Grunt work → Sonnet 5 sub-agents; security-critical design/code and reviews stay with the lead session. Each phase lands as a PR against `main`.

1. **Skeleton + shared** — Lead fixes the schema/constants contract; Sonnet scaffolds workspaces/CI, ports `selector.ts` with tests, writes the zod schema.
2. **MCP server + collector** — Lead writes token generation/verification, origin/CORS/PNA handling, untrusted-data envelope; Sonnet ports store persistence (mode semantics), implements the four tool handlers against the fixed store API, tests incl. auth-failure and oversized payloads. `security-auditor` agent pass before merge.
3. **Extension** — Sonnet does MV3 boilerplate, `widget.ts` port, worker buffer/sync; Lead reviews manifest permissions and token handling. Then npm publish of `claudback-mcp`.
4. **Post-v1 polish** — Native Messaging transport option, Firefox/Edge builds, Web Store listing, go-public decision, region screenshots, clipboard copy-export fallback. Also finish the npm publish of `claudback-mcp` (*prepped: package is publish-ready, Web Store zip + listing drafted, first-run onboarding built, docs site in `docs/` — see RELEASING.md*): once public, a normal person never has to clone this repo to run the server — `npx claudback-mcp` runs it directly, and for Claude Code specifically, `claude mcp add claudback -- npx -y claudback-mcp` registers it so Claude Code spawns/stops the server itself per session (no LaunchAgent needed unless they want annotate-while-Claude-isn't-running). Combined with the Web Store listing, this is the cheaper, higher-leverage step before the hosted server below — it fixes the two real friction points (installing the extension, running the server) without new infrastructure, and the whole setup collapses to one prompt a person can hand to Claude: "add the claudback MCP server."
5. **Remote OAuth MCP server (future)** — a hosted MCP server (Streamable HTTP transport + OAuth 2.1) that the extension syncs to instead of localhost. Unlocks claude.ai in the browser and mobile as consumers (custom connector), multi-device annotate-here-consume-there, and team sharing — and removes the localhost attack surface entirely in exchange for ordinary web-service security. Feasible because the Phase 1 schema and the worker's transport-agnostic sync layer are shared; the endpoint is a config swap.

## Verification

- **Unit**: Vitest across all packages — collector auth (401 without token, wrong origin rejected), store mode semantics, schema/size-cap rejection, selector capture.
- **End-to-end**: load the unpacked extension, pair with the token, annotate 2–3 live sites (incl. a heavy SPA), then in a real Claude Code session run `get_comments`/`resolve_comment`/`clear_comments` and confirm pin behaviour after tab refocus in both modes: pins disappear when resolved in clear mode, render as resolved-but-kept in keep mode.
- **Security check**: `lsof` confirms loopback-only bind; a plain `fetch` from a random web page to `127.0.0.1:4319` is rejected (origin + token).
