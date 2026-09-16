import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parsePorcelain, readSources, isCodeFile, staleDocs, codeChangesBySystem, docChanges } from "../hooks/lib/changes.mjs";
import { loadConfig, resolveSource, findConfigFile, findConfigFor, forWorkingTree, DEFAULT_HOOK } from "../hooks/lib/config.mjs";

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

// ---- Antigravity payload ------------------------------------------------------------------

function agyInput(cwd, conversationId = `c-${Date.now()}-${Math.random()}`, extra = {}) {
	return { conversationId, workspacePaths: [cwd], executionNum: 1, terminationReason: "model_stop", fullyIdle: true, ...extra };
}

test("adapt: detects Claude and Antigravity payloads", async () => {
	const { adapt } = await import("../hooks/enforce.mjs");
	const c = adapt({ cwd: "/x", session_id: "s", stop_hook_active: true });
	assert.equal(c.agent, "claude");
	assert.equal(c.alreadyContinued, true);
	assert.deepEqual(c.block("r"), { decision: "block", reason: "r" });
	assert.deepEqual(c.allow("m"), { systemMessage: "m" });
	const a = adapt({ conversationId: "c", workspacePaths: ["/y"] });
	assert.equal(a.agent, "antigravity");
	assert.equal(a.cwd, "/y");
	assert.equal(a.sessionId, "c");
	assert.deepEqual(a.block("r"), { decision: "continue", reason: "r" });
	assert.deepEqual(a.allow("m"), { decision: "allow", reason: "m" });
	assert.deepEqual(a.allow(), {});
});

test("hook (antigravity): code changed, docs not → continue once, then allow", () => {
	writeFileSync(join(ws.api, "src", "refund.ts"), "changed\n");
	const id = `c-${Date.now()}`;
	const first = runHook(agyInput(ws.api, id));
	assert.equal(first.decision, "continue");
	assert.match(first.reason, /domain\/refunds\.md/);
	const second = runHook(agyInput(ws.api, id));
	assert.equal(second.decision, "allow");
	assert.match(second.reason, /already issued/);
});

test("hook (antigravity): failing check → continue once per conversation, then allow", () => {
	writeFileSync(join(ws.api, "src", "refund.ts"), "changed\n");
	writeFileSync(join(ws.kb, "inbox", "QUESTIONS.md"), "# q\n");
	const id = `c-${Date.now()}`;
	const first = runHook(agyInput(ws.api, id), { RAGU_TEST_CHECK_FAIL: "1" });
	assert.equal(first.decision, "continue");
	assert.match(first.reason, /check\.mjs` failed/);
	const second = runHook(agyInput(ws.api, id), { RAGU_TEST_CHECK_FAIL: "1" });
	assert.equal(second.decision, "allow");
	assert.match(second.reason, /still fails/);
});

test("hook (antigravity): no changes → {}", () => {
	assert.deepEqual(runHook(agyInput(ws.api)), {});
});

// ---- monorepo: one git repo containing the kb and the systems ------------------------------

function makeMonorepo() {
	const root = mkdtempSync(join(tmpdir(), "ragu-mono-"));
	initRepo(root);
	const kb = join(root, "kb");
	const api = join(root, "apps", "api");
	mkdirSync(join(kb, "src", "content", "docs", "domain"), { recursive: true });
	mkdirSync(join(kb, "inbox"), { recursive: true });
	mkdirSync(join(kb, "scripts"), { recursive: true });
	writeFileSync(join(kb, "ragu.config.json"), JSON.stringify({ name: "kb", title: "KB", systems: [{ id: "api", path: "../apps/api" }] }));
	writeFileSync(
		join(kb, "src", "content", "docs", "domain", "refunds.md"),
		`---\ntitle: Refunds\nsystems: [api]\nstatus: verified\nsources:\n  - api/src/refund.ts:10\nupdated_at: 2026-01-01\n---\nbody\n`,
	);
	writeFileSync(join(kb, "scripts", "check.mjs"), `process.exit(0);\n`);
	mkdirSync(join(api, "src"), { recursive: true });
	writeFileSync(join(api, "src", "refund.ts"), "export const a = 1;\n");
	writeFileSync(join(root, "README.md"), "# mono\n");
	commitAll(root);
	return { root, kb, api };
}

test("monorepo: changes in a system subdirectory are detected relative to the system", () => {
	const m = makeMonorepo();
	try {
		const config = loadConfig(join(m.kb, "ragu.config.json"));
		writeFileSync(join(m.api, "src", "refund.ts"), "changed\n");
		writeFileSync(join(m.root, "README.md"), "changed outside any system\n");
		assert.deepEqual(codeChangesBySystem(config).map((c) => ({ id: c.systemId, files: c.files })), [{ id: "api", files: ["src/refund.ts"] }]);
		assert.deepEqual(docChanges(config), []);
		writeFileSync(join(m.kb, "inbox", "QUESTIONS.md"), "# q\n");
		assert.deepEqual(docChanges(config), ["inbox/QUESTIONS.md"]);
	} finally {
		rmSync(m.root, { recursive: true, force: true });
	}
});

test("monorepo: the repo root (workspace) is governed by the kb it contains", () => {
	const m = makeMonorepo();
	try {
		assert.equal(findConfigFor(m.root), join(m.kb, "ragu.config.json"));
		assert.equal(findConfigFor(join(m.api, "src")), join(m.kb, "ragu.config.json"));
		writeFileSync(join(m.api, "src", "refund.ts"), "changed\n");
		const out = runHook(agyInput(m.root));
		assert.equal(out.decision, "continue");
		assert.match(out.reason, /- api: src\/refund\.ts/);
		assert.match(out.reason, /domain\/refunds\.md \(sources: api\/src\/refund\.ts:10\)/);
	} finally {
		rmSync(m.root, { recursive: true, force: true });
	}
});

test("sibling layout: the workspace holding the kb and its systems is governed by that kb", () => {
	// ws.root holds kb/ and api/ as separate repos; ws.root itself is not a git repo
	assert.equal(findConfigFor(ws.root), join(ws.kb, "ragu.config.json"));
	writeFileSync(join(ws.api, "src", "refund.ts"), "changed\n");
	const out = runHook({ cwd: ws.root, session_id: "sib-1" });
	assert.equal(out.decision, "block");
	assert.match(out.reason, /- api: src\/refund\.ts/);
});

test("a directory that contains a kb whose systems live elsewhere is not governed by it", () => {
	const other = mkdtempSync(join(tmpdir(), "ragu-other-"));
	try {
		const kb = join(other, "kb");
		mkdirSync(kb, { recursive: true });
		// its only system is ws.api, outside `other`
		writeFileSync(join(kb, "ragu.config.json"), JSON.stringify({ name: "kb", systems: [{ id: "api", path: ws.api }] }));
		assert.equal(findConfigFor(other), null);
	} finally {
		rmSync(other, { recursive: true, force: true });
	}
});

/** Adds a linked worktree of `repo` at <repo>/.claude/worktrees/<name> (the Claude Code layout). */
function addWorktree(repo, name) {
	const dir = join(repo, ".claude", "worktrees", name);
	mkdirSync(dirname(dir), { recursive: true });
	git(repo, "worktree", "add", "-q", "-b", name, dir);
	return dir;
}

test("worktree: a linked worktree of a system is governed by the kb, even outside the system directory", () => {
	const inside = addWorktree(ws.api, "feat");
	assert.equal(findConfigFor(inside), join(ws.kb, "ragu.config.json"));
	const outside = join(ws.root, "api-wt");
	git(ws.api, "worktree", "add", "-q", "-b", "feat2", outside);
	assert.equal(findConfigFor(outside), join(ws.kb, "ragu.config.json"));
	assert.equal(findConfigFor(join(outside, "src")), join(ws.kb, "ragu.config.json"));
});

test("worktree: forWorkingTree points the system at the worktree being edited", () => {
	const wt = addWorktree(ws.api, "feat");
	const config = loadConfig(join(ws.kb, "ragu.config.json"));
	assert.equal(forWorkingTree(config, join(wt, "src")).systems[0].path, wt);
	// unrelated cwd (main tree, the kb, a foreign repo) leaves the paths alone
	assert.equal(forWorkingTree(config, ws.api).systems[0].path, ws.api);
	assert.equal(forWorkingTree(config, ws.kb).systems[0].path, ws.api);
	assert.equal(forWorkingTree(config, ws.root).systems[0].path, ws.api);
});

test("worktree: the hook sees changes made in the worktree, not in the main tree", () => {
	const wt = addWorktree(ws.api, "feat");
	writeFileSync(join(wt, "src", "refund.ts"), "changed in worktree\n");
	const out = runHook({ cwd: wt, session_id: "wt-1" });
	assert.equal(out.decision, "block");
	assert.match(out.reason, /- api: src\/refund\.ts/);
	assert.match(out.reason, /domain\/refunds\.md \(sources: api\/src\/refund\.ts:10\)/);
	// the main tree is clean: from there nothing is reported
	assert.deepEqual(runHook({ cwd: ws.api, session_id: "wt-2" }), {});
});

test("worktree: a config read from a linked worktree of the kb still resolves its systems", () => {
	const kbWt = addWorktree(ws.kb, "docs-feat");
	const config = loadConfig(join(kbWt, "ragu.config.json"));
	assert.equal(config.root, kbWt);
	assert.equal(config.systems[0].path, ws.api);
	writeFileSync(join(ws.api, "src", "refund.ts"), "changed\n");
	const out = runHook({ cwd: kbWt, session_id: "kbwt-1" });
	assert.equal(out.decision, "block");
	assert.match(out.reason, /- api: src\/refund\.ts/);
});
