import { mkdtempSync } from "node:fs";
import { readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const dir = vi.hoisted(() => {
	const { mkdtempSync } = require("node:fs") as typeof import("node:fs");
	const { tmpdir } = require("node:os") as typeof import("node:os");
	const { join } = require("node:path") as typeof import("node:path");

	return mkdtempSync(join(tmpdir(), "claudback-auth-"));
});

vi.mock("./paths.js", () => ({
	CLAUDBACK_DIR: dir,
	STORE_FILE: join(dir, "comments.json"),
	TOKEN_FILE: join(dir, "token"),
}));

import { loadOrCreateToken, tokenMatches } from "./auth.js";

const tokenFile = join(dir, "token");

describe("loadOrCreateToken", () => {
	beforeEach(async () => {
		await rm(tokenFile, { force: true });
	});

	afterAll(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it("generates a 64-hex-char token when no token file exists", async () => {
		const token = await loadOrCreateToken();

		expect(token).toMatch(/^[0-9a-f]{64}$/);
	});

	it("writes the token file with mode 0600", async () => {
		await loadOrCreateToken();

		const info = await stat(tokenFile);

		expect(info.mode & 0o777).toBe(0o600);
	});

	it("reuses an existing valid token file", async () => {
		await writeFile(tokenFile, `${"b".repeat(40)}\n`, "utf8");

		expect(await loadOrCreateToken()).toBe("b".repeat(40));
	});

	it("regenerates when the existing token is shorter than 32 chars", async () => {
		await writeFile(tokenFile, "short\n", "utf8");

		const token = await loadOrCreateToken();

		expect(token).toMatch(/^[0-9a-f]{64}$/);
		expect((await readFile(tokenFile, "utf8")).trim()).toBe(token);
	});
});

describe("tokenMatches", () => {
	const expected = "c".repeat(64);

	it("accepts the correct token", () => {
		expect(tokenMatches(expected, expected)).toBe(true);
	});

	it("rejects a wrong token of the same length", () => {
		expect(tokenMatches("d".repeat(64), expected)).toBe(false);
	});

	it("rejects an empty string", () => {
		expect(tokenMatches("", expected)).toBe(false);
	});

	it("rejects a token of a different length", () => {
		expect(tokenMatches("c".repeat(63), expected)).toBe(false);
	});
});
