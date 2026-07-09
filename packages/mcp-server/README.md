# claudback-mcp

The local MCP server for [Claudback](https://andybiggs.github.io/Claudback/) — pin visual-feedback comments to elements on any web page with the Claudback Chrome extension, and let Claude read them while you iterate.

The main use case: run your site or prototype locally, drop comments on the bits you want changed ("make this button bigger", "this overlaps on mobile"), then ask Claude Code to check your Claudback comments and make the edits.

## Setup

### Claude Code

```sh
claude mcp add claudback -- npx -y claudback-mcp
```

### Claude Desktop

Add to your `claude_desktop_config.json`:

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

Claude starts and stops the server itself — there is nothing to run manually.

### Pair the extension

Ask Claude for a pairing code — *"Give me a Claudback pairing code"* — and type it into the Claudback extension's setup page (it opens automatically when you install the [extension](https://github.com/andybiggs/Claudback#readme)). Codes expire in 10 minutes and work once.

Prefer doing it by hand? The server also generates a long-lived token on first run, printed to stderr and stored at `~/.claudback/token` — paste that into the setup page instead.

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
- Comments never leave your machine; they live in `~/.claudback/comments.json`.

Full architecture and threat model: [github.com/andybiggs/Claudback](https://github.com/andybiggs/Claudback).

## License

[PolyForm Noncommercial 1.0.0](./LICENSE) — free for personal, internal, and noncommercial use. Not licensed for resale or as a paid product/service.
