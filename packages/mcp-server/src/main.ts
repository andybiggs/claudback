import type { Server } from "node:http";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { loadOrCreateToken } from "./auth.js";
import { startCollector } from "./collector.js";
import { createPairingManager } from "./pairing.js";
import { STORE_FILE } from "./paths.js";
import { createStore } from "./store.js";
import { registerTools } from "./tools.js";

// Replaced by esbuild with the real package version at build time. Under
// vitest there is no define step, hence the guard.
declare const __PINBACK_VERSION__: string | undefined;

const SERVER_VERSION = typeof __PINBACK_VERSION__ === "string" ? __PINBACK_VERSION__ : "0.0.0-dev";

// Keep trying to bind so the extension always has a live collector: when the
// owning session exits, the first surviving process wins the port and service
// continues without the user restarting anything. unref'd so the loop never
// keeps an otherwise-finished process alive.
export function retryTakeover(
	start: () => Promise<{ server: Server; port: number } | undefined>,
	intervalMs: number,
	onTaken: (port: number) => void,
): NodeJS.Timeout {
	const retry = setInterval(() => {
		void start()
			.then((taken) => {
				if (taken) {
					clearInterval(retry);
					onTaken(taken.port);
				}
			})
			.catch((error: unknown) => {
				// EADDRINUSE resolves undefined; anything that rejects here is
				// unexpected (EACCES, EPERM, …) and must not vanish, or the
				// loop spins silently forever while the extension shows offline.
				console.error("[pinback] collector takeover attempt failed:", error);
			});
	}, intervalMs);

	retry.unref();

	return retry;
}

export async function main(): Promise<void> {
	const token = await loadOrCreateToken();
	const pairing = createPairingManager(token);
	const store = createStore(STORE_FILE);
	const collector = await startCollector(store, token, pairing);

	// stdout carries the MCP protocol; all human-facing logging goes to stderr.
	if (collector) {
		console.error(`[pinback] collector listening on http://127.0.0.1:${collector.port}`);
	} else {
		console.error("[pinback] another instance owns the collector port; will take over if it frees up");
		retryTakeover(() => startCollector(store, token, pairing), 2_000, (port) => {
			console.error(`[pinback] took over collector on http://127.0.0.1:${port}`);
		});
	}

	const server = new McpServer({ name: "pinback", version: SERVER_VERSION });

	registerTools(server, store, pairing);
	await server.connect(new StdioServerTransport());
	console.error("[pinback] MCP server connected on stdio");

	// When the parent session goes away, stdin closes. Exit instead of
	// lingering as an orphan — this also frees the collector port so a
	// surviving session's retry loop can take over.
	process.stdin.on("end", () => process.exit(0));
	process.stdin.on("close", () => process.exit(0));
}
