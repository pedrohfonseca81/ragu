// @ts-check
// Copies ../../template into ./template and ../../plugins/ragu into ./plugin before
// `npm pack`/`npm publish`, so the published package is self-contained. `.gitignore` becomes `_gitignore` (npm strips dotfiles named .gitignore).
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "..", "..", "..", "template");
const dest = resolve(here, "..", "template");
const SKIP = new Set(["node_modules", "dist", ".astro", ".wrangler", "package-lock.json"]);

/**
 * @param {string} from
 * @param {string} to
 */
function copy(from, to) {
	mkdirSync(to, { recursive: true });
	for (const entry of readdirSync(from)) {
		if (SKIP.has(entry) || entry.endsWith(".generated.json")) continue;
		const a = join(from, entry);
		const b = join(to, entry === ".gitignore" ? "_gitignore" : entry);
		if (statSync(a).isDirectory()) copy(a, b);
		else cpSync(a, b);
	}
}

if (!existsSync(src)) {
	console.error(`template not found at ${src}`);
	process.exit(1);
}
rmSync(dest, { recursive: true, force: true });
copy(src, dest);
console.log(`synced template → ${dest}`);

// The agent plugin is copied into every connected repository by `create-ragu install`.
const pluginSrc = resolve(here, "..", "..", "..", "plugins", "ragu");
const pluginDest = resolve(here, "..", "plugin");
rmSync(pluginDest, { recursive: true, force: true });
SKIP.add("test");
copy(pluginSrc, pluginDest);
console.log(`synced plugin → ${pluginDest}`);
