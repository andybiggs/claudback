# Claudback

Claudback is a visual-feedback overlay for pinning comments to elements on any web page. It ships as a Chrome extension, and the comments are read by Claude through a local MCP server.

Status: pre-v1, under active development.

See [PLAN.md](./PLAN.md) for the full architecture and phase plan.

## Setup

### 1. Install and build

```sh
npm install
npm run build --workspace=claudback-mcp
npm run build --workspace=@claudback/extension
```

### 2. Start the MCP server

The server is a stdio process — Claude starts and stops it, you don't run it standalone in normal use. Register it once:

```sh
claude mcp add claudback -- node /absolute/path/to/Claudback/packages/mcp-server/dist/bin.js
```

The next time Claude Code (or Claude Desktop) connects to the `claudback` MCP server, it launches `dist/bin.js`, which:

- generates a pairing token on first run at `~/.claudback/token` (mode `0600`) — also printed to stderr, e.g. `[claudback] pairing token generated at /Users/you/.claudback/token`
- starts the loopback collector at `http://127.0.0.1:4319`

To generate the token without waiting on an MCP client (e.g. to pair the extension before your first Claude session), run it directly once and stop it:

```sh
node packages/mcp-server/dist/bin.js
# ^C once you see "collector listening on http://127.0.0.1:4319"
cat ~/.claudback/token
```

#### Running the collector without an active Claude session

The stdio MCP transport needs an MCP client (Claude) to spawn it, but the collector the extension talks to is just a plain HTTP server in the same process — so you can keep it running independently of Claude, and annotate any time. Everything reads/writes the same files under `~/.claudback/` (token, store), so it's safe to also let Claude spawn its own instance later via `claude mcp add` — token and comments stay in sync regardless of which process's collector actually handled a given request.

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

### 3. Load the extension

1. Open `chrome://extensions`, enable Developer mode, click **Load unpacked**, select `packages/extension/dist/`.
2. Click the Claudback icon → **Pairing & options** → paste the token from `~/.claudback/token` → **Save token** → **Test connection** (expect "Connected to the local collector").
3. On any page, click the Claudback icon → **Enable** for this tab, grant the per-site permission when prompted.
4. Use the floating buttons to pin a comment to an element.

### 4. Read comments from Claude

With the MCP server registered and running, ask Claude to use the `get_comments` tool (optionally `origin`/`urlContains` filters, `consume: true` to apply clear/keep mode). `list_origins`, `resolve_comment`, and `clear_comments` are also available — see [PLAN.md](./PLAN.md) for the full tool surface and security model.

## Development

```sh
npm run typecheck   # tsc -b across all packages
npm test            # vitest across all packages
```

Each package also builds independently via `npm run build --workspace=<name>`.
