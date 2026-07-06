import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		name: "extension",
		environment: "node",
		exclude: ["dist/**", "tsbuild/**", "node_modules/**"],
	},
});
