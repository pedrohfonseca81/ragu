import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadDocs, buildIndex, searchDocs, findConfigFile } from "../src/index.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const configPath = join(here, "..", "..", "..", "template", "ragu.config.json");

test("findConfigFile walks upwards", () => {
	assert.equal(findConfigFile(join(here, "..", "..", "..", "template", "src", "content")), configPath);
	assert.equal(findConfigFile("/"), null);
});

test("loads the example docs and searches them", () => {
	const kb = loadDocs(configPath);
	assert.ok(kb.docs.length >= 8);
	assert.deepEqual(kb.systems, ["api", "web"]);
	const index = buildIndex(kb.docs);
	const results = searchDocs(kb, index, { query: "cancel order refund" });
	assert.equal(results[0].path, "domain/order-cancellation.md");
	assert.ok(results[0].content.includes("refund"));
});

test("filters by system, domain and status", () => {
	const kb = loadDocs(configPath);
	const index = buildIndex(kb.docs);
	const web = searchDocs(kb, index, { query: "checkout", systems: ["web"] });
	assert.ok(web.every((r) => r.systems.includes("web")));
	const payments = searchDocs(kb, index, { query: "gateway", domain: "payments" });
	assert.ok(payments.length > 0 && payments.every((r) => r.domain === "payments"));
	const none = searchDocs(kb, index, { query: "gateway", status: ["outdated"] });
	assert.equal(none.length, 0);
});

test("fuzzy matching tolerates typos", () => {
	const kb = loadDocs(configPath);
	const index = buildIndex(kb.docs);
	const results = searchDocs(kb, index, { query: "cancelation" });
	assert.ok(results.some((r) => r.path === "domain/order-cancellation.md"));
});

test("findConfigFor finds a sibling knowledge base whose systems include cwd", async () => {
	const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import("node:fs");
	const { tmpdir } = await import("node:os");
	const { findConfigFor } = await import("../src/index.mjs");
	const root = mkdtempSync(join(tmpdir(), "ragu-mcp-"));
	try {
		mkdirSync(join(root, "kb"));
		mkdirSync(join(root, "api", "src"), { recursive: true });
		mkdirSync(join(root, "other"));
		writeFileSync(join(root, "kb", "ragu.config.json"), JSON.stringify({ name: "kb", systems: [{ id: "api", path: "../api" }] }));
		assert.equal(findConfigFor(join(root, "api", "src")), join(root, "kb", "ragu.config.json"));
		assert.equal(findConfigFor(join(root, "kb", "src")), join(root, "kb", "ragu.config.json"));
		assert.equal(findConfigFor(join(root, "other")), null);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
