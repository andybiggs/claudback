import { homedir } from "node:os";
import { join } from "node:path";

export const CLAUDBACK_DIR = join(homedir(), ".claudback");
export const STORE_FILE = join(CLAUDBACK_DIR, "comments.json");
export const TOKEN_FILE = join(CLAUDBACK_DIR, "token");
export const PAIRING_FILE = join(CLAUDBACK_DIR, "pairing.json");
