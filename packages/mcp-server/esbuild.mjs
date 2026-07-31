import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const root = (path) => fileURLToPath(new URL(path, import.meta.url));

// Baked in at build time so the MCP handshake reports the real published
// version; the bundle can't read package.json relative to itself once npm has
// installed it somewhere else.
const { version } = JSON.parse(await readFile(root("./package.json"), "utf8"));

// Bundle our own code plus the workspace @pinback/shared package into a single
// runnable file; keep the real npm dependencies external so they resolve from
// node_modules (and stay ordinary package.json dependencies for npm publish).
await esbuild.build({
	entryPoints: [root("./src/bin.ts")],
	outfile: root("./dist/bin.js"),
	bundle: true,
	platform: "node",
	format: "esm",
	target: "node20",
	external: ["@modelcontextprotocol/sdk", "@modelcontextprotocol/sdk/*", "zod"],
	define: { __PINBACK_VERSION__: JSON.stringify(version) },
});
