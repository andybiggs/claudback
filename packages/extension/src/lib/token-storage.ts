export const TOKEN_KEY = "pinback_token";

// Pre-rename key. Everything that reads a token goes through readToken() so a
// user who paired before the Pinback rename is carried across on first read
// rather than being quietly logged out and asked to pair again.
const LEGACY_TOKEN_KEY = "claudback_token";

function asToken(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

export async function readToken(): Promise<string | null> {
	const result = await chrome.storage.local.get([TOKEN_KEY, LEGACY_TOKEN_KEY]);
	const token = asToken(result[TOKEN_KEY]);

	if (token !== null) {
		return token;
	}

	const legacy = asToken(result[LEGACY_TOKEN_KEY]);

	if (legacy === null) {
		return null;
	}

	// Rewrite under the current key and drop the old one, so the fallback is
	// paid once per install rather than on every read.
	await chrome.storage.local.set({ [TOKEN_KEY]: legacy });
	await chrome.storage.local.remove(LEGACY_TOKEN_KEY);

	return legacy;
}

export async function writeToken(token: string): Promise<void> {
	await chrome.storage.local.set({ [TOKEN_KEY]: token });
	await chrome.storage.local.remove(LEGACY_TOKEN_KEY);
}
