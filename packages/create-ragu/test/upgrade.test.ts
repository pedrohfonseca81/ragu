import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scaffold, upgrade } from "../src/index.ts";

function outcomes(files: { path: string; outcome: string }[]): Record<string, string> {
	return Object.fromEntries(files.map((f) => [f.path, f.outcome]));
}

test("upgrade refreshes the scaffold layer and leaves content alone", () => {
	const root = mkdtempSync(join(tmpdir(), "create-ragu-"));
	try {
		const { dest } = scaffold({ dir: join(root, "kb"), name: "kb", title: "KB", systems: [], remote: false, example: true });
		const configPath = join(dest, "ragu.config.json");

		// Fresh scaffold: nothing to do.
		const fresh = upgrade({ configPath });
		assert.deepEqual(fresh.files.filter((f) => f.outcome !== "kept"), []);
		assert.equal(fresh.packageChanged, false);

		// Age the knowledge base: an old theme file, a stale favicon, a missing script, an old dependency, a user script,
		// and an edited page.
		writeFileSync(join(dest, "src", "styles", "ragu.css"), "/* old */\n");
		rmSync(join(dest, "src", "pages"), { recursive: true });
		writeFileSync(join(dest, "public", "favicon.svg"), "<svg>mine</svg>");
		const pkgPath = join(dest, "package.json");
		const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { dependencies: Record<string, string>; scripts: Record<string, string> };
		pkg.dependencies["ragu-mcp"] = "^0.3.0";
		pkg.scripts.mine = "echo mine";
		writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
		const page = join(dest, "src", "content", "docs", "domain", "order-cancellation.md");
		writeFileSync(page, "---\ntitle: Edited\n---\nmine\n");

		const dry = upgrade({ configPath, dryRun: true });
		assert.equal(readFileSync(join(dest, "src", "styles", "ragu.css"), "utf-8"), "/* old */\n", "dry run writes nothing");

		const result = upgrade({ configPath });
		const o = outcomes(result.files);
		assert.equal(o["src/styles/ragu.css"], "updated");
		assert.equal(o["src/pages/graph.astro"], "created");
		assert.equal(o["scripts/check.mjs"], "kept");
		assert.equal(o["package.json"], "updated");
		assert.deepEqual(outcomes(dry.files), o, "dry run reports the same plan");
		assert.equal(result.packageChanged, true);

		const after = JSON.parse(readFileSync(pkgPath, "utf-8")) as { name: string; dependencies: Record<string, string>; scripts: Record<string, string> };
		assert.equal(after.name, "kb", "package name stays");
		assert.notEqual(after.dependencies["ragu-mcp"], "^0.3.0");
		assert.equal(after.scripts.mine, "echo mine", "user scripts stay");
		assert.equal(after.scripts.prebuild, "npm run check");
		assert.equal(after.dependencies.agents, undefined, "remote-only deps stay out");
		assert.equal(readFileSync(page, "utf-8"), "---\ntitle: Edited\n---\nmine\n", "content untouched");
		assert.ok(!existsSync(join(dest, "src", "worker")), "remote files stay out");
		assert.doesNotMatch(readFileSync(join(dest, "astro.config.mjs"), "utf-8"), /wasm-stub/);
		assert.match(readFileSync(join(dest, "astro.config.mjs"), "utf-8"), /process\.platform/);
		assert.ok(existsSync(join(dest, "public", "favicon.svg")), "a favicon.svg that is not the old default stays");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("upgrade of a remote knowledge base keeps the worker and removes the retired favicon", () => {
	const root = mkdtempSync(join(tmpdir(), "create-ragu-"));
	try {
		const { dest } = scaffold({ dir: join(root, "kb"), name: "kb", title: "KB", systems: [], remote: true, example: false });
		const configPath = join(dest, "ragu.config.json");
		const oldFavicon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><path fill-rule="evenodd" d="M81 36 64 0 47 36l-1 2-9-10a6 6 0 0 0-9 9l10 10h-2L0 64l36 17h2L28 91a6 6 0 1 0 9 9l9-10 1 2 17 36 17-36v-2l9 10a6 6 0 1 0 9-9l-9-9 2-1 36-17-36-17-2-1 9-9a6 6 0 1 0-9-9l-9 10v-2Zm-17 2-2 5c-4 8-11 15-19 19l-5 2 5 2c8 4 15 11 19 19l2 5 2-5c4-8 11-15 19-19l5-2-5-2c-8-4-15-11-19-19l-2-5Z" clip-rule="evenodd"/><path d="M118 19a6 6 0 0 0-9-9l-3 3a6 6 0 1 0 9 9l3-3Zm-96 4c-2 2-6 2-9 0l-3-3a6 6 0 1 1 9-9l3 3c3 2 3 6 0 9Zm0 82c-2-2-6-2-9 0l-3 3a6 6 0 1 0 9 9l3-3c3-2 3-6 0-9Zm96 4a6 6 0 0 1-9 9l-3-3a6 6 0 1 1 9-9l3 3Z"/><style>path{fill:#000}@media (prefers-color-scheme:dark){path{fill:#fff}}</style></svg>';
		writeFileSync(join(dest, "public", "favicon.svg"), oldFavicon);
		rmSync(join(dest, "src", "worker", "index.ts"));

		const o = outcomes(upgrade({ configPath }).files);
		assert.equal(o["public/favicon.svg"], "removed");
		assert.ok(!existsSync(join(dest, "public", "favicon.svg")));
		assert.equal(o["src/worker/index.ts"], "created");
		assert.match(readFileSync(join(dest, "astro.config.mjs"), "utf-8"), /wasm-stub/);
		assert.match(readFileSync(join(dest, "wrangler.jsonc"), "utf-8"), /"name": "kb"/, "wrangler.jsonc is the user's");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
