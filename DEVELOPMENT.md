# Developing Claudback

Working on Claudback itself, or running it from source. For installing the released
version, see the [README quick start](./README.md#quick-start).

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

## Load the extension from source

```sh
npm run build --workspace=@claudback/extension
```

Open `chrome://extensions`, enable Developer mode, click **Load unpacked**, select `packages/extension/dist/`. The setup guide opens automatically on first install (or via **Pairing & options → Open setup guide**).

Disable the Web Store copy of Claudback while testing an unpacked build — they're separate extensions and would both inject overlays. Note the unpacked copy's ID from `chrome://extensions` (it stays stable as long as you load it from the same directory); you'll need it to allowlist the extension with the server below.

## Allowlist an unpacked extension (`CLAUDBACK_DEV_EXTENSION_ID`)

The collector's CORS allowlist is pinned to the published extension ID, so an unpacked build's requests are rejected with a 403/CORS preflight error (`No 'Access-Control-Allow-Origin' header`) — including pairing. Opt your dev extension in by registering the server with the `CLAUDBACK_DEV_EXTENSION_ID` environment variable set to the unpacked copy's ID:

```sh
claude mcp remove --scope user claudback
claude mcp add --scope user claudback \
  --env CLAUDBACK_DEV_EXTENSION_ID=<your-unpacked-extension-id> \
  -- node /absolute/path/to/Claudback/packages/mcp-server/dist/bin.js
```

Restart your Claude Code session afterwards so it launches the re-registered server, then pair the unpacked extension as normal. To go back to production, re-register without the variable: `claude mcp add --scope user claudback -- npx -y claudback-mcp`.

Still blocked? Another Claude session's server may be holding the collector port — only one server can bind 57463, and the extension talks to whichever got there first, regardless of what you just registered. Find it with `lsof -nP -i :57463`, kill the stale process, and the right server takes the port over within a couple of seconds.

## Run the server from source

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

## Annotating while Claude isn't running

You don't need the server running to annotate: the extension buffers comments in `chrome.storage.local` and flushes them automatically once a collector is reachable, so nothing is lost between Claude sessions.

If you want *live* sync to `~/.claudback/` while Claude is closed, you can run the server standalone — the collector is a plain HTTP server in the same process:

```sh
node packages/mcp-server/dist/bin.js
```

The collector binds port 57463 exclusively, so while a standalone instance is running, a Claude session's own process runs in shared-store mode instead — its MCP tools (including `get_pairing_code`) keep working against `~/.claudback/`, it just doesn't serve the extension itself. When the standalone instance stops, a running session takes over the port automatically within a couple of seconds.
