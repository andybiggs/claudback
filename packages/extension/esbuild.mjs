import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const root = (path) => fileURLToPath(new URL(path, import.meta.url));
const outdir = root("./dist");
const watch = process.argv.includes("--watch");

await mkdir(outdir, { recursive: true });

const ICON_SIZES = [16, 32, 48, 128];

async function copyStaticFiles() {
	await mkdir(`${outdir}/icons`, { recursive: true });
	await Promise.all([
		...["manifest.json", "src/popup.html", "src/options.html", "src/onboarding.html"].map(async (file) => {
			const dest = `${outdir}/${file.split("/").pop()}`;

			await copyFile(root(`./${file}`), dest);
		}),
		...ICON_SIZES.map(async (size) => {
			await copyFile(root(`./icons/icon-${size}.png`), `${outdir}/icons/icon-${size}.png`);
		}),
	]);
}

const buildOptions = {
	entryPoints: {
		background: root("./src/background.ts"),
		content: root("./src/content.ts"),
		popup: root("./src/popup.ts"),
		options: root("./src/options.ts"),
		onboarding: root("./src/onboarding.ts"),
	},
	outdir,
	bundle: true,
	format: "esm",
	target: "chrome120",
};

if (watch) {
	// Static files (manifest/html) aren't watched by esbuild, so copy them
	// once up front — rerun the build script if you edit those directly.
	await copyStaticFiles();

	const ctx = await esbuild.context({
		...buildOptions,
		plugins: [
			{
				name: "log-rebuild",
				setup(build) {
					build.onEnd((result) => {
						const now = new Date().toLocaleTimeString();

						if (result.errors.length > 0) {
							console.error(`[${now}] build failed`);
						} else {
							console.log(`[${now}] rebuilt — reload the extension at chrome://extensions`);
						}
					});
				},
			},
		],
	});

	await ctx.watch();
	console.log("watching for changes… (Ctrl+C to stop)");
} else {
	await esbuild.build(buildOptions);
	await copyStaticFiles();
}
