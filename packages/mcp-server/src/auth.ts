import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

import { CLAUDBACK_DIR, TOKEN_FILE } from "./paths.js";

// The pairing token is the collector's only authentication. It is generated
// once per machine and pasted into the extension's options page by the user.
export async function loadOrCreateToken(): Promise<string> {
	try {
		const existing = (await readFile(TOKEN_FILE, "utf8")).trim();

		if (existing.length >= 32) {
			return existing;
		}
	} catch {
		// Fall through to generation.
	}

	const token = randomBytes(32).toString("hex");

	await mkdir(CLAUDBACK_DIR, { recursive: true, mode: 0o700 });
	// 0600: the token gates writes to the store, so only this user may read it.
	await writeFile(TOKEN_FILE, `${token}\n`, { encoding: "utf8", mode: 0o600 });
	console.error(
		`[claudback] pairing token generated at ${TOKEN_FILE} — paste it into the Claudback extension options page.`,
	);

	return token;
}

// Compare via digests so length differences don't leak timing information.
export function tokenMatches(provided: string | undefined, expected: string): boolean {
	if (!provided) {
		return false;
	}

	const providedDigest = createHash("sha256").update(provided).digest();
	const expectedDigest = createHash("sha256").update(expected).digest();

	return timingSafeEqual(providedDigest, expectedDigest);
}
