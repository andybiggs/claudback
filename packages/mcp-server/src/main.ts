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
		console.error("[claudback] another instance already owns the collector port; using shared store only");
	}

	const server = new McpServer({ name: "claudback", version: "0.0.1" });

	registerTools(server, store, pairing);
	await server.connect(new StdioServerTransport());
	console.error("[claudback] MCP server connected on stdio");
}
