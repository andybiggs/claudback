import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PAIRING_CODE_ALPHABET, PAIRING_CODE_TTL_MS, PAIRING_MAX_ATTEMPTS } from "@claudback/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPairingManager, formatPairingCode } from "./pairing.js";

const TOKEN = "a".repeat(64);

let dir: string;
let pairingFile: string;

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "claudback-pairing-"));
	pairingFile = join(dir, "pairing.json");
});

afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

function manager(now?: () => number) {
	return createPairingManager(TOKEN, { now, delayMs: 0, filePath: pairingFile });
}

describe("createPairingManager", () => {
	it("mints 8-char codes drawn from the unambiguous alphabet", async () => {
		const { code, ttlMinutes } = await manager().mint();

		expect(code).toHaveLength(8);
		expect(ttlMinutes).toBe(10);

		for (const char of code) {
			expect(PAIRING_CODE_ALPHABET).toContain(char);
		}
	});

	it("mints a different code each time", async () => {
		const pairing = manager();

		expect((await pairing.mint()).code).not.toBe((await pairing.mint()).code);
	});

	it("exchanges the correct code for the token exactly once", async () => {
		const pairing = manager();
		const { code } = await pairing.mint();

		expect(await pairing.exchange(code)).toBe(TOKEN);
		// Single-use: the same code fails on the second attempt.
		expect(await pairing.exchange(code)).toBeNull();
	});

	it("accepts lowercase, dashed, and spaced input", async () => {
		const pairing = manager();
		const { code } = await pairing.mint();
		const sloppy = `${code.slice(0, 4).toLowerCase()} - ${code.slice(4).toLowerCase()}`;

		expect(await pairing.exchange(sloppy)).toBe(TOKEN);
	});

	it("rejects the code once the TTL has elapsed", async () => {
		let clock = 1_000_000;
		const pairing = manager(() => clock);
		const { code, expiresAt } = await pairing.mint();

		expect(expiresAt).toBe(clock + PAIRING_CODE_TTL_MS);
		clock += PAIRING_CODE_TTL_MS;

		expect(await pairing.exchange(code)).toBeNull();
	});

	it("invalidates the old code when a new one is minted", async () => {
		const pairing = manager();
		const first = (await pairing.mint()).code;
		const second = (await pairing.mint()).code;

		expect(await pairing.exchange(first)).toBeNull();
		expect(await pairing.exchange(second)).toBe(TOKEN);
	});

	it("kills the code after too many failed attempts", async () => {
		const pairing = manager();
		const { code } = await pairing.mint();

		for (let i = 0; i < PAIRING_MAX_ATTEMPTS; i += 1) {
			expect(await pairing.exchange("WRONGONE")).toBeNull();
		}

		// Even the correct code fails now; the user must mint a fresh one.
		expect(await pairing.exchange(code)).toBeNull();
	});

	it("fails quietly when no code is active", async () => {
		expect(await manager().exchange("WHATEVER")).toBeNull();
	});

	it("exchanges a code minted by a different instance sharing the file", async () => {
		// The session that mints the code (any Claude Code session) is usually
		// not the one that owns the collector and redeems it. Both point at the
		// same pairing file, so the code still works.
		const minter = manager();
		const redeemer = manager();
		const { code } = await minter.mint();

		expect(await redeemer.exchange(code)).toBe(TOKEN);
		// Single-use across instances too: the shared file is now cleared.
		expect(await minter.exchange(code)).toBeNull();
	});
});

describe("formatPairingCode", () => {
	it("inserts a dash between the two halves", () => {
		expect(formatPairingCode("ABCD2345")).toBe("ABCD-2345");
	});
});
