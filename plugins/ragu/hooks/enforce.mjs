#!/usr/bin/env node
// Ragu Stop hook. Works as a Claude Code Stop hook and as an Antigravity (IDE / CLI) Stop hook;
// the payload format is detected from stdin and the decision is translated back.
//
// When the session ends with uncommitted code changes in any configured system:
//   - docs also changed  → run the knowledge base's fast check; block on errors.
//   - docs didn't change → block ONCE per session with the list of docs whose `sources:`
//                          point at the changed files, and instructions to update them
//                          (or to justify why no doc change is needed).
// Outside a Ragu workspace (no ragu.config.json upwards from cwd) it does nothing.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { findConfigFor, forWorkingTree, loadConfig } from "./lib/config.mjs";
import { codeChangesBySystem, docChanges, staleDocs } from "./lib/changes.mjs";

const LOCK_TTL_MS = 24 * 60 * 60 * 1000;

function readStdinJson() {
	try {
		return JSON.parse(readFileSync(0, "utf-8") || "{}");
	} catch {
		return {};
	}
}

/**
 * Normalises the two supported payloads.
 *  - Claude Code:  { cwd, session_id, stop_hook_active }  → { decision: "block", reason } | { systemMessage }
 *  - Antigravity:  { workspacePaths, conversationId, executionNum } → { decision: "continue", reason }
 */
export function adapt(input) {
	if (Array.isArray(input.workspacePaths) || input.conversationId) {
		return {
			agent: "antigravity",
			cwd: input.workspacePaths?.[0] || process.cwd(),
			sessionId: input.conversationId || "default",
			// Antigravity has no "already continued" flag; guarded per session with a lock file (see main).
			alreadyContinued: false,
			block: (reason) => ({ decision: "continue", reason }),
			allow: (message) => (message ? { decision: "allow", reason: message } : {}),
		};
	}
	return {
		agent: "claude",
		cwd: input.cwd || process.cwd(),
		sessionId: input.session_id || "default",
		// Claude Code sets this when it is already continuing because of a Stop hook. Never block twice in a row.
		alreadyContinued: Boolean(input.stop_hook_active),
		block: (reason) => ({ decision: "block", reason }),
		allow: (message) => (message ? { systemMessage: message } : {}),
	};
}

function respond(payload) {
	process.stdout.write(JSON.stringify(payload));
	process.exit(0);
}

function listDocs(dir) {
	const files = [];
	if (!existsSync(dir)) return files;
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) files.push(...listDocs(full));
		else if (/\.mdx?$/.test(entry)) files.push(full);
	}
	return files;
}

function lockPath(sessionId, kind) {
	const dir = join(tmpdir(), "ragu-hook");
	mkdirSync(dir, { recursive: true });
	return join(dir, `${String(sessionId).replace(/[^a-zA-Z0-9_-]/g, "_")}.${kind}`);
}

function alreadyWarned(sessionId, kind = "lock") {
	const p = lockPath(sessionId, kind);
	if (!existsSync(p)) return false;
	return Date.now() - statSync(p).mtimeMs < LOCK_TTL_MS;
}

function markWarned(sessionId, kind = "lock") {
	try {
		writeFileSync(lockPath(sessionId, kind), String(Date.now()));
	} catch {
		/* best effort */
	}
}

function runCheck(config) {
	const script = join(config.root, "scripts", "check.mjs");
	if (!existsSync(script)) return { ok: true, output: "(scripts/check.mjs not found; skipped)" };
	const res = spawnSync(process.execPath, [script], { cwd: config.root, encoding: "utf-8", timeout: 30_000 });
	const output = `${res.stdout ?? ""}${res.stderr ?? ""}`.trim();
	return { ok: res.status === 0, output: output.split("\n").slice(-30).join("\n") };
}

export function main(input = readStdinJson()) {
	const io = adapt(input);
	if (io.alreadyContinued) respond({});

	const cwd = io.cwd;
	const configPath = findConfigFor(cwd);
	if (!configPath) respond({});

	let config;
	try {
		config = forWorkingTree(loadConfig(configPath), cwd);
	} catch (e) {
		respond(io.allow(`ragu: could not read ${configPath}: ${e.message}`));
	}

	const changes = codeChangesBySystem(config);
	if (!changes.length) respond({});

	const sessionId = io.sessionId;
	const docsChanged = docChanges(config);
	if (docsChanged.length) {
		const { ok, output } = runCheck(config);
		if (ok) respond(io.allow(`ragu: knowledge base updated and validated (${docsChanged.length} file(s)).`));
		// Without an "already continued" flag (Antigravity), block on a failing check at most once per session.
		if (io.agent !== "claude" && alreadyWarned(sessionId, "check")) {
			respond(io.allow(`ragu: scripts/check.mjs still fails:\n${output}`));
		}
		markWarned(sessionId, "check");
		respond(
			io.block(
				`[ragu] The knowledge base was updated but \`scripts/check.mjs\` failed:\n\n${output}\n\n` +
					`Fix the errors in ${relative(cwd, config.root) || "."} before finishing.`,
			),
		);
	}

	if (alreadyWarned(sessionId)) {
		respond(io.allow("ragu: knowledge base reminder already issued in this session."));
	}
	markWarned(sessionId);

	const stale = staleDocs(config, changes, listDocs);
	const changedSummary = changes
		.map((c) => `- ${c.systemId}: ${c.files.slice(0, 8).join(", ")}${c.files.length > 8 ? ` (+${c.files.length - 8} more)` : ""}`)
		.join("\n");
	const staleSummary = stale.length
		? stale.map((s) => `- ${s.doc} (sources: ${s.hits.join(", ")})`).join("\n")
		: "- none: no document cites the changed files. If this change adds or alters a business rule, contract, integration or flow, a new page is probably needed.";
	const docsRel = relative(cwd, config.docsDir) || config.docsDir;

	respond(
		io.block(
			"[ragu] Code changed but the knowledge base did not.\n\n" +
				`Changed code:\n${changedSummary}\n\n` +
				`Documents whose \`sources:\` point at these files (potentially stale):\n${staleSummary}\n\n` +
				"Before finishing:\n" +
				"1. Read the guidelines in the knowledge base's AGENTS.md.\n" +
				"2. Decide whether this change creates, alters or removes a business rule, API contract, integration or flow.\n" +
				`3. If yes: update or create the pages under ${docsRel}/ (frontmatter: title, domain, systems, status, sources, updated_at), keep \`sources:\` pointing at the exact files/lines, and run \`npm run check\` in the knowledge base.\n` +
				"4. Record open questions or divergences in inbox/QUESTIONS.md or inbox/DIVERGENCES.md.\n" +
				"5. If the change is strictly technical (refactor, lint, tests, dependencies) with no impact on documented behaviour, you may finish; say so explicitly in your final answer.",
		),
	);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main();
