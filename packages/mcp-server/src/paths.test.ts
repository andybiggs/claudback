import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { PAIRING_FILE, STATE_DIR, STORE_FILE, TOKEN_FILE } from "./paths.js";

// This suite exists to stop the state directory being renamed to `.pinback`
// on tidiness grounds. It is not cosmetic drift — a v0.2.x server is still
// reachable through the `claudback-mcp` npm alias and has `.claudback`
// compiled in, and a long-running agent session keeps one resident for hours.
// Two servers disagreeing about the state directory is a silent split-brain:
// whichever owns port 57463 serves the extension and answers 201, while the
// other reads the directory the user's agent reports from, and finds nothing.
// Moving the directory out from under a running old server is worse still —
// its next write recreates the old path via mkdir(recursive), so both exist
// from then on and no later reconciliation can tell which is authoritative.
//
// Rename only once the compat window closes and old servers have aged out,
// alongside the token-header flip. See RELEASING.md.
describe("state directory", () => {
	it("stays at ~/.claudback so a concurrent v0.2.x server shares one store", () => {
		expect(STATE_DIR).toBe(join(homedir(), ".claudback"));
	});

	it("keeps every state file inside that one directory", () => {
		expect(STORE_FILE).toBe(join(STATE_DIR, "comments.json"));
		expect(TOKEN_FILE).toBe(join(STATE_DIR, "token"));
		expect(PAIRING_FILE).toBe(join(STATE_DIR, "pairing.json"));
	});
});
