#!/usr/bin/env node
// Reports README translations that were made from an older README.md.
// Each translation starts with `<!-- source: README.md@<hash> -->`, where <hash> is the first 12 hex
// characters of the sha256 of README.md at the time of translation. Exit code 1 when any is stale or
// unmarked, so CI can surface it (the job is advisory; see .github/workflows/ci.yml).
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readme = join(root, "README.md");
const dir = join(root, "docs", "readme");

export function sourceHash(text = readFileSync(readme, "utf-8")) {
	return createHash("sha256").update(text).digest("hex").slice(0, 12);
}

export function check() {
	const current = sourceHash();
	const results = [];
	if (!existsSync(dir)) return { current, results };
	for (const file of readdirSync(dir).filter((f) => /^README\.[A-Za-z-]+\.md$/.test(f)).sort()) {
		const head = readFileSync(join(dir, file), "utf-8").slice(0, 200);
		const m = head.match(/<!--\s*source:\s*README\.md@([0-9a-f]+)\s*-->/);
		results.push({ file, hash: m?.[1] ?? null, stale: !m || m[1] !== current });
	}
	return { current, results };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const { current, results } = check();
	if (process.argv.includes("--hash")) {
		console.log(current);
		process.exit(0);
	}
	let bad = 0;
	for (const r of results) {
		const state = r.stale ? (r.hash ? `stale (made from README.md@${r.hash})` : "no source marker") : "up to date";
		console.log(`${r.stale ? "✗" : "✓"} docs/readme/${r.file}: ${state}`);
		if (r.stale) bad++;
	}
	if (bad) {
		console.log(`\nREADME.md is at @${current}. Ask your agent to retranslate the stale files from the English README and set their marker to that hash (docs/contributing.md → Translations).`);
		process.exit(1);
	}
	console.log(`All ${results.length} translations match README.md@${current}.`);
}
