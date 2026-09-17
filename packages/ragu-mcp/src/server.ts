// The MCP surface: three tools over a hot-swappable in-memory index.
import { readFileSync, watch } from "node:fs";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/server";
import { buildIndex, docSummary, loadKnowledgeBases, searchDocs, statusWarning, type Index } from "./knowledge-base.ts";
import { STATUSES, type KnowledgeBase, type Logger } from "./types.ts";

const VERSION = (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8")) as { version: string }).version;

export interface ServerState {
	kb: KnowledgeBase;
	index: Index;
}

export interface StateOptions {
	watchFiles?: boolean;
	log?: Logger;
}

function text(payload: unknown, isError = false) {
	return { content: [{ type: "text" as const, text: typeof payload === "string" ? payload : JSON.stringify(payload, null, 2) }], ...(isError ? { isError: true } : {}) };
}

/**
 * Creates an McpServer factory bound to `state`. The state is read on every call, so the file
 * watcher can swap the index without restarting the server.
 */
export function createServerFactory(state: ServerState): () => McpServer {
	return () => {
		const { kb } = state;
		const kbHint = kb.names ? ` Serves ${kb.names.length} knowledge bases (${kb.names.join(", ")}); every document carries a \`kb\` field.` : "";
		const kbFilter = z.string().optional().describe(kb.names ? `Filter by knowledge base: ${kb.names.join(", ")}` : "Filter by knowledge base (only one is served)");
		const server = new McpServer({ name: kb.name ?? "ragu", version: VERSION });

		server.registerTool(
			"search_docs",
			{
				title: "Search the knowledge base",
				description: `Search the ${kb.title ?? "knowledge base"} (business rules, flows, integrations, decisions). Lexical search with fuzzy matching; returns the most relevant documents with metadata and full content.${kbHint}`,
				inputSchema: z.object({
					query: z.string().describe("Question or search terms"),
					kb: kbFilter,
					systems: z.array(z.string()).optional().describe(`Filter by system: ${kb.systems.join(", ") || "(none configured)"}`),
					domain: z.string().optional().describe("Filter by exact domain"),
					status: z.array(z.string()).optional().describe(`Filter by status: ${STATUSES.join(", ")}`),
					topK: z.number().min(1).max(20).optional().describe("Number of results (default 5)"),
				}),
			},
			async (args) => text(searchDocs(state.kb, state.index, args)),
		);

		server.registerTool(
			"get_document",
			{
				title: "Read a full document",
				description: `Returns the full markdown of one document by its exact path (e.g. domain/refunds.md).${kbHint}`,
				inputSchema: z.object({
					path: z.string().describe("Path relative to the docs directory"),
					kb: z.string().optional().describe("Knowledge base the path belongs to; required when the same path exists in several"),
				}),
			},
			async ({ path, kb: kbName }) => {
				const candidates = state.kb.docs.filter((d) => d.path === path && (!kbName || d.kb === kbName));
				if (candidates.length > 1) {
					return text(`${path} exists in several knowledge bases: ${candidates.map((d) => d.kb).join(", ")}. Pass kb to choose one.`, true);
				}
				const doc = candidates[0];
				if (!doc) return text(`Document not found: ${path}${kbName ? ` in ${kbName}` : ""}`, true);
				const warning = statusWarning(doc.status);
				return text({ ...docSummary(doc), ...(warning ? { warning } : {}), content: doc.content });
			},
		);

		server.registerTool(
			"list_documents",
			{
				title: "List documents",
				description: `Lists every document, optionally filtered by system or domain. Metadata only; use get_document for the content.${kbHint}`,
				inputSchema: z.object({
					kb: kbFilter,
					systems: z.array(z.string()).optional(),
					domain: z.string().optional(),
				}),
			},
			async ({ kb: kbName, systems, domain }) => {
				const docs = state.kb.docs.filter(
					(d) => (!kbName || d.kb === kbName) && (!systems?.length || d.systems.some((s) => systems.includes(s))) && (!domain || d.domain === domain),
				);
				return text(docs.map(docSummary));
			},
		);

		return server;
	};
}

/** Loads the knowledge base(s), builds the index and (optionally) re-indexes when files change. */
export function createState(configPaths: string | string[], { watchFiles = true, log = () => {} }: StateOptions = {}): ServerState {
	const load = (): ServerState => {
		const kb = loadKnowledgeBases(configPaths);
		log(`indexed ${kb.docs.length} documents from ${(kb.docsDirs ?? [kb.docsDir]).join(", ")}`);
		return { kb, index: buildIndex(kb.docs) };
	};
	const state = load();
	if (!watchFiles) return state;

	let timer: NodeJS.Timeout | undefined;
	const reload = () => {
		clearTimeout(timer);
		timer = setTimeout(() => {
			try {
				Object.assign(state, load());
			} catch (e) {
				log(`reload failed: ${e instanceof Error ? e.message : String(e)}`);
			}
		}, 300);
	};
	for (const dir of state.kb.docsDirs ?? (state.kb.docsDir ? [state.kb.docsDir] : [])) {
		try {
			watch(dir, { recursive: true }, reload);
		} catch (e) {
			log(`file watching unavailable for ${dir} (${e instanceof Error ? e.message : String(e)}); restart the server after editing docs`);
		}
	}
	return state;
}
