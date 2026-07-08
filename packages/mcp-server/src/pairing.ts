import { randomBytes } from "node:crypto";

import {
	PAIRING_CODE_ALPHABET,
	PAIRING_CODE_LENGTH,
	PAIRING_CODE_TTL_MS,
	PAIRING_MAX_ATTEMPTS,
	normalizePairingCode,
} from "@claudback/shared";

import { tokenMatches } from "./auth.js";

// A pairing code lets the extension bootstrap the real bearer token without
// the user digging ~/.claudback/token out of a hidden directory: Claude mints
// a code via the get_pairing_code tool, the user types it into the extension,
// and the collector's /pair endpoint exchanges it for the token. The code is
// disposable by design — short-lived, single-use, and never written to disk —
// so it is safe to show in a chat transcript where the token is not.
export interface PairingManager {
	mint(): { code: string; expiresAt: number; ttlMinutes: number };
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

export function formatPairingCode(code: string): string {
	return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function createPairingManager(
	token: string,
	opts?: { now?: () => number; delayMs?: number },
): PairingManager {
	const now = opts?.now ?? Date.now;
	const delayMs = opts?.delayMs ?? FAILURE_DELAY_MS;
	let active: ActiveCode | null = null;

	const fail = async (): Promise<null> => {
		await new Promise((resolve) => {
			setTimeout(resolve, delayMs);
		});

		return null;
	};

	return {
		mint() {
			// Minting replaces any previous code: only one can be active.
			active = { code: generateCode(), expiresAt: now() + PAIRING_CODE_TTL_MS, failedAttempts: 0 };

			return {
				code: active.code,
				expiresAt: active.expiresAt,
				ttlMinutes: PAIRING_CODE_TTL_MS / 60_000,
			};
		},

		async exchange(rawCode) {
			if (active === null || now() >= active.expiresAt) {
				return fail();
			}

			if (tokenMatches(normalizePairingCode(rawCode), active.code)) {
				// Single-use: a successful exchange retires the code.
				active = null;

				return token;
			}

			// Count the attempt before awaiting the failure delay so parallel
			// requests can't all read a stale counter and race past the cap.
			active.failedAttempts += 1;

			if (active.failedAttempts >= PAIRING_MAX_ATTEMPTS) {
				// Too many wrong guesses kills the code; the user must mint a
				// fresh one, which caps guessing at PAIRING_MAX_ATTEMPTS per code.
				active = null;
			}

			return fail();
		},
	};
}
