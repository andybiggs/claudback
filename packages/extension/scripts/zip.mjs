import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Zips the built dist/ contents (manifest at the zip root, as the Chrome Web
// Store requires) into packages/extension/claudback-extension-v<version>.zip.
// Run the build first: `npm run zip` does both.

const root = (path) => fileURLToPath(new URL(path, import.meta.url));

const manifest = JSON.parse(readFileSync(root("../dist/manifest.json"), "utf8"));
const outfile = root(`../claudback-extension-v${manifest.version}.zip`);

execFileSync("rm", ["-f", outfile]);
execFileSync("zip", ["-r", outfile, "."], { cwd: root("../dist"), stdio: "inherit" });

console.log(`\nwrote ${outfile}`);
