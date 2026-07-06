import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const root = (path) => fileURLToPath(new URL(path, import.meta.url));
const outdir = root("./dist");

await mkdir(outdir, { recursive: true });

await esbuild.build({
	entryPoints: {
		background: root("./src/background.ts"),
		content: root("./src/content.ts"),
		popup: root("./src/popup.ts"),
		options: root("./src/options.ts"),
	},
	outdir,
	bundle: true,
	format: "esm",
	target: "chrome120",
});

await Promise.all(
	["manifest.json", "src/popup.html", "src/options.html"].map(async (file) => {
		const dest = `${outdir}/${file.split("/").pop()}`;

		await copyFile(root(`./${file}`), dest);
	}),
);
