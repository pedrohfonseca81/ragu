#!/usr/bin/env node
import { main } from "../src/index.mjs";

main().catch((e) => {
	console.error(e.message);
	process.exit(1);
});
