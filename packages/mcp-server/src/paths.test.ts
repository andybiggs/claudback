import { mkdtempSync } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// migrateLegacyDir() reads the module-level PINBACK_DIR/LEGACY_DIR constants,
// which are derived from the real homedir at import time. Point them at a
// throwaway root so the test never touches the developer's own ~/.pinback.
const root = vi.hoisted(() => {
	const { mkdtempSync } = require("node:fs") as typeof import("node:fs");
	const { tmpdir } = require("node:os") as typeof import("node:os");
	const { join } = require("node:path") as typeof import("node:path");

	return mkdtempSync(join(tmpdir(), "pinback-paths-"));
});

const PINBACK_DIR = join(root, ".pinback");
const LEGACY_DIR = join(root, ".claudback");

vi.mock("node:os", async (importOriginal) => ({
	...(await importOriginal<typeof import("node:os")>()),
	homedir: () => root,
}));

const { migrateLegacyDir } = await import("./paths.js");

async function exists(path: string): Promise<boolean> {
	try {
		await stat(path);

		return true;
	} catch {
		return false;
	}
}

describe("migrateLegacyDir", () => {
	beforeEach(async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		await rm(PINBACK_DIR, { recursive: true, force: true });
		await rm(LEGACY_DIR, { recursive: true, force: true });
	});

	afterAll(async () => {
		await rm(root, { recursive: true, force: true });
	});

	it("does nothing when there is no pre-rename directory", async () => {
		expect(await migrateLegacyDir()).toBe(false);
		expect(await exists(PINBACK_DIR)).toBe(false);
	});

	// The whole point of the migration: the pairing token moves across, so an
	// existing install stays paired instead of silently generating a new token.
	it("moves the pre-rename directory across, token and comments intact", async () => {
		await mkdir(LEGACY_DIR, { recursive: true, mode: 0o700 });
		await writeFile(join(LEGACY_DIR, "token"), "b".repeat(32), "utf8");
		await writeFile(join(LEGACY_DIR, "comments.json"), '{"mode":"clear","comments":[]}', "utf8");

		expect(await migrateLegacyDir()).toBe(true);

		expect(await readFile(join(PINBACK_DIR, "token"), "utf8")).toBe("b".repeat(32));
		expect(await readFile(join(PINBACK_DIR, "comments.json"), "utf8")).toBe('{"mode":"clear","comments":[]}');
		expect(await exists(LEGACY_DIR)).toBe(false);
	});

	// A current install that also has stale pre-rename state must not have its
	// live token clobbered by the old one.
	it("leaves current state alone when both directories exist", async () => {
		await mkdir(LEGACY_DIR, { recursive: true, mode: 0o700 });
		await writeFile(join(LEGACY_DIR, "token"), "old-token", "utf8");
		await mkdir(PINBACK_DIR, { recursive: true, mode: 0o700 });
		await writeFile(join(PINBACK_DIR, "token"), "current-token", "utf8");

		expect(await migrateLegacyDir()).toBe(false);

		expect(await readFile(join(PINBACK_DIR, "token"), "utf8")).toBe("current-token");
		expect(await exists(LEGACY_DIR)).toBe(true);
	});

	it("is a no-op the second time it runs", async () => {
		await mkdir(LEGACY_DIR, { recursive: true, mode: 0o700 });
		await writeFile(join(LEGACY_DIR, "token"), "c".repeat(32), "utf8");

		expect(await migrateLegacyDir()).toBe(true);
		expect(await migrateLegacyDir()).toBe(false);
		expect(await readFile(join(PINBACK_DIR, "token"), "utf8")).toBe("c".repeat(32));
	});
});
