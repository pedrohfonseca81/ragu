import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { install, upsertBlock, agentsBlock, compareVersions, installAntigravityPlugin, registerKnowledgeBase, registryFile, antigravityPluginDir, BLOCK_START, BLOCK_END } from "../src/install.mjs";
import { scaffold } from "../src/scaffold.mjs";

function git(cwd, ...args) {
	const r = spawnSync("git", args, { cwd, encoding: "utf-8" });
	if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
}

function initRepo(dir) {
	mkdirSync(dir, { recursive: true });
	git(dir, "init", "-q");
}

function writeKb(kb, systems) {
	mkdirSync(join(kb, "src", "content", "docs"), { recursive: true });
	writeFileSync(join(kb, "ragu.config.json"), JSON.stringify({ name: "acme-kb", title: "Acme", systems }));
	writeFileSync(join(kb, "AGENTS.md"), "# KB rules\n");
}

/** <tmp>/kb + <tmp>/api + <tmp>/web, each its own git repo. */
function siblings() {
	const root = mkdtempSync(join(tmpdir(), "ragu-install-"));
	const kb = join(root, "kb");
	const api = join(root, "api");
	const web = join(root, "web");
	initRepo(kb);
	initRepo(api);
	initRepo(web);
	writeKb(kb, [{ id: "api", path: "../api" }, { id: "web", path: "../web" }]);
	const home = join(root, "home");
	mkdirSync(join(home, ".gemini"), { recursive: true });
	const env = { XDG_CONFIG_HOME: join(home, ".config") };
	return { root, kb, api, web, home, env, configPath: join(kb, "ragu.config.json") };
}

test("compareVersions", () => {
	assert.equal(compareVersions("0.2.0", "0.1.9"), 1);
	assert.equal(compareVersions("0.1.0", "0.1.0"), 0);
	assert.equal(compareVersions("0.1", "0.1.1"), -1);
});

test("upsertBlock creates, appends, and replaces in place", () => {
	const b1 = `${BLOCK_START}\none\n${BLOCK_END}`;
	const b2 = `${BLOCK_START}\ntwo\n${BLOCK_END}`;
	assert.equal(upsertBlock(null, b1), `${b1}\n`);
	assert.equal(upsertBlock("# Mine\n", b1), `# Mine\n\n${b1}\n`);
	assert.equal(upsertBlock("# Mine", b1), `# Mine\n\n${b1}\n`);
	const withBlock = `# Mine\n\n${b1}\n\n## After\n`;
	assert.equal(upsertBlock(withBlock, b2), `# Mine\n\n${b2}\n\n## After\n`);
	assert.equal(upsertBlock(withBlock, b1), withBlock);
});

test("agentsBlock mentions the kb path, the mcp name and every system id", () => {
	const b = agentsBlock({ kbRel: "../kb", kbName: "acme-kb", systemIds: ["api", "worker"] });
	assert.match(b, /`\.\.\/kb\/`/);
	assert.match(b, /`acme-kb`/);
	assert.match(b, /`ragu_kb`/);
	assert.match(b, /`api`, `worker`/);
	assert.match(b, /\.\.\/kb\/AGENTS\.md/);
});

test("install connects sibling repos and the kb itself, idempotently", async () => {
	const ws = siblings();
	try {
		writeFileSync(join(ws.api, "AGENTS.md"), "# API\n\nExisting rules.\n");
		writeFileSync(join(ws.api, "CLAUDE.md"), "# Claude notes\n");
		writeFileSync(join(ws.api, ".mcp.json"), JSON.stringify({ mcpServers: { other: { command: "x" } } }));

		const r1 = await install({ configPath: ws.configPath, home: ws.home, env: ws.env });
		assert.deepEqual(r1.targets.map((t) => t.ids), [["api"], ["web"]]);
		const api = r1.targets[0];
		assert.equal(api.root, ws.api);
		assert.equal(api.agents, "updated");
		assert.equal(api.claude, "updated");
		assert.equal(api.mcp, "created");
		assert.equal(r1.registry, "registered");
		assert.equal(r1.antigravity, "installed");
		const web = r1.targets[1];
		assert.equal(web.agents, "created");
		assert.equal(web.claude, "created");

		const agents = readFileSync(join(ws.api, "AGENTS.md"), "utf-8");
		assert.match(agents, /^# API\n\nExisting rules\.\n\n<!-- ragu:start -->/);
		assert.match(agents, /system `api`/);
		assert.match(agents, /`\.\.\/kb\/`/);
		assert.equal(readFileSync(join(ws.api, "CLAUDE.md"), "utf-8"), "@AGENTS.md\n\n# Claude notes\n");
		assert.equal(readFileSync(join(ws.web, "CLAUDE.md"), "utf-8"), "@AGENTS.md\n");
		const mcp = JSON.parse(readFileSync(join(ws.api, ".mcp.json"), "utf-8"));
		assert.deepEqual(Object.keys(mcp.mcpServers), ["other", "acme-kb"]);
		assert.deepEqual(mcp.mcpServers["acme-kb"], { command: "npx", args: ["-y", "ragu-mcp"] });
		// nothing harness-specific lands in the repositories
		for (const repo of [ws.api, ws.web, ws.kb]) assert.ok(!existsSync(join(repo, ".agents")), `${repo}/.agents must not exist`);

		// the kb: .mcp.json, no AGENTS.md block
		assert.equal(r1.kb.mcp, "created");
		assert.equal(readFileSync(join(ws.kb, "AGENTS.md"), "utf-8"), "# KB rules\n");

		// per user: registry entry + Antigravity plugin (home has ~/.gemini)
		const reg = JSON.parse(readFileSync(registryFile({ home: ws.home, env: ws.env }), "utf-8"));
		assert.deepEqual(reg, { knowledgeBases: [{ name: "acme-kb", config: ws.configPath }] });
		const plugin = antigravityPluginDir(ws.home);
		assert.equal(plugin, join(ws.home, ".gemini", "config", "plugins", "ragu"));
		assert.ok(existsSync(join(plugin, "hooks.json")));
		assert.ok(existsSync(join(plugin, "hooks", "enforce.mjs")));
		assert.ok(existsSync(join(plugin, "skills", "ragu-sync", "SKILL.md")));
		assert.ok(!existsSync(join(plugin, "test")));
		assert.deepEqual(JSON.parse(readFileSync(join(plugin, "mcp_config.json"), "utf-8")), { mcpServers: { kb: { command: "npx", args: ["-y", "ragu-mcp"] } } });
		assert.ok(!existsSync(join(ws.home, ".gemini", "config", "plugins.json")));

		// second run: nothing changes
		const r2 = await install({ configPath: ws.configPath, home: ws.home, env: ws.env });
		assert.deepEqual(r2.targets.map((t) => [t.agents, t.claude, t.mcp]), [["kept", "kept", "kept"], ["kept", "kept", "kept"]]);
		assert.equal(r2.registry, "kept");
		assert.equal(r2.antigravity, "kept");
		assert.equal(readFileSync(join(ws.api, "AGENTS.md"), "utf-8"), agents);

		// selecting one system only touches that one
		const r3 = await install({ configPath: ws.configPath, systemIds: ["web"], home: ws.home, env: ws.env });
		assert.deepEqual(r3.targets.map((t) => t.ids), [["web"]]);
		await assert.rejects(install({ configPath: ws.configPath, systemIds: ["nope"], home: ws.home, env: ws.env }), /unknown system/);
	} finally {
		rmSync(ws.root, { recursive: true, force: true });
	}
});

test("the Antigravity plugin is upgraded only when the source is newer, or with --force; skipped without ~/.gemini", async () => {
	const ws = siblings();
	try {
		const plugin = antigravityPluginDir(ws.home);
		const pluginJson = join(plugin, "plugin.json");
		const hook = join(plugin, "hooks", "enforce.mjs");
		assert.equal(installAntigravityPlugin({ home: ws.home }), "installed");
		writeFileSync(hook, "// locally modified\n");

		// installed version bumped above the source → kept
		writeFileSync(pluginJson, JSON.stringify({ name: "ragu", version: "99.0.0" }));
		assert.equal(installAntigravityPlugin({ home: ws.home }), "kept");
		assert.equal(readFileSync(hook, "utf-8"), "// locally modified\n");

		// older installed version → updated
		writeFileSync(pluginJson, JSON.stringify({ name: "ragu", version: "0.0.1" }));
		assert.equal(installAntigravityPlugin({ home: ws.home }), "updated");
		assert.match(readFileSync(hook, "utf-8"), /Ragu Stop hook/);

		writeFileSync(hook, "// locally modified\n");
		assert.equal(installAntigravityPlugin({ home: ws.home, force: true }), "updated");
		assert.match(readFileSync(hook, "utf-8"), /Ragu Stop hook/);

		// no Antigravity on this machine: nothing is written
		const bare = join(ws.root, "bare-home");
		mkdirSync(bare);
		const r = await install({ configPath: ws.configPath, systemIds: ["api"], home: bare, env: ws.env });
		assert.equal(r.antigravity, "skipped");
		assert.ok(!existsSync(join(bare, ".gemini")));
	} finally {
		rmSync(ws.root, { recursive: true, force: true });
	}
});

test("install in a monorepo writes once at the git root and lists every system", async () => {
	const root = mkdtempSync(join(tmpdir(), "ragu-install-mono-"));
	try {
		initRepo(root);
		const kb = join(root, "knowledge-base");
		mkdirSync(join(root, "apps", "api"), { recursive: true });
		mkdirSync(join(root, "apps", "web"), { recursive: true });
		writeKb(kb, [{ id: "api", path: "../apps/api" }, { id: "web", path: "../apps/web" }]);
		const home = join(root, "home");
		mkdirSync(home);
		const r = await install({ configPath: join(kb, "ragu.config.json"), home, env: { XDG_CONFIG_HOME: join(home, ".config") } });
		assert.equal(r.targets.length, 1);
		assert.equal(r.targets[0].root, root);
		assert.deepEqual(r.targets[0].ids, ["api", "web"]);
		const agents = readFileSync(join(root, "AGENTS.md"), "utf-8");
		assert.match(agents, /system `api`, `web`/);
		assert.match(agents, /`knowledge-base\/`/);
		assert.ok(!existsSync(join(root, ".agents")));
		assert.ok(!existsSync(join(root, "apps", "api", "AGENTS.md")));
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("install reports missing system paths instead of failing", async () => {
	const ws = siblings();
	try {
		writeFileSync(ws.configPath, JSON.stringify({ name: "acme-kb", systems: [{ id: "api", path: "../api" }, { id: "gone", path: "../gone" }] }));
		const r = await install({ configPath: ws.configPath, home: ws.home, env: ws.env });
		assert.equal(r.targets[0].agents, "created");
		assert.match(r.targets[1].error, /path not found/);
	} finally {
		rmSync(ws.root, { recursive: true, force: true });
	}
});

test("registerKnowledgeBase: XDG or ~/.config, dedupes by config path, renames, prunes dead entries", () => {
	const root = mkdtempSync(join(tmpdir(), "ragu-reg-"));
	try {
		const home = join(root, "home");
		mkdirSync(home);
		assert.equal(registryFile({ home, env: {} }), join(home, ".config", "ragu", "knowledge-bases.json"));
		assert.equal(registryFile({ home, env: { XDG_CONFIG_HOME: join(root, "xdg") } }), join(root, "xdg", "ragu", "knowledge-bases.json"));

		const a = join(root, "a", "ragu.config.json");
		const b = join(root, "b", "ragu.config.json");
		mkdirSync(join(root, "a"));
		mkdirSync(join(root, "b"));
		writeFileSync(a, "{}");
		writeFileSync(b, "{}");
		const file = join(home, ".config", "ragu", "knowledge-bases.json");
		const read = () => JSON.parse(readFileSync(file, "utf-8")).knowledgeBases;

		assert.equal(registerKnowledgeBase(a, "a", { home, env: {} }), "registered");
		assert.equal(registerKnowledgeBase(a, "a", { home, env: {} }), "kept");
		assert.equal(registerKnowledgeBase(join(root, "a", "..", "a", "ragu.config.json"), "a", { home, env: {} }), "kept");
		assert.equal(registerKnowledgeBase(b, "b", { home, env: {} }), "registered");
		assert.deepEqual(read(), [{ name: "a", config: a }, { name: "b", config: b }]);
		assert.equal(registerKnowledgeBase(a, "a-renamed", { home, env: {} }), "updated");
		assert.equal(read()[0].name, "a-renamed");

		// b disappears: pruned on the next write, even one that changes nothing else
		rmSync(join(root, "b"), { recursive: true });
		assert.equal(registerKnowledgeBase(a, "a-renamed", { home, env: {} }), "kept");
		assert.deepEqual(read(), [{ name: "a-renamed", config: a }]);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("scaffold ships .mcp.json inside the knowledge base and no harness-specific files", () => {
	const root = mkdtempSync(join(tmpdir(), "create-ragu-"));
	try {
		const { dest } = scaffold({ dir: join(root, "kb"), name: "my-kb", title: "My KB", systems: [], remote: false, example: true });
		assert.ok(!existsSync(join(dest, ".agents")));
		assert.deepEqual(JSON.parse(readFileSync(join(dest, ".mcp.json"), "utf-8")).mcpServers["my-kb"], { command: "npx", args: ["-y", "ragu-mcp"] });
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
