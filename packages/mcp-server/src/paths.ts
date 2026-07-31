import { rename, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export const PINBACK_DIR = join(homedir(), ".pinback");
export const STORE_FILE = join(PINBACK_DIR, "comments.json");
export const TOKEN_FILE = join(PINBACK_DIR, "token");
export const PAIRING_FILE = join(PINBACK_DIR, "pairing.json");

// Pre-rename state directory.
export const LEGACY_DIR = join(homedir(), ".claudback");

async function isDirectory(path: string): Promise<boolean> {
	try {
		return (await stat(path)).isDirectory();
	} catch {
		return false;
	}
}

// Carry a pre-rename install forward. The directory holds the pairing token,
// so moving it rather than starting fresh is what spares every existing user
// from re-pairing. Both directories present means a new install already ran:
// leave it alone rather than clobbering current state with stale state.
export async function migrateLegacyDir(): Promise<boolean> {
	if (!(await isDirectory(LEGACY_DIR)) || (await isDirectory(PINBACK_DIR))) {
		return false;
	}

	try {
		await rename(LEGACY_DIR, PINBACK_DIR);

		return true;
	} catch (error: unknown) {
		// A failed migration is recoverable — the server generates a fresh token
		// and the user re-pairs — so warn rather than refusing to start.
		console.error(`[pinback] could not migrate ${LEGACY_DIR} to ${PINBACK_DIR}:`, error);

		return false;
	}
}
