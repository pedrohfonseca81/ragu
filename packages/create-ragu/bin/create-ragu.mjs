#!/usr/bin/env node
// @ts-check
import { main } from "../dist/index.js";

main().catch((/** @type {unknown} */ e) => {
	console.error(e instanceof Error ? e.message : String(e));
	process.exit(1);
});
