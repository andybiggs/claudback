import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
	PAIRING_CODE_ALPHABET,
	PAIRING_CODE_LENGTH,
	PAIRING_CODE_TTL_MS,
	PAIRING_MAX_ATTEMPTS,
	normalizePairingCode,
} from "@claudback/shared";

import { tokenMatches } from "./auth.js";
import { PAIRING_FILE } from "./paths.js";

// A pairing code lets the extension bootstrap the real bearer token without
// the user digging ~/.claudback/token out of a hidden directory: Claude mints
// a code via the get_pairing_code tool, the user types it into the extension,
// and the collector's /pair endpoint exchanges it for the token.
//
// The active code is persisted to ~/.claudback/pairing.json rather than kept
// in process memory. Every Claude Code session spawns its own claudback-mcp
// process, but only one owns the collector that serves /pair — so the session
// that mints a code is usually not the one that redeems it. A shared file lets
// a code minted in any session be exchanged by whichever session owns the
// collector. The code stays short-lived, single-use, and attempt-capped; it is
// a weaker secret than the token, which already sits on disk beside it at the
// same 0600 permissions.
export interface PairingManager {
	mint(): Promise<{ code: string; expiresAt: number; ttlMinutes: number }>;
	// Resolves to the bearer token on success, null on any failure. Failures
	// are uniform (wrong, expired, none active) and delayed, so callers can't
	// distinguish them or probe quickly.
	exchange(rawCode: string): Promise<string | null>;
}

interface ActiveCode {
	code: string;
	expiresAt: number;
	failedAttempts: number;
}

const FAILURE_DELAY_MS = 250;

function generateCode(): string {
	const bytes = randomBytes(PAIRING_CODE_LENGTH);
	let code = "";

	for (const byte of bytes) {
		// The alphabet has exactly 32 symbols, so masking to 5 bits is unbiased.
		code += PAIRING_CODE_ALPHABET[byte & 31];
	}

	return code;
}

function isActiveCode(value: unknown): value is ActiveCode {
	if (typeof value !== "object" || value === null) {
		return false;
	}

	const candidate = value as Record<string, unknown>;

	return (
		typeof candidate.code === "string" &&
		typeof candidate.expiresAt === "number" &&
		typeof candidate.failedAttempts === "number"
	);
}

export function formatPairingCode(code: string): string {
	return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function createPairingManager(
	token: string,
	opts?: { now?: () => number; delayMs?: number; filePath?: string },
): PairingManager {
	const now = opts?.now ?? Date.now;
	const delayMs = opts?.delayMs ?? FAILURE_DELAY_MS;
	const filePath = opts?.filePath ?? PAIRING_FILE;

	async function readActive(): Promise<ActiveCode | null> {
		let raw: string;

		try {
			raw = await readFile(filePath, "utf8");
		} catch {
			// Missing or unreadable file: treat as no code active. A malformed
			// file is disposable — the next mint overwrites it.
			return null;
		}

		try {
			const parsed: unknown = JSON.parse(raw);

			return isActiveCode(parsed) ? parsed : null;
		} catch {
			return null;
		}
	}

	async function writeActive(active: ActiveCode): Promise<void> {
		await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });

		// Write-then-rename so a crash mid-write can't leave a truncated file.
		const tmpPath = `${filePath}.tmp`;

		// 0600: same sensitivity as the token file this code exchanges for.
		await writeFile(tmpPath, `${JSON.stringify(active)}\n`, { encoding: "utf8", mode: 0o600 });
		await rename(tmpPath, filePath);
	}

	async function clearActive(): Promise<void> {
		await rm(filePath, { force: true });
	}

	// Serialize the read-modify-write so concurrent tool calls or /pair requests
	// in this process can't drop each other's changes or race past the attempt
	// cap. Exchanges only ever run in the single collector-owning process, so
	// this in-process chain is enough to keep the cap honest per code.
	let chain: Promise<unknown> = Promise.resolve();

	function serialize<T>(operation: () => Promise<T>): Promise<T> {
		const result = chain.then(operation, operation);

		chain = result.catch(() => undefined);

		return result;
	}

	const fail = async (): Promise<null> => {
		await new Promise((resolve) => {
			setTimeout(resolve, delayMs);
		});

		return null;
	};

	return {
		mint() {
			return serialize(async () => {
				// Minting replaces any previous code: only one can be active.
				const active: ActiveCode = {
					code: generateCode(),
					expiresAt: now() + PAIRING_CODE_TTL_MS,
					failedAttempts: 0,
				};

				await writeActive(active);

				return {
					code: active.code,
					expiresAt: active.expiresAt,
					ttlMinutes: PAIRING_CODE_TTL_MS / 60_000,
				};
			});
		},

		exchange(rawCode) {
			return serialize(async () => {
				const active = await readActive();

				if (active === null || now() >= active.expiresAt) {
					return fail();
				}

				if (tokenMatches(normalizePairingCode(rawCode), active.code)) {
					// Single-use: a successful exchange retires the code.
					await clearActive();

					return token;
				}

				active.failedAttempts += 1;

				// Another session may have minted a fresh code while we were
				// checking; don't clobber it with this stale code's attempts.
				const current = await readActive();

				if (current !== null && current.code === active.code) {
					if (active.failedAttempts >= PAIRING_MAX_ATTEMPTS) {
						// Too many wrong guesses kills the code; the user must mint
						// a fresh one, capping guessing at PAIRING_MAX_ATTEMPTS.
						await clearActive();
					} else {
						await writeActive(active);
					}
				}

				return fail();
			});
		},
	};
}
