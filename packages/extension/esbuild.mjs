import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const entry = fileURLToPath(new URL("./src/index.ts", import.meta.url));

if (!existsSync(entry)) {
	console.log("No src/index.ts found, skipping build.");
	process.exit(0);
}

await esbuild.build({
	entryPoints: [entry],
	outdir: fileURLToPath(new URL("./dist", import.meta.url)),
	bundle: true,
	format: "esm",
	target: "chrome110",
});
