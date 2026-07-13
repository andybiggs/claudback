# Claudback

**Comment on your page. Claude reads it.**

Claudback is a Chrome extension for pinning visual-feedback comments to elements on any web page, plus a local MCP server (`claudback-mcp`) that lets Claude read them and make the changes. The main use case: iterate on a local build or prototype with Claude Code without screenshots or "the third button in the sidebar" descriptions — click the thing, say what you want, ask Claude to check your comments. On React and Vue apps, comments also name the component that rendered the element, so Claude can jump straight to the source.

Everything stays on your machine: comments sync to a loopback-only collector and live in `~/.claudback/`.

**Docs & 101:** https://andybiggs.github.io/claudback/ · **Status:** pre-v1. See [PLAN.md](./PLAN.md) for architecture and the security model, [RELEASING.md](./RELEASING.md) for the release process.

Made by [Andy Biggs](https://www.andybiggs.net) (NZ).

## Quick start

1. **Install the extension** — from the Chrome Web Store (link coming soon — until then, see [Load the extension from source](#load-the-extension-from-source) below). A setup guide opens on install.
2. **Register the MCP server** — run this once for Claude Code (CLI):

   ```sh
   claude mcp add --scope user claudback -- npx -y claudback-mcp
   ```

   `--scope user` registers Claudback for every project on your machine, so you only do it once. Using the **Claude Code desktop app**? Paste the same command straight into a Claude Code chat as a prompt instead of running it in a terminal — Claude Code runs the install for you.

3. **Pair** — ask Claude for a pairing code ("Give me a Claudback pairing code") and type it into the extension's setup page. Codes expire in 10 minutes and work once. Fallback: paste the long-lived token from `~/.claudback/token` (saved on the server's first run, also printed to stderr) instead.
4. **Annotate** — click the Claudback icon on any tab → **Enable**, grant the per-site permission, and pin comments with the floating button.
5. **Ask Claude** — "Grab my Claudback comments." Claude reads them via the `get_comments` tool; `list_origins`, `resolve_comment`, and `clear_comments` are also available.

## Development

```sh
npm install
npm run typecheck   # tsc -b across all packages
npm test            # vitest across all packages
```

Repo layout (npm workspaces):

```
packages/
  shared/       zod comment schema, constants, selector capture
  extension/    MV3 extension
  mcp-server/   stdio MCP server + embedded collector
```

Each package builds via `npm run build --workspace=<name>`. `npm run zip --workspace=@claudback/extension` produces the Web Store zip.

### Load the extension from source

```sh
npm run build --workspace=@claudback/extension
```

Open `chrome://extensions`, enable Developer mode, click **Load unpacked**, select `packages/extension/dist/`. The setup guide opens automatically on first install (or via **Pairing & options → Open setup guide**).

Disable the Web Store copy of Claudback while testing an unpacked build — they're separate extensions and would both inject overlays. Note the unpacked copy's ID from `chrome://extensions` (it stays stable as long as you load it from the same directory); you'll need it to allowlist the extension with the server below.

### Allowlist an unpacked extension (`CLAUDBACK_DEV_EXTENSION_ID`)

The collector's CORS allowlist is pinned to the published extension ID, so an unpacked build's requests are rejected with a 403/CORS preflight error (`No 'Access-Control-Allow-Origin' header`) — including pairing. Opt your dev extension in by registering the server with the `CLAUDBACK_DEV_EXTENSION_ID` environment variable set to the unpacked copy's ID:

```sh
claude mcp remove --scope user claudback
claude mcp add --scope user claudback \
  --env CLAUDBACK_DEV_EXTENSION_ID=<your-unpacked-extension-id> \
  -- node /absolute/path/to/Claudback/packages/mcp-server/dist/bin.js
```

Restart your Claude Code session afterwards so it launches the re-registered server, then pair the unpacked extension as normal. To go back to production, re-register without the variable: `claude mcp add --scope user claudback -- npx -y claudback-mcp`.

### Run the server from source

```sh
npm run build --workspace=claudback-mcp
claude mcp add --scope user claudback -- node /absolute/path/to/Claudback/packages/mcp-server/dist/bin.js
```

Pairing normally happens by asking Claude for a code, but to grab the long-lived token manually without an MCP client, run the server directly once and stop it:

```sh
node packages/mcp-server/dist/bin.js
# ^C once you see "collector listening on http://127.0.0.1:57463"
cat ~/.claudback/token
```

<details>
<summary><strong>Advanced: annotating while Claude isn't running</strong></summary>

You don't need the server running to annotate: the extension buffers comments in `chrome.storage.local` and flushes them automatically once a collector is reachable, so nothing is lost between Claude sessions.

If you want *live* sync to `~/.claudback/` while Claude is closed, you can run the server standalone — the collector is a plain HTTP server in the same process:

```sh
node packages/mcp-server/dist/bin.js
```

The collector binds port 57463 exclusively, so while a standalone instance is running, a Claude session's own process runs in shared-store mode instead — its MCP tools (including `get_pairing_code`) keep working against `~/.claudback/`, it just doesn't serve the extension itself. When the standalone instance stops, a running session takes over the port automatically within a couple of seconds.

</details>

## License

[PolyForm Noncommercial 1.0.0](./LICENSE) — free for personal, internal, and noncommercial use. Not licensed for resale or as a paid product/service.
