# Claudback

**Comment on your page. Claude reads it.**

![Claudback demo: pinning comments to page elements and Claude Code reading them](docs/demo.gif)

Claudback is a Chrome extension for pinning visual-feedback comments to elements on any web page, plus a local MCP server (`claudback-mcp`) that lets Claude read them and make the changes. The main use case: iterate on a local build or prototype with Claude Code without screenshots or "the third button in the sidebar" descriptions — click the thing, say what you want, ask Claude to check your comments. On React and Vue apps, comments also name the component that rendered the element, so Claude can jump straight to the source.

Everything stays on your machine: comments sync to a loopback-only collector and live in `~/.claudback/`.

**Docs & 101:** https://andybiggs.github.io/claudback/ · **Changelog:** https://andybiggs.github.io/claudback/changelog.html · **Status:** pre-v1.

Made by [Andy Biggs](https://www.andybiggs.net) (NZ).

## Quick start

1. **Install the extension** — [get Claudback on the Chrome Web Store](https://chromewebstore.google.com/detail/claudback/dbnmlcmmgnchigedlglfmchkendlcfgc). A setup guide opens on install.
2. **Register the MCP server** — run this once for Claude Code (CLI):

   ```sh
   claude mcp add --scope user claudback -- npx -y claudback-mcp
   ```

   `--scope user` registers Claudback for every project on your machine, so you only do it once. Using the **Claude Code desktop app**? Paste the same command straight into a Claude Code chat as a prompt instead of running it in a terminal — Claude Code runs the install for you.

3. **Pair** — ask Claude for a pairing code ("Give me a Claudback pairing code") and type it into the extension's setup page. Codes expire in 10 minutes and work once. Fallback: paste the long-lived token from `~/.claudback/token` (saved on the server's first run, also printed to stderr) instead.
4. **Annotate** — click the Claudback icon on any tab → **Enable**, grant the per-site permission, and pin comments with the floating button.
5. **Ask Claude** — "Grab my Claudback comments." Claude reads them via the `get_comments` tool; `list_origins`, `resolve_comment`, and `clear_comments` are also available.

## Why Claudback

- **No more screenshot-and-describe.** Each comment carries the exact element selector, tag, and a page excerpt — Claude knows precisely what you clicked.
- **Component mapping on React and Vue apps.** Comments name the component that rendered the element (unwrapping UI-library wrappers to surface *your* component), so Claude can jump straight to the source file.
- **Local-only by design.** No remote servers, no accounts, no analytics. The collector binds to 127.0.0.1, requires a pairing token, and comments never auto-enter Claude's context — Claude pulls them when you ask, each wrapped in an untrusted-data envelope.
- **Works offline.** Annotate with Claude closed; comments buffer in the extension and sync when a collector appears.

Not just for code changes: pin comments on any live site — a competitor's product, a reference design, a client's current site — and ask Claude to turn them into a teardown, a PRD, or a design review.

Enjoying Claudback? [A short review on the Chrome Web Store](https://chromewebstore.google.com/detail/claudback/dbnmlcmmgnchigedlglfmchkendlcfgc/reviews) helps other Claude Code users find it. Feedback and bug reports are welcome via [GitHub issues](https://github.com/andybiggs/claudback/issues/new/choose).

## Development

See [DEVELOPMENT.md](./DEVELOPMENT.md) for building from source, loading an unpacked extension, dev-extension allowlisting, and running the server standalone. Architecture and the security model live in [PLAN.md](./PLAN.md); the release process in [RELEASING.md](./RELEASING.md).

## License

[PolyForm Noncommercial 1.0.0](./LICENSE) — free for personal, internal, and noncommercial use. Not licensed for resale or as a paid product/service.
