// ragu-mcp: local stdio MCP server over a Ragu knowledge base.
// Same three tools and signatures as the remote Cloudflare worker, so agents don't
// notice which one they're talking to. Search is lexical (MiniSearch): no network, no model download.
import { readFileSync, existsSync, readdirSync, watch } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import matter from "gray-matter";
import MiniSearch from "minisearch";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/server";
import { walkMarkdown } from "./walk.mjs";

const VERSION = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8")).version;

export const STATUSES = ["verified", "inferred", "unverified", "outdated"];

export function findConfigFile(start) {
	let dir = resolve(start);
	for (;;) {
		const candidate = join(dir, "ragu.config.json");
		if (existsSync(candidate)) return candidate;
		const parent = dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
}

function gitToplevel(dir) {
	if (!existsSync(dir)) return null;
	const res = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: dir, encoding: "utf-8", timeout: 10_000 });
	return res.status === 0 ? resolve(res.stdout.trim()) : null;
}

function isInside(child, parent) {
	const rel = relative(parent, child);
	return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/**
 * Finds the knowledge base that governs `cwd` (same rules as the ragu plugin hook):
 *  1. `RAGU_CONFIG` env var; 2. ragu.config.json in `cwd` or an ancestor;
 *  3. ragu.config.json in an immediate child of `cwd` or an ancestor, when `cwd` is inside one of
 *     its configured systems (sibling layout) or is the git repository containing one (monorepo).
 * Lets `.mcp.json` / `mcp_config.json` in a code repository run `ragu-mcp` with no arguments.
 */
export function findConfigFor(cwd) {
	const start = resolve(cwd);
	if (process.env.RAGU_CONFIG && existsSync(process.env.RAGU_CONFIG)) return resolve(process.env.RAGU_CONFIG);
	const direct = findConfigFile(start);
	if (direct) return direct;
	let dir = start;
	for (;;) {
		let entries = [];
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			/* unreadable ancestor */
		}
		for (const entry of entries) {
			if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "node_modules") continue;
			const candidate = join(dir, entry.name, "ragu.config.json");
			if (!existsSync(candidate)) continue;
			try {
				const root = join(dir, entry.name);
				const systems = (JSON.parse(readFileSync(candidate, "utf-8")).systems ?? []).map((s) => resolve(root, s.path));
				if (systems.some((s) => isInside(start, s))) return candidate;
				if (systems.some((s) => isInside(s, start) && gitToplevel(start) === gitToplevel(s))) return candidate;
			} catch {
				/* invalid config; keep looking */
			}
		}
		const parent = dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
}

/** $XDG_CONFIG_HOME/ragu/knowledge-bases.json, written by `create-ragu install`. */
export function registryFile({ home = homedir(), env = process.env } = {}) {
	const base = env.XDG_CONFIG_HOME ? resolve(env.XDG_CONFIG_HOME) : join(home, ".config");
	return join(base, "ragu", "knowledge-bases.json");
}

/** Registered knowledge bases whose config still exists; dead entries are reported through `log`. */
export function readRegistry({ home, env, log = () => {} } = {}) {
	const file = registryFile({ home, env });
	if (!existsSync(file)) return [];
	let entries;
	try {
		entries = JSON.parse(readFileSync(file, "utf-8")).knowledgeBases ?? [];
	} catch (e) {
		log(`ignoring ${file}: ${e.message}`);
		return [];
	}
	const alive = [];
	for (const e of entries) {
		if (!e || typeof e.config !== "string") continue;
		if (existsSync(e.config)) alive.push({ name: e.name, config: resolve(e.config) });
		else log(`registry entry ${e.name ?? e.config} points at a missing ${e.config}; run \`npx create-ragu install\` from a knowledge base to prune it`);
	}
	return alive;
}

/**
 * Which knowledge base(s) a `ragu-mcp` started with no `--root` should serve:
 *  1. the one governing `cwd`;
 *  2. the one governing `$PWD` (an MCP server launched by a global plugin may get the plugin
 *     directory as cwd while PWD still names the workspace the agent was opened in);
 *  3. every knowledge base in the per-user registry.
 * @returns {string[]} config paths (empty when nothing applies)
 */
export function resolveConfigs(cwd, { env = process.env, home, log } = {}) {
	const direct = findConfigFor(cwd);
	if (direct) return [direct];
	if (env.PWD && resolve(env.PWD) !== resolve(cwd)) {
		const fromPwd = findConfigFor(env.PWD);
		if (fromPwd) return [fromPwd];
	}
	return readRegistry({ env, home, log }).map((e) => e.config);
}

export function loadDocs(configPath) {
	const raw = JSON.parse(readFileSync(configPath, "utf-8"));
	const root = dirname(resolve(configPath));
	const docsDir = resolve(root, raw.docsDir ?? "src/content/docs");
	const docs = walkMarkdown(docsDir).map((file) => {
		const { data: fm, content } = matter(readFileSync(file, "utf-8"));
		const path = relative(docsDir, file).replace(/\\/g, "/");
		return {
			id: path,
			path,
			title: fm.title ?? path,
			domain: fm.domain ?? null,
			systems: fm.systems ?? [],
			status: fm.status ?? "unverified",
			updated_at: fm.updated_at ? new Date(fm.updated_at).toISOString().slice(0, 10) : null,
			content: content.trim(),
		};
	});
	return {
		name: raw.name,
		title: raw.title,
		systems: (raw.systems ?? []).map((s) => s.id),
		docsDir,
		docs,
	};
}

export function buildIndex(docs) {
	const index = new MiniSearch({
		fields: ["title", "content", "domain", "path"],
		storeFields: ["id"],
		idField: "id",
		searchOptions: {
			boost: { title: 3, domain: 2, path: 1.5 },
			fuzzy: 0.2,
			prefix: true,
			combineWith: "OR",
		},
	});
	index.addAll(docs);
	return index;
}

function statusWarning(status) {
	return status === "outdated"
		? "⚠️ status: outdated. This document is known to diverge from the current code. Check the sources before trusting it."
		: null;
}

function docSummary(d) {
	return { ...(d.kb ? { kb: d.kb } : {}), path: d.path, title: d.title, domain: d.domain, systems: d.systems, status: d.status, updated_at: d.updated_at };
}

/** Pure search over an in-memory knowledge base; exported for tests. */
export function searchDocs(kb, index, { query, systems, domain, status, topK, kb: kbName }) {
	const k = topK ?? 5;
	const byId = new Map(kb.docs.map((d) => [d.id, d]));
	const hits = index.search(query);
	const results = [];
	for (const hit of hits) {
		const doc = byId.get(hit.id);
		if (!doc) continue;
		if (kbName && doc.kb !== kbName) continue;
		if (systems?.length && !doc.systems.some((s) => systems.includes(s))) continue;
		if (domain && doc.domain !== domain) continue;
		if (status?.length && !status.includes(doc.status)) continue;
		const warning = statusWarning(doc.status);
		results.push({
			...(doc.kb ? { kb: doc.kb } : {}),
			path: doc.path,
			title: doc.title,
			score: Number(hit.score.toFixed(3)),
			domain: doc.domain,
			systems: doc.systems,
			status: doc.status,
			...(warning ? { warning } : {}),
			content: doc.content,
		});
		if (results.length >= k) break;
	}
	return results;
}

/**
 * Creates an McpServer factory bound to a knowledge base. `state` is re-read on
 * every call so a file watcher can hot-swap the index without restarting.
 */
export function createServerFactory(state) {
	return () => {
		const { kb } = state;
		const server = new McpServer({ name: kb.name ?? "ragu", version: VERSION });
		const kbHint = kb.names ? ` Serves ${kb.names.length} knowledge bases (${kb.names.join(", ")}); every document carries a \`kb\` field.` : "";

		server.registerTool(
			"search_docs",
			{
				title: "Search the knowledge base",
				description: `Search the ${kb.title ?? "knowledge base"} (business rules, flows, integrations, decisions). Lexical search with fuzzy matching; returns the most relevant documents with metadata and full content.${kbHint}`,
				inputSchema: z.object({
					query: z.string().describe("Question or search terms"),
					...(kb.names ? { kb: z.string().optional().describe(`Filter by knowledge base: ${kb.names.join(", ")}`) } : {}),
					systems: z.array(z.string()).optional().describe(`Filter by system: ${kb.systems.join(", ") || "(none configured)"}`),
					domain: z.string().optional().describe("Filter by exact domain"),
					status: z.array(z.string()).optional().describe(`Filter by status: ${STATUSES.join(", ")}`),
					topK: z.number().min(1).max(20).optional().describe("Number of results (default 5)"),
				}),
			},
			async (args) => {
				const results = searchDocs(state.kb, state.index, args);
				return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
			},
		);

		server.registerTool(
			"get_document",
			{
				title: "Read a full document",
				description: `Returns the full markdown of one document by its exact path (e.g. domain/refunds.md).${kbHint}`,
				inputSchema: z.object({
					path: z.string().describe("Path relative to the docs directory"),
					...(kb.names ? { kb: z.string().optional().describe("Knowledge base the path belongs to; required when the same path exists in several") } : {}),
				}),
			},
			async ({ path, kb: kbName }) => {
				const matches = state.kb.docs.filter((d) => d.path === path && (!kbName || d.kb === kbName));
				if (matches.length > 1) {
					return { content: [{ type: "text", text: `${path} exists in several knowledge bases: ${matches.map((d) => d.kb).join(", ")}. Pass kb to choose one.` }], isError: true };
				}
				const doc = matches[0];
				if (!doc) return { content: [{ type: "text", text: `Document not found: ${path}${kbName ? ` in ${kbName}` : ""}` }], isError: true };
				const warning = statusWarning(doc.status);
				return {
					content: [
						{ type: "text", text: JSON.stringify({ ...docSummary(doc), ...(warning ? { warning } : {}), content: doc.content }, null, 2) },
					],
				};
			},
		);

		server.registerTool(
			"list_documents",
			{
				title: "List documents",
				description: `Lists every document, optionally filtered by system or domain. Metadata only; use get_document for the content.${kbHint}`,
				inputSchema: z.object({
					...(kb.names ? { kb: z.string().optional().describe(`Filter by knowledge base: ${kb.names.join(", ")}`) } : {}),
					systems: z.array(z.string()).optional(),
					domain: z.string().optional(),
				}),
			},
			async ({ kb: kbName, systems, domain }) => {
				let docs = state.kb.docs;
				if (kbName) docs = docs.filter((d) => d.kb === kbName);
				if (systems?.length) docs = docs.filter((d) => d.systems.some((s) => systems.includes(s)));
				if (domain) docs = docs.filter((d) => d.domain === domain);
				return { content: [{ type: "text", text: JSON.stringify(docs.map(docSummary), null, 2) }] };
			},
		);

		return server;
	};
}

/**
 * One knowledge base, or several merged into one index. With several, every document carries
 * `kb` (the knowledge base's name) and ids are `<kb>:<path>` so equal paths don't collide.
 */
export function loadKnowledgeBases(configPaths) {
	const paths = [].concat(configPaths);
	if (paths.length === 1) return loadDocs(paths[0]);
	const kbs = paths.map(loadDocs);
	const names = kbs.map((k, i) => k.name ?? `kb${i + 1}`);
	return {
		name: "ragu",
		title: `knowledge bases ${names.join(", ")}`,
		names,
		systems: [...new Set(kbs.flatMap((k) => k.systems))],
		docsDirs: kbs.map((k) => k.docsDir),
		docs: kbs.flatMap((k, i) => k.docs.map((d) => ({ ...d, kb: names[i], id: `${names[i]}:${d.path}` }))),
	};
}

/** Loads the KB(s), builds the index and (optionally) watches the docs dirs for changes. */
export function createState(configPaths, { watchFiles = true, log = () => {} } = {}) {
	const state = { kb: null, index: null };
	const reload = () => {
		state.kb = loadKnowledgeBases(configPaths);
		state.index = buildIndex(state.kb.docs);
		log(`indexed ${state.kb.docs.length} documents from ${(state.kb.docsDirs ?? [state.kb.docsDir]).join(", ")}`);
	};
	reload();
	if (watchFiles) {
		let timer = null;
		for (const dir of state.kb.docsDirs ?? [state.kb.docsDir]) {
			try {
				watch(dir, { recursive: true }, () => {
					clearTimeout(timer);
					timer = setTimeout(() => {
						try {
							reload();
						} catch (e) {
							log(`reload failed: ${e.message}`);
						}
					}, 300);
				});
			} catch (e) {
				log(`file watching unavailable for ${dir} (${e.message}); restart the server after editing docs`);
			}
		}
	}
	return state;
}
