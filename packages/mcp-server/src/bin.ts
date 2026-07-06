#!/usr/bin/env node
import { main } from "./main.js";

main().catch((error) => {
	console.error("[claudback] fatal:", error);
	process.exit(1);
});
