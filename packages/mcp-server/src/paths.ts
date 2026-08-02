import { homedir } from "node:os";
import { join } from "node:path";

// Deliberately still `.claudback` after the Pinback rename. The directory name
// is never typed — pairing is a code from the agent, and the npm package, the
// MCP server, its tools, and the extension all carry the new name. Renaming it
// would buy nothing visible and cost correctness: a v0.2.x server (still live
// via the `claudback-mcp` alias, and long-running agent sessions keep one
// resident for hours) has this path compiled in. Move the directory under a
// running old server and it recreates `.claudback` on its next write — the
// extension keeps getting 201s while the agent reads the other directory and
// reports no comments. Silent, and sticky once both exist.
//
// Revisit only once the compat window closes and old servers have aged out —
// same release that flips the token header. See RELEASING.md.
export const STATE_DIR = join(homedir(), ".claudback");
export const STORE_FILE = join(STATE_DIR, "comments.json");
export const TOKEN_FILE = join(STATE_DIR, "token");
export const PAIRING_FILE = join(STATE_DIR, "pairing.json");
