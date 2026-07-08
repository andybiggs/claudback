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

On first run the server generates a pairing token, prints it to stderr, and stores it at `~/.claudback/token`. Paste it into the Claudback extension's setup page (it opens automatically when you install the [extension](https://github.com/andybiggs/Claudback#readme)) and you're connected.

## Tools

| Tool | Purpose |
|---|---|
| `get_comments` | Fetch comments, filterable by origin or URL substring |
| `list_origins` | List sites with comments and counts |
| `resolve_comment` | Mark a comment resolved (removed or kept, per store mode) |
| `clear_comments` | Wipe the store, optionally per origin |

## Security

- The collector the extension talks to binds to `127.0.0.1` only — never reachable from the network.
- Every request requires the pairing token; only the extension's origin is allowed by CORS.
- Comments never leave your machine; they live in `~/.claudback/comments.json`.

Full architecture and threat model: [github.com/andybiggs/Claudback](https://github.com/andybiggs/Claudback).

## License

MIT
