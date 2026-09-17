import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSystems, scaffold, slugify } from "../src/index.ts";

test("slugify and parseSystems", () => {
	assert.equal(slugify("Acme Knowledge Base"), "acme-knowledge-base");
	assert.equal(slugify("Ação!"), "acao");
	assert.deepEqual(parseSystems("api:../api, web:../web"), [
		{ id: "api", path: "../api" },
		{ id: "web", path: "../web" },
	]);
	assert.deepEqual(parseSystems("backend"), [{ id: "backend", path: "../backend" }]);
	assert.deepEqual(parseSystems(""), []);
});

test("scaffold with remote + example", () => {
	const root = mkdtempSync(join(tmpdir(), "create-ragu-"));
	try {
		const { dest, notes } = scaffold({ dir: join(root, "kb"), name: "my-kb", title: "My KB", systems: [], remote: true, example: true });
		assert.deepEqual(notes, []);
		const config = JSON.parse(readFileSync(join(dest, "ragu.config.json"), "utf-8")) as { name: string; remote: { vectorizeIndex: string }; systems: unknown };
		assert.equal(config.name, "my-kb");
		assert.equal(config.remote.vectorizeIndex, "my-kb-docs");
		assert.deepEqual(config.systems, [{ id: "api", path: "../api" }, { id: "web", path: "../web" }]);
		assert.ok(existsSync(join(dest, "src", "worker", "index.ts")));
		assert.ok(existsSync(join(dest, ".gitignore")));
		assert.ok(!existsSync(join(dest, "node_modules")));
		assert.match(readFileSync(join(dest, "wrangler.jsonc"), "utf-8"), /"name": "my-kb"/);
		assert.ok(existsSync(join(dest, "src", "content", "docs", "domain", "order-cancellation.md")));
		assert.match(readFileSync(join(dest, "README.md"), "utf-8"), /Remote MCP \(Cloudflare\)/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("scaffold without remote and without example", () => {
	const root = mkdtempSync(join(tmpdir(), "create-ragu-"));
	try {
		const { dest } = scaffold({ dir: join(root, "kb"), name: "local-kb", title: "Local", systems: [], remote: false, example: false });
		const config = JSON.parse(readFileSync(join(dest, "ragu.config.json"), "utf-8")) as { remote?: unknown };
		assert.equal(config.remote, undefined);
		const pkg = JSON.parse(readFileSync(join(dest, "package.json"), "utf-8")) as { dependencies: Record<string, string>; devDependencies: Record<string, string>; scripts: Record<string, string> };
		assert.equal(pkg.dependencies.agents, undefined);
		assert.equal(pkg.devDependencies.wrangler, undefined);
		assert.equal(pkg.scripts.deploy, undefined);
		assert.ok(!existsSync(join(dest, "src", "worker")));
		assert.ok(!existsSync(join(dest, "wrangler.jsonc")));
		assert.ok(!existsSync(join(dest, ".github", "workflows", "reindex.yml")));
		assert.ok(existsSync(join(dest, ".github", "workflows", "ci.yml")));
		assert.ok(!existsSync(join(dest, "src", "content", "docs", "domain", "order-cancellation.md")));
		assert.ok(existsSync(join(dest, "src", "content", "docs", "domain", ".gitkeep")));
		assert.ok(existsSync(join(dest, "src", "content", "docs", "index.md")));
		assert.doesNotMatch(readFileSync(join(dest, "astro.config.mjs"), "utf-8"), /wasm-stub/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("real systems + example → example dropped with a note", () => {
	const root = mkdtempSync(join(tmpdir(), "create-ragu-"));
	try {
		const r = scaffold({ dir: join(root, "kb"), name: "x", title: "x", systems: [{ id: "svc", path: "../svc" }], remote: false, example: true });
		assert.equal(r.example, false);
		assert.equal(r.notes.length, 1);
		const config = JSON.parse(readFileSync(join(r.dest, "ragu.config.json"), "utf-8"));
		assert.deepEqual(config.systems, [{ id: "svc", path: "../svc" }]);
		assert.ok(!existsSync(join(r.dest, "src", "content", "docs", "domain", "order-cancellation.md")));
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("refuses a non-empty directory", () => {
	const root = mkdtempSync(join(tmpdir(), "create-ragu-"));
	try {
		writeFileSync(join(root, "keep.txt"), "");
		assert.throws(() => scaffold({ dir: root, name: "x", title: "x", systems: [], remote: false, example: true }), /not empty/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
