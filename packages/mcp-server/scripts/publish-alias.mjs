// Publishes the current build a second time under the pre-rename npm name.
//
// Existing users have `npx -y claudback-mcp` pinned in their agent config, and
// npx always resolves the latest version of whatever name is configured. Kept
// current, this alias means a pre-rename install picks up the real server on
// its next run without the user editing anything — which is what lets the
// extension update ship without stranding them on a stale server.
//
// Remove this once the deprecation window closes (see RELEASING.md).

import { execFileSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = (path) => fileURLToPath(new URL(path, import.meta.url));

const ALIAS_NAME = "claudback-mcp";
const REAL_NAME = "pinback-mcp";

const pkg = JSON.parse(await readFile(root("../package.json"), "utf8"));
const dryRun = !process.argv.includes("--publish");

const staging = await mkdtemp(join(tmpdir(), "pinback-alias-"));

try {
	await cp(root("../dist"), join(staging, "dist"), { recursive: true });
	await cp(root("../README.md"), join(staging, "README.md"));
	await cp(root("../../../LICENSE"), join(staging, "LICENSE"));

	// The alias entrypoint says the name changed, then hands off to the real
	// bundle. stderr only — stdout carries the MCP protocol and any stray byte
	// there corrupts the stream.
	await writeFile(
		join(staging, "dist", "alias-bin.js"),
		[
			"#!/usr/bin/env node",
			`console.error("[pinback] ${ALIAS_NAME} is now ${REAL_NAME}. This alias still works, but please re-register the server as: npx -y ${REAL_NAME}");`,
			'await import("./bin.js");',
			"",
		].join("\n"),
		"utf8",
	);

	await writeFile(
		join(staging, "package.json"),
		`${JSON.stringify(
			{
				...pkg,
				name: ALIAS_NAME,
				description: `Deprecated alias for ${REAL_NAME}. Pinback was formerly called Claudback — install ${REAL_NAME} instead.`,
				bin: { [ALIAS_NAME]: "dist/alias-bin.js" },
				scripts: undefined,
				devDependencies: undefined,
			},
			null,
			"\t",
		)}\n`,
		"utf8",
	);

	const args = ["publish", ...(dryRun ? ["--dry-run"] : [])];
	execFileSync("npm", args, { cwd: staging, stdio: "inherit" });

	if (dryRun) {
		console.error(`\n[pinback] dry run only. Re-run with --publish to publish ${ALIAS_NAME}@${pkg.version}.`);
	}
} finally {
	await rm(staging, { recursive: true, force: true });
}
