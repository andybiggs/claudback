import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { loadOrCreateToken } from "./auth.js";
import { startCollector } from "./collector.js";
import { createPairingManager } from "./pairing.js";
import { STORE_FILE } from "./paths.js";
import { createStore } from "./store.js";
import { registerTools } from "./tools.js";

export async function main(): Promise<void> {
	const token = await loadOrCreateToken();
	const pairing = createPairingManager(token);
	const store = createStore(STORE_FILE);
	const collector = await startCollector(store, token, pairing);

	// stdout carries the MCP protocol; all human-facing logging goes to stderr.
	if (collector) {
		console.error(`[claudback] collector listening on http://127.0.0.1:${collector.port}`);
	} else {
		console.error("[claudback] another instance owns the collector port; will take over if it frees up");
		// Keep trying to bind so the extension always has a live collector:
		// when the owning session exits, the first surviving process wins the
		// port and service continues without the user restarting anything.
		const retry = setInterval(() => {
			void startCollector(store, token, pairing)
				.then((taken) => {
					if (taken) {
						clearInterval(retry);
						console.error(`[claudback] took over collector on http://127.0.0.1:${taken.port}`);
					}
				})
				.catch(() => {});
		}, 2_000);

		// Don't let the retry loop keep an otherwise-finished process alive.
		retry.unref();
	}

	const server = new McpServer({ name: "claudback", version: "0.0.1" });

	registerTools(server, store, pairing);
	await server.connect(new StdioServerTransport());
	console.error("[claudback] MCP server connected on stdio");

	// When the parent session goes away, stdin closes. Exit instead of
	// lingering as an orphan — this also frees the collector port so a
	// surviving session's retry loop can take over.
	process.stdin.on("end", () => process.exit(0));
	process.stdin.on("close", () => process.exit(0));
}
