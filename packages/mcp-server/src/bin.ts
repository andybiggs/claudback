#!/usr/bin/env node
import { main } from "./main.js";

main().catch((error) => {
	console.error("[pinback] fatal:", error);
	process.exit(1);
});
