export const DEFAULT_PORT = 57463;
export const COMMENT_TEXT_MAX_LENGTH = 4096;
export const HTML_EXCERPT_MAX_LENGTH = 2048;
export const TEXT_SNIPPET_MAX_LENGTH = 512;
export const TOKEN_HEADER = "x-claudback-token";
export const COMPONENT_NAME_MAX_LENGTH = 128;
export const COMPONENT_PATH_MAX_DEPTH = 5;

export const PAIR_PATH = "/pair";
export const PAIRING_CODE_LENGTH = 8;
// Exactly 32 symbols (no 0/1/I/O), so a random byte masked to 5 bits indexes
// it without bias.
export const PAIRING_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const PAIRING_CODE_TTL_MS = 10 * 60 * 1000;
export const PAIRING_MAX_ATTEMPTS = 5;

// Codes are displayed as XXXX-XXXX and typed by hand; server and extension
// must agree on how forgiving the input is.
export function normalizePairingCode(raw: string): string {
	return raw.toUpperCase().replace(/[\s-]/g, "");
}
