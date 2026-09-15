import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parsePorcelain, readSources, isCodeFile, staleDocs, codeChangesBySystem, docChanges } from "../hooks/lib/changes.mjs";
import { loadConfig, resolveSource, findConfigFile, findConfigFor, DEFAULT_HOOK } from "../hooks/lib/config.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const HOOK = join(here, "..", "hooks", "enforce.mjs");

function git(cwd, ...args) {
	const r = spawnSync("git", args, { cwd, encoding: "utf-8" });
	if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
	return r.stdout;
}

function initRepo(dir) {
	mkdirSync(dir, { recursive: true });
	git(dir, "init", "-q");
	git(dir, "config", "user.email", "t@t");
	git(dir, "config", "user.name", "t");
	git(dir, "config", "commit.gpgsign", "false");
}

function commitAll(dir) {
	git(dir, "add", "-A");
	git(dir, "commit", "-q", "-m", "init", "--allow-empty");
}

/** Builds  <tmp>/kb (with ragu.config.json + docs) and <tmp>/api (a code repo). */
function makeWorkspace() {
	const root = mkdtempSync(join(tmpdir(), "ragu-test-"));
	const kb = join(root, "kb");
	const api = join(root, "api");
	initRepo(kb);
	initRepo(api);
	mkdirSync(join(kb, "src", "content", "docs", "domain"), { recursive: true });
	mkdirSync(join(kb, "inbox"), { recursive: true });
	mkdirSync(join(kb, "scripts"), { recursive: true });
	writeFileSync(
		join(kb, "ragu.config.json"),
		JSON.stringify({ name: "kb", title: "KB", systems: [{ id: "api", path: "../api" }] }),
	);
	writeFileSync(
		join(kb, "src", "content", "docs", "domain", "refunds.md"),
		`---\ntitle: Refunds\nsystems: [api]\nstatus: verified\nsources:\n  - api/src/refund.ts:10\n  - api/src/other.ts\nupdated_at: 2026-01-01\n---\nbody\n`,
	);
	writeFileSync(join(kb, "scripts", "check.mjs"), `process.exit(process.env.RAGU_TEST_CHECK_FAIL ? 1 : 0);\n`);
	mkdirSync(join(api, "src"), { recursive: true });
	writeFileSync(join(api, "src", "refund.ts"), "export const a = 1;\n");
	writeFileSync(join(api, "src", "unrelated.ts"), "export const b = 1;\n");
	commitAll(kb);
	commitAll(api);
	return { root, kb, api };
}

function runHook(input, env = {}) {
	const r = spawnSync(process.execPath, [HOOK], {
		input: JSON.stringify(input),
		encoding: "utf-8",
		env: { ...process.env, ...env },
	});
	assert.equal(r.status, 0, r.stderr);
	return JSON.parse(r.stdout || "{}");
}

let ws;
beforeEach(() => {
	ws = makeWorkspace();
});
afterEach(() => {
	rmSync(ws.root, { recursive: true, force: true });
});

test("parsePorcelain handles modified, untracked and renamed entries", () => {
	const out = parsePorcelain(' M src/a.ts\n?? src/b.ts\nR  src/old.ts -> src/new.ts\n A "src/we ird.ts"\n');
	assert.deepEqual(out, ["src/a.ts", "src/b.ts", "src/new.ts", "src/we ird.ts"]);
});

test("isCodeFile respects extensions and ignored segments", () => {
	assert.equal(isCodeFile("src/a.ts", DEFAULT_HOOK), true);
	assert.equal(isCodeFile("node_modules/x/a.ts", DEFAULT_HOOK), false);
	assert.equal(isCodeFile("README.md", DEFAULT_HOOK), false);
	assert.equal(isCodeFile("lib/App.EX", DEFAULT_HOOK), true);
});

test("readSources parses block and inline lists", () => {
	assert.deepEqual(readSources(`---\ntitle: x\nsources:\n  - api/a.ts:1\n  - "api/b.ts"\nupdated_at: 2026-01-01\n---\n`), ["api/a.ts:1", "api/b.ts"]);
	assert.deepEqual(readSources(`---\nsources: [api/a.ts, api/b.ts:3]\n---\n`), ["api/a.ts", "api/b.ts:3"]);
	assert.deepEqual(readSources(`---\nsources: []\n---\n`), []);
	assert.deepEqual(readSources(`no frontmatter`), []);
});

test("resolveSource maps system ids to configured paths", () => {
	const config = loadConfig(join(ws.kb, "ragu.config.json"));
	const r = resolveSource("api/src/refund.ts:10", config);
	assert.equal(r.systemId, "api");
	assert.equal(r.relPath, "src/refund.ts");
	assert.equal(r.line, 10);
	assert.equal(r.absPath, join(ws.api, "src", "refund.ts"));
	assert.equal(resolveSource("nope/x.ts", config), null);
	assert.equal(resolveSource("garbage", config), null);
});

test("findConfigFile walks up; findConfigFor also finds a sibling KB that governs cwd", () => {
	assert.equal(findConfigFile(join(ws.kb, "src", "content")), join(ws.kb, "ragu.config.json"));
	assert.equal(findConfigFile(ws.api), null);
	assert.equal(findConfigFor(join(ws.api, "src")), join(ws.kb, "ragu.config.json"));
	// a sibling directory that is NOT a configured system is not governed by the kb
	mkdirSync(join(ws.root, "other"));
	assert.equal(findConfigFor(join(ws.root, "other")), null);
});

test("staleDocs maps changed files back to citing docs", () => {
	const config = loadConfig(join(ws.kb, "ragu.config.json"));
	writeFileSync(join(ws.api, "src", "refund.ts"), "changed\n");
	const changes = codeChangesBySystem(config);
	assert.deepEqual(changes.map((c) => ({ id: c.systemId, files: c.files })), [{ id: "api", files: ["src/refund.ts"] }]);
	const stale = staleDocs(config, changes, (dir) => [join(dir, "domain", "refunds.md")]);
	assert.deepEqual(stale, [{ doc: "domain/refunds.md", hits: ["api/src/refund.ts:10"] }]);
	assert.deepEqual(docChanges(config), []);
});

test("hook: no code changes → allows", () => {
	const out = runHook({ session_id: "s1", cwd: ws.api });
	assert.deepEqual(out, {});
});

test("hook: outside a ragu workspace → allows", () => {
	const out = runHook({ session_id: "s1", cwd: tmpdir() });
	assert.deepEqual(out, {});
});

test("hook: code changed, docs not → blocks once with stale list, then allows", () => {
	writeFileSync(join(ws.api, "src", "refund.ts"), "changed\n");
	const session = `s-${Date.now()}`;
	const first = runHook({ session_id: session, cwd: ws.api });
	assert.equal(first.decision, "block");
	assert.match(first.reason, /domain\/refunds\.md \(sources: api\/src\/refund\.ts:10\)/);
	assert.match(first.reason, /- api: src\/refund\.ts/);
	const second = runHook({ session_id: session, cwd: ws.api });
	assert.equal(second.decision, undefined);
	assert.match(second.systemMessage, /already issued/);
});

test("hook: stop_hook_active short-circuits", () => {
	writeFileSync(join(ws.api, "src", "refund.ts"), "changed\n");
	const out = runHook({ session_id: `s-${Date.now()}`, cwd: ws.api, stop_hook_active: true });
	assert.deepEqual(out, {});
});

test("hook: unrelated code change → blocks with 'none' stale list", () => {
	writeFileSync(join(ws.api, "src", "unrelated.ts"), "changed\n");
	const out = runHook({ session_id: `s-${Date.now()}`, cwd: ws.kb });
	assert.equal(out.decision, "block");
	assert.match(out.reason, /none: no document cites/);
});

test("hook: code and docs changed → runs check and allows when it passes", () => {
	writeFileSync(join(ws.api, "src", "refund.ts"), "changed\n");
	writeFileSync(join(ws.kb, "src", "content", "docs", "domain", "refunds.md"), readFileSync(join(ws.kb, "src", "content", "docs", "domain", "refunds.md"), "utf-8") + "\nmore\n");
	const out = runHook({ session_id: `s-${Date.now()}`, cwd: ws.api });
	assert.equal(out.decision, undefined);
	assert.match(out.systemMessage, /validated/);
});

test("hook: code and docs changed → blocks when check fails", () => {
	writeFileSync(join(ws.api, "src", "refund.ts"), "changed\n");
	writeFileSync(join(ws.kb, "inbox", "QUESTIONS.md"), "# q\n");
	const out = runHook({ session_id: `s-${Date.now()}`, cwd: ws.api }, { RAGU_TEST_CHECK_FAIL: "1" });
	assert.equal(out.decision, "block");
	assert.match(out.reason, /check\.mjs` failed/);
});
