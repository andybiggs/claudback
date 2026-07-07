# Chrome Web Store listing — Claudback

Draft copy for the Web Store submission form. Not shipped in the extension zip.

## Basics

- **Name**: Claudback
- **Category**: Developer Tools
- **Language**: English
- **Homepage URL**: https://andybiggs.github.io/Claudback/
- **Privacy policy URL**: https://andybiggs.github.io/Claudback/privacy.html

## Short description (max 132 chars)

> Pin comments to elements on any page. Claude reads them via a local MCP server and makes the changes. Nothing leaves your machine.

(130 characters)

## Full description

> **Point at your page. Claude reads it.**
>
> Claudback lets you pin visual-feedback comments to elements on any web page — a button that's the wrong colour, a layout that breaks on mobile, copy that needs a rewrite. Claude reads your comments through a local MCP server and makes the changes.
>
> **The main use case:** you're iterating on a local build or prototype with Claude Code. Instead of screenshotting and describing where things are, enable Claudback on the tab, click the elements you want changed, and say why. Each comment carries the exact element selector. Then ask Claude: "check my claudback comments and make the changes."
>
> You can also use it to annotate any site — collecting structured, element-anchored notes for Claude to work from.
>
> **How it works**
> - The extension is off by default; you enable it per tab.
> - Comments sync to a local collector on 127.0.0.1 run by the `claudback-mcp` server (installed via `npx` — the first-run guide walks you through it).
> - Claude reads comments via MCP tools (`get_comments`, `list_origins`, `resolve_comment`, `clear_comments`).
>
> **Private by design**
> - No remote servers, no accounts, no analytics.
> - The collector binds to localhost only and requires a pairing token.
> - Your comments live in `~/.claudback/` on your own machine.
>
> Requires the free `claudback-mcp` npm package (Node 20+) and Claude Code or Claude Desktop. Setup guide opens on install.

## Single-purpose statement

> Claudback's single purpose is to let users pin feedback comments to elements on web pages and sync them to a local server on the user's own machine, where Claude (via MCP) can read them.

## Permission justifications

- **storage** — Stores the pairing token for the local collector and buffers unsent comments locally so annotating works offline.
- **activeTab** — Reads the current tab's URL/origin when the user clicks the extension, so commenting can be enabled for that specific site only.
- **scripting** — Injects the comment overlay content script into a tab, only after the user explicitly enables Claudback for that tab.
- **alarms** — Runs a periodic retry that flushes locally buffered comments to the local collector once it's reachable.
- **Optional host permissions (`*://*/*`)** — Requested per-site at the moment the user enables Claudback on a tab; never granted broadly up front. Needed so the overlay and comment sync work on the sites the user chooses.

## Remote code / data use disclosures

- Remote code: none (all code packaged in the extension).
- Data collected: none transmitted to the developer or third parties. User-created comments and minimal page excerpts (tag/attribute names only) are sent exclusively to a localhost collector on the user's own machine.

## Assets (manual task)

- **Screenshots (1280×800, at least 1, up to 5)** — suggested shots:
  1. Overlay + composer pinned to an element on a localhost app.
  2. The comment list panel with a few comments.
  3. Popup with the enable toggle and sync status.
  4. Onboarding step 2 (the npx install tabs).
  5. A Claude Code session reading the comments via `get_comments`.
- **Small promo tile (440×280)** — optional; Waypoint mark + wordmark on green.
- **Marquee promo (1400×560)** — optional.
