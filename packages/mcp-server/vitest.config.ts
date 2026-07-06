import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		name: "mcp-server",
		environment: "node",
		exclude: ["dist/**", "tsbuild/**", "node_modules/**"],
	},
});
