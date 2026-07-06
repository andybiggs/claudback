import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const root = (path) => fileURLToPath(new URL(path, import.meta.url));

// Bundle our own code plus the workspace @claudback/shared package into a single
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
});
