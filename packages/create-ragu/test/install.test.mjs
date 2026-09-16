import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { install, upsertBlock, agentsBlock, compareVersions, registerAntigravity, BLOCK_START, BLOCK_END } from "../src/install.mjs";
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
	return { root, kb, api, web, home, configPath: join(kb, "ragu.config.json") };
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
	assert.match(b, /`api`, `worker`/);
	assert.match(b, /\.\.\/kb\/AGENTS\.md/);
});

test("install connects sibling repos and the kb itself, idempotently", async () => {
	const ws = siblings();
	try {
		writeFileSync(join(ws.api, "AGENTS.md"), "# API\n\nExisting rules.\n");
		writeFileSync(join(ws.api, "CLAUDE.md"), "# Claude notes\n");
		writeFileSync(join(ws.api, ".mcp.json"), JSON.stringify({ mcpServers: { other: { command: "x" } } }));

		const r1 = await install({ configPath: ws.configPath, home: ws.home });
		assert.deepEqual(r1.targets.map((t) => t.ids), [["api"], ["web"]]);
		const api = r1.targets[0];
		assert.equal(api.root, ws.api);
		assert.equal(api.agents, "updated");
		assert.equal(api.claude, "updated");
		assert.equal(api.mcp, "created");
		assert.equal(api.plugin, "installed");
		assert.equal(api.antigravity, "registered");
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
		assert.ok(existsSync(join(ws.api, ".agents", "plugins", "ragu", "hooks.json")));
		assert.ok(existsSync(join(ws.api, ".agents", "plugins", "ragu", "hooks", "enforce.mjs")));
		assert.ok(existsSync(join(ws.api, ".agents", "plugins", "ragu", "skills", "ragu-sync", "SKILL.md")));
		assert.ok(!existsSync(join(ws.api, ".agents", "plugins", "ragu", "test")));
		const mcpCfg = JSON.parse(readFileSync(join(ws.api, ".agents", "plugins", "ragu", "mcp_config.json"), "utf-8"));
		assert.deepEqual(mcpCfg, { mcpServers: { "acme-kb": { command: "npx", args: ["-y", "ragu-mcp"] } } });

		// the kb: plugin + .mcp.json, no AGENTS.md block
		assert.equal(r1.kb.plugin, "installed");
		assert.equal(r1.kb.mcp, "created");
		assert.ok(existsSync(join(ws.kb, ".agents", "plugins", "ragu", "plugin.json")));
		assert.equal(readFileSync(join(ws.kb, "AGENTS.md"), "utf-8"), "# KB rules\n");

		const reg = JSON.parse(readFileSync(join(ws.home, ".gemini", "config", "plugins.json"), "utf-8"));
		assert.deepEqual(
			reg.entries.map((e) => e.path),
			[join(ws.api, ".agents", "plugins"), join(ws.web, ".agents", "plugins"), join(ws.kb, ".agents", "plugins")],
		);

		// second run: nothing changes
		const r2 = await install({ configPath: ws.configPath, home: ws.home });
		assert.deepEqual(
			r2.targets.map((t) => [t.agents, t.claude, t.mcp, t.plugin, t.antigravity]),
			[["kept", "kept", "kept", "kept", "kept"], ["kept", "kept", "kept", "kept", "kept"]],
		);
		assert.equal(readFileSync(join(ws.api, "AGENTS.md"), "utf-8"), agents);
		assert.equal(JSON.parse(readFileSync(join(ws.home, ".gemini", "config", "plugins.json"), "utf-8")).entries.length, 3);

		// selecting one system only touches that one
		const r3 = await install({ configPath: ws.configPath, systemIds: ["web"], home: ws.home });
		assert.deepEqual(r3.targets.map((t) => t.ids), [["web"]]);
		await assert.rejects(install({ configPath: ws.configPath, systemIds: ["nope"], home: ws.home }), /unknown system/);
	} finally {
		rmSync(ws.root, { recursive: true, force: true });
	}
});

test("install upgrades the plugin only when the source is newer, or with --force", async () => {
	const ws = siblings();
	try {
		await install({ configPath: ws.configPath, systemIds: ["api"], register: false });
		const pluginJson = join(ws.api, ".agents", "plugins", "ragu", "plugin.json");
		const hook = join(ws.api, ".agents", "plugins", "ragu", "hooks", "enforce.mjs");
		writeFileSync(hook, "// locally modified\n");

		// installed version bumped above the source → kept
		writeFileSync(pluginJson, JSON.stringify({ name: "ragu", version: "99.0.0" }));
		let r = await install({ configPath: ws.configPath, systemIds: ["api"], register: false });
		assert.equal(r.targets[0].plugin, "kept");
		assert.equal(readFileSync(hook, "utf-8"), "// locally modified\n");

		// older installed version → updated
		writeFileSync(pluginJson, JSON.stringify({ name: "ragu", version: "0.0.1" }));
		r = await install({ configPath: ws.configPath, systemIds: ["api"], register: false });
		assert.equal(r.targets[0].plugin, "updated");
		assert.match(readFileSync(hook, "utf-8"), /Ragu Stop hook/);

		writeFileSync(hook, "// locally modified\n");
		r = await install({ configPath: ws.configPath, systemIds: ["api"], register: false, force: true });
		assert.equal(r.targets[0].plugin, "updated");
		assert.match(readFileSync(hook, "utf-8"), /Ragu Stop hook/);
		assert.equal(r.targets[0].antigravity, "skipped");
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
		const r = await install({ configPath: join(kb, "ragu.config.json"), register: false });
		assert.equal(r.targets.length, 1);
		assert.equal(r.targets[0].root, root);
		assert.deepEqual(r.targets[0].ids, ["api", "web"]);
		const agents = readFileSync(join(root, "AGENTS.md"), "utf-8");
		assert.match(agents, /system `api`, `web`/);
		assert.match(agents, /`knowledge-base\/`/);
		assert.ok(existsSync(join(root, ".agents", "plugins", "ragu", "hooks.json")));
		assert.ok(!existsSync(join(root, "apps", "api", "AGENTS.md")));
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("install reports missing system paths instead of failing", async () => {
	const ws = siblings();
	try {
		writeFileSync(ws.configPath, JSON.stringify({ name: "acme-kb", systems: [{ id: "api", path: "../api" }, { id: "gone", path: "../gone" }] }));
		const r = await install({ configPath: ws.configPath, register: false });
		assert.equal(r.targets[0].agents, "created");
		assert.match(r.targets[1].error, /path not found/);
	} finally {
		rmSync(ws.root, { recursive: true, force: true });
	}
});

test("registerAntigravity is skipped without ~/.gemini and dedupes entries", () => {
	const root = mkdtempSync(join(tmpdir(), "ragu-reg-"));
	try {
		const home = join(root, "home");
		mkdirSync(home);
		assert.equal(registerAntigravity(join(root, "api"), { home }), "skipped");
		mkdirSync(join(home, ".gemini", "config"), { recursive: true });
		writeFileSync(join(home, ".gemini", "config", "plugins.json"), JSON.stringify({ entries: [{ path: "~/other/.agents/plugins" }] }));
		assert.equal(registerAntigravity(join(root, "api"), { home }), "registered");
		assert.equal(registerAntigravity(join(root, "api"), { home }), "kept");
		const reg = JSON.parse(readFileSync(join(home, ".gemini", "config", "plugins.json"), "utf-8"));
		assert.deepEqual(reg.entries.map((e) => e.path), ["~/other/.agents/plugins", join(root, "api", ".agents", "plugins")]);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("scaffold ships the plugin and .mcp.json inside the knowledge base", () => {
	const root = mkdtempSync(join(tmpdir(), "create-ragu-"));
	try {
		const { dest } = scaffold({ dir: join(root, "kb"), name: "my-kb", title: "My KB", systems: [], remote: false, example: true });
		assert.ok(existsSync(join(dest, ".agents", "plugins", "ragu", "hooks.json")));
		assert.deepEqual(JSON.parse(readFileSync(join(dest, ".agents", "plugins", "ragu", "mcp_config.json"), "utf-8")), {
			mcpServers: { "my-kb": { command: "npx", args: ["-y", "ragu-mcp"] } },
		});
		assert.deepEqual(JSON.parse(readFileSync(join(dest, ".mcp.json"), "utf-8")).mcpServers["my-kb"], { command: "npx", args: ["-y", "ragu-mcp"] });
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
