import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { buildIndex, findConfigFile, findConfigFor, loadDocs, loadKnowledgeBases, registryFile, resolveConfigs, searchDocs } from "../src/index.ts";

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
	assert.equal(results[0]?.path, "domain/order-cancellation.md");
	assert.ok(results[0]?.content.includes("refund"));
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

test("findConfigFor finds a sibling knowledge base whose systems include cwd", () => {
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

test("several knowledge bases merge into one index with a kb field, and kb filters apply", () => {
	const root = mkdtempSync(join(tmpdir(), "ragu-mcp-multi-"));
	try {
		for (const name of ["shop", "bank"]) {
			mkdirSync(join(root, name, "src", "content", "docs", "domain"), { recursive: true });
			writeFileSync(join(root, name, "ragu.config.json"), JSON.stringify({ name, title: name, systems: [{ id: `${name}-api`, path: "../x" }] }));
			// the same path in both knowledge bases
			writeFileSync(join(root, name, "src", "content", "docs", "domain", "refunds.md"), `---\ntitle: Refunds (${name})\nsystems: [${name}-api]\nstatus: verified\n---\nrefund policy of ${name}\n`);
		}
		const single = loadKnowledgeBases([join(root, "shop", "ragu.config.json")]);
		assert.equal(single.names, undefined);
		assert.equal(single.docs[0]?.kb, undefined);

		const kb = loadKnowledgeBases([join(root, "shop", "ragu.config.json"), join(root, "bank", "ragu.config.json")]);
		assert.deepEqual(kb.names, ["shop", "bank"]);
		assert.deepEqual(kb.systems, ["shop-api", "bank-api"]);
		assert.deepEqual(kb.docs.map((d) => d.id), ["shop:domain/refunds.md", "bank:domain/refunds.md"]);
		const index = buildIndex(kb.docs);
		const all = searchDocs(kb, index, { query: "refund" });
		assert.deepEqual(all.map((r) => [r.kb, r.path]).sort(), [["bank", "domain/refunds.md"], ["shop", "domain/refunds.md"]]);
		const bank = searchDocs(kb, index, { query: "refund", kb: "bank" });
		assert.deepEqual(bank.map((r) => r.kb), ["bank"]);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("resolveConfigs: cwd, then $PWD, then the registry (dead entries skipped)", () => {
	const root = mkdtempSync(join(tmpdir(), "ragu-mcp-resolve-"));
	try {
		mkdirSync(join(root, "kb"));
		mkdirSync(join(root, "api"));
		mkdirSync(join(root, "elsewhere"));
		mkdirSync(join(root, "other-kb"));
		writeFileSync(join(root, "kb", "ragu.config.json"), JSON.stringify({ name: "kb", systems: [{ id: "api", path: "../api" }] }));
		writeFileSync(join(root, "other-kb", "ragu.config.json"), JSON.stringify({ name: "other", systems: [] }));
		const kbConfig = join(root, "kb", "ragu.config.json");
		const otherConfig = join(root, "other-kb", "ragu.config.json");
		const env = { XDG_CONFIG_HOME: join(root, "xdg") };

		// 1. cwd governed
		assert.deepEqual(resolveConfigs(join(root, "api"), { env }), [kbConfig]);
		// 2. cwd not governed, PWD is (a global plugin launching the server from its own directory)
		assert.deepEqual(resolveConfigs(join(root, "elsewhere"), { env: { ...env, PWD: join(root, "api") } }), [kbConfig]);
		// 3. nothing governs: no registry → nothing
		assert.deepEqual(resolveConfigs(join(root, "elsewhere"), { env }), []);
		// registry with one live and one dead entry
		const file = registryFile({ env });
		mkdirSync(join(root, "xdg", "ragu"), { recursive: true });
		writeFileSync(file, JSON.stringify({ knowledgeBases: [{ name: "kb", config: kbConfig }, { name: "gone", config: join(root, "gone", "ragu.config.json") }, { name: "other", config: otherConfig }] }));
		const warnings: string[] = [];
		assert.deepEqual(resolveConfigs(join(root, "elsewhere"), { env, log: (m) => warnings.push(m) }), [kbConfig, otherConfig]);
		assert.equal(warnings.length, 1);
		assert.match(warnings[0] ?? "", /gone/);
		// a governed cwd still wins over the registry
		assert.deepEqual(resolveConfigs(join(root, "api"), { env }), [kbConfig]);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
