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
