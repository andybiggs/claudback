# pinback-mcp

The local MCP server for [Pinback](https://andybiggs.github.io/pinback/) — pin visual-feedback comments to elements on any web page with the Pinback Chrome extension, and let your coding agent read them while you iterate.

It's a plain stdio MCP server, so it works with any MCP-capable agent — Claude Code, Codex, and others.

The main use case: run your site or prototype locally, drop comments on the bits you want changed ("make this button bigger", "this overlaps on mobile"), then ask your agent to check your Pinback comments and make the edits.

## Setup

Your agent starts and stops the server itself — there is nothing to run manually.

### Claude Code

```sh
claude mcp add --scope user pinback -- npx -y pinback-mcp
```

`--scope user` registers Pinback for every project on your machine, so you only do it once.

### Codex

```sh
codex mcp add pinback -- npx -y pinback-mcp
```

Or add it to `~/.codex/config.toml` by hand:

```toml
[mcp_servers.pinback]
command = "npx"
args = ["-y", "pinback-mcp"]
```

### Any other MCP client

Register `npx -y pinback-mcp` as a stdio server named `pinback`. Most clients take a JSON config:

```json
{
  "mcpServers": {
    "pinback": {
      "command": "npx",
      "args": ["-y", "pinback-mcp"]
    }
  }
}
```

Using a desktop app rather than a terminal? Paste the relevant command into a chat and ask the agent to run it.

### Pair the extension

Ask your agent for a pairing code — *"Give me a Pinback pairing code"* — and type it into the Pinback extension's setup page (it opens automatically when you install the [extension](https://github.com/andybiggs/pinback#readme)). Codes expire in 10 minutes and work once.

Prefer doing it by hand? The server also generates a long-lived token on first run, printed to stderr and stored at `~/.pinback/token` — paste that into the setup page instead.

## Tools

| Tool | Purpose |
|---|---|
| `get_comments` | Fetch comments, filterable by origin or URL substring |
| `list_origins` | List sites with comments and counts |
| `resolve_comment` | Mark a comment resolved (removed or kept, per store mode) |
| `get_pairing_code` | Mint a short-lived, single-use code for pairing the extension |
| `clear_comments` | Wipe the store, optionally per origin |

## Security

- The collector the extension talks to binds to `127.0.0.1` only — never reachable from the network.
- Every request requires the pairing token; only the extension's origin is allowed by CORS.
- Comments never leave your machine; they live in `~/.pinback/comments.json`.

Full architecture and threat model: [github.com/andybiggs/pinback](https://github.com/andybiggs/pinback).

## License

[PolyForm Noncommercial 1.0.0](./LICENSE) — free for personal, internal, and noncommercial use. Not licensed for resale or as a paid product/service.
