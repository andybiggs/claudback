import type { ServerResponse } from "node:http";

import { TOKEN_HEADER } from "@claudback/shared";

// Pinned to the published Chrome Web Store listing's extension ID now that one
// exists — any other chrome-extension:// origin (an unpacked dev build, or a
// different extension entirely) is rejected. Web pages always send an
// http(s) Origin, so drive-by requests are rejected here regardless of
// whether they somehow obtained the token.
const PUBLISHED_EXTENSION_ID = "dbnmlcmmgnchigedlglfmchkendlcfgc";
const EXTENSION_ORIGIN = `chrome-extension://${PUBLISHED_EXTENSION_ID}`;

// Requests with no Origin header come from non-browser local processes (curl,
// scripts). Those can't be meaningfully blocked by an origin check — they can
// forge any header — so the pairing token remains the real gate for them.
export function originAllowed(origin: string | undefined): boolean {
	if (origin === undefined) {
		return true;
	}

	return origin === EXTENSION_ORIGIN;
}

// Only ever called with an allowed chrome-extension:// origin: the allowed
// origin is echoed back verbatim, never a wildcard.
export function applyCorsHeaders(res: ServerResponse, origin: string): void {
	res.setHeader("access-control-allow-origin", origin);
	res.setHeader("vary", "origin");
	res.setHeader("access-control-allow-methods", "GET,POST,PUT,DELETE,OPTIONS");
	res.setHeader("access-control-allow-headers", `content-type, ${TOKEN_HEADER}`);
	// Chrome's Private Network Access preflight: public/secure contexts asking
	// to reach 127.0.0.1 must be answered explicitly.
	res.setHeader("access-control-allow-private-network", "true");
}
