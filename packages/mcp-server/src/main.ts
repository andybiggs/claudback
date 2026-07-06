import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { loadOrCreateToken } from "./auth.js";
import { startCollector } from "./collector.js";
import { STORE_FILE } from "./paths.js";
import { createStore } from "./store.js";
import { registerTools } from "./tools.js";

export async function main(): Promise<void> {
	const token = await loadOrCreateToken();
	const store = createStore(STORE_FILE);
	const { port } = await startCollector(store, token);

	// stdout carries the MCP protocol; all human-facing logging goes to stderr.
	console.error(`[claudback] collector listening on http://127.0.0.1:${port}`);

	const server = new McpServer({ name: "claudback", version: "0.0.1" });

	registerTools(server, store);
	await server.connect(new StdioServerTransport());
	console.error("[claudback] MCP server connected on stdio");
}
