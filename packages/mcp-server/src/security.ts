import type { ServerResponse } from "node:http";

import { TOKEN_HEADER } from "@claudback/shared";

// The Web Store listing fixes the published extension's ID, so browser
// requests are pinned to it. Unpacked dev builds get a machine-specific ID;
// developers opt theirs in explicitly via CLAUDBACK_DEV_EXTENSION_ID. Web
// pages always send an http(s) Origin, so drive-by requests are rejected here
// regardless of whether they somehow obtained the token.
const PUBLISHED_EXTENSION_ID = "dbnmlcmmgnchigedlglfmchkendlcfgc";

// Chrome extension IDs are 32 chars drawn from a-p.
const EXTENSION_ID_PATTERN = /^[a-p]{32}$/;

function allowedOrigins(): Set<string> {
	const origins = new Set([`chrome-extension://${PUBLISHED_EXTENSION_ID}`]);
	const devId = process.env.CLAUDBACK_DEV_EXTENSION_ID;
	if (devId !== undefined && EXTENSION_ID_PATTERN.test(devId)) {
		origins.add(`chrome-extension://${devId}`);
	}

	return origins;
}

// Requests with no Origin header come from non-browser local processes (curl,
// scripts). Those can't be meaningfully blocked by an origin check — they can
// forge any header — so the pairing token remains the real gate for them.
export function originAllowed(origin: string | undefined): boolean {
	if (origin === undefined) {
		return true;
	}

	return allowedOrigins().has(origin);
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
