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

3. **Pair** — the server saves a pairing token to `~/.claudback/token` on first run (also printed to stderr). Paste it into the extension's setup page.
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

To generate the pairing token without waiting on an MCP client, run it directly once and stop it:

```sh
node packages/mcp-server/dist/bin.js
# ^C once you see "collector listening on http://127.0.0.1:4319"
cat ~/.claudback/token
```

<details>
<summary><strong>Advanced: run the collector without an active Claude session</strong></summary>

The stdio MCP transport needs an MCP client (Claude) to spawn it, but the collector the extension talks to is just a plain HTTP server in the same process — so you can keep it running independently of Claude, and annotate any time. Everything reads/writes the same files under `~/.claudback/` (token, store), so it's safe to also let Claude spawn its own instance later — token and comments stay in sync regardless of which process's collector actually handled a given request.

**Manual background** — run it yourself when you want it up; stops on logout/reboot:

```sh
node ~/Documents/GitHub/Claudback/packages/mcp-server/dist/bin.js &
disown
```

**Persistent (survives reboot/logout)** — a macOS LaunchAgent that starts the server at login and restarts it if it dies. Save this as `~/Library/LaunchAgents/dev.claudback.mcp-server.plist` (adjust the path to your clone):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>dev.claudback.mcp-server</string>
	<key>ProgramArguments</key>
	<array>
		<string>/usr/bin/env</string>
		<string>node</string>
		<string>/Users/you/Documents/GitHub/Claudback/packages/mcp-server/dist/bin.js</string>
	</array>
	<key>RunAtLoad</key>
	<true/>
	<key>KeepAlive</key>
	<true/>
	<key>StandardOutPath</key>
	<string>/Users/you/.claudback/server.log</string>
	<key>StandardErrorPath</key>
	<string>/Users/you/.claudback/server.log</string>
</dict>
</plist>
```

Then load it (starts immediately, and on every future login):

```sh
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/dev.claudback.mcp-server.plist
```

To stop it and remove the auto-start:

```sh
launchctl bootout gui/$(id -u)/dev.claudback.mcp-server
```

</details>
