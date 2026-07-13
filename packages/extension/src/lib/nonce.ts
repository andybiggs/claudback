// Generates a per-probe nonce for the content-script <-> main-world detector
// handshake. crypto.randomUUID() is SecureContext-only, so it is undefined on
// http:// pages that aren't localhost — a core use case (LAN dev servers).
// Fall back to crypto.getRandomValues, which works in insecure contexts, so
// component detection degrades gracefully instead of throwing and breaking
// comment saving.

type NonceCrypto = {
	randomUUID?: () => string;
	getRandomValues: (array: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>;
};

export function generateNonce(cryptoObj: NonceCrypto): string {
	if (typeof cryptoObj.randomUUID === "function") {
		return cryptoObj.randomUUID();
	}

	const bytes = cryptoObj.getRandomValues(new Uint8Array(16));

	return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
