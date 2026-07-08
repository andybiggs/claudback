# Claudback

**Comment on your page. Claude reads it.**

Claudback is a Chrome extension for pinning visual-feedback comments to elements on any web page, plus a local MCP server (`claudback-mcp`) that lets Claude read them and make the changes. The main use case: iterate on a local build or prototype with Claude Code without screenshots or "the third button in the sidebar" descriptions — click the thing, say what you want, ask Claude to check your comments.

Everything stays on your machine: comments sync to a loopback-only collector and live in `~/.claudback/`.

**Docs & 101:** https://andybiggs.github.io/Claudback/ · **Status:** pre-v1. See [PLAN.md](./PLAN.md) for architecture and the security model, [RELEASING.md](./RELEASING.md) for the release process.

## Quick start

1. **Install the extension** — from the Chrome Web Store (link coming soon — until then, see [Load the extension from source](#load-the-extension-from-source) below). A setup guide opens on install.
2. **Register the MCP server** — for Claude Code:

   ```sh
   claude mcp add claudback -- npx -y claudback-mcp
   ```

   Or for Claude Desktop, add to `claude_desktop_config.json`:

   ```json
   {
   	"mcpServers": {
   		"claudback": {
   			"command": "npx",
   			"args": ["-y", "claudback-mcp"]
   		}
   	}
   }
   ```

3. **Pair** — ask Claude for a pairing code ("Give me a Claudback pairing code") and type it into the extension's setup page. Codes expire in 10 minutes and work once. Fallback: paste the long-lived token from `~/.claudback/token` (saved on the server's first run, also printed to stderr) instead.
4. **Annotate** — click the Claudback icon on any tab → **Enable**, grant the per-site permission, and pin comments with the floating button.
5. **Ask Claude** — "check my claudback comments and make the changes." Claude reads them via the `get_comments` tool; `list_origins`, `resolve_comment`, and `clear_comments` are also available.

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

### Run the server from source

```sh
npm run build --workspace=claudback-mcp
claude mcp add claudback -- node /absolute/path/to/Claudback/packages/mcp-server/dist/bin.js
```

Pairing normally happens by asking Claude for a code, but to grab the long-lived token manually without an MCP client, run the server directly once and stop it:

```sh
node packages/mcp-server/dist/bin.js
# ^C once you see "collector listening on http://127.0.0.1:4319"
cat ~/.claudback/token
```

<details>
<summary><strong>Advanced: annotating while Claude isn't running</strong></summary>

You don't need the server running to annotate: the extension buffers comments in `chrome.storage.local` and flushes them automatically once a collector is reachable, so nothing is lost between Claude sessions.

If you want *live* sync to `~/.claudback/` while Claude is closed, you can run the server standalone — the collector is a plain HTTP server in the same process:

```sh
node packages/mcp-server/dist/bin.js
```

One caveat: the collector binds port 4319 exclusively, so while a standalone instance is running, a Claude session **cannot spawn its own** — the Claudback MCP tools (including `get_pairing_code`) will be unavailable in that session. Stop the standalone instance before working with Claude. For this reason, don't run it under a keep-alive supervisor (LaunchAgent/systemd): it will permanently starve Claude's own instance of the port.

</details>
