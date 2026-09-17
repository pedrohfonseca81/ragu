/// <reference types="@cloudflare/workers-types" />
// Cloudflare Worker: serves the static site (ASSETS), exposes the knowledge base as a remote
// MCP server at /mcp (semantic search via Workers AI + Vectorize) and admin endpoints used by
// the reindex workflow. Everything project-specific comes from ragu.config.json and the
// generated docs bundle.
import { createMcpHandler } from "agents/mcp/server";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import OAuthProvider, { getOAuthApi, type OAuthProviderOptions } from "@cloudflare/workers-oauth-provider";
import raguConfig from "../../ragu.config.json";
import docsData from "./docs-data.generated.json";

interface Doc {
	path: string;
	title: string;
	domain: string | null;
	systems: string[];
	status: string;
	updated_at: string | null;
	content: string;
}

interface Env {
	AI: Ai;
	VECTORIZE_INDEX: VectorizeIndex;
	ASSETS: Fetcher;
	OAUTH_KV?: KVNamespace;
	/** `name:token,name2:token2`: one revocable token per person/client. */
	MCP_TOKENS: string;
	REINDEX_SECRET: string;
}

const BUNDLE = docsData as { sha: string; generatedAt: string; systems: string[]; docs: Doc[] };
const DOCS: Doc[] = BUNDLE.docs;
const DOCS_BY_PATH = new Map(DOCS.map((d) => [d.path, d]));
const SYSTEMS: string[] = BUNDLE.systems;
const STATUSES = ["verified", "inferred", "unverified", "outdated"];
const REMOTE = raguConfig.remote ?? { url: "", embeddingModel: "@cf/baai/bge-m3", oauth: false };
const EMBEDDING_MODEL = REMOTE.embeddingModel ?? "@cf/baai/bge-m3";
const OAUTH_ENABLED = REMOTE.oauth === true;
const MCP_RESOURCE = `${REMOTE.url.replace(/\/$/, "")}/mcp`;

// Vectorize metadata can't hold arrays, so the multi-valued `systems` field becomes one boolean
// flag per system (sys_api, sys_web, ...).
function systemMetadataKey(system: string): string {
	return `sys_${system.replace(/-/g, "_")}`;
}

function systemsMetadata(systems: string[]): Record<string, boolean> {
	const meta: Record<string, boolean> = {};
	for (const s of SYSTEMS) meta[systemMetadataKey(s)] = systems.includes(s);
	return meta;
}

function statusWarning(status: string): string | null {
	if (status === "outdated") {
		return "⚠️ status: outdated. This document is known to diverge from the current code. Check the sources before trusting it.";
	}
	return null;
}

function docSummary(d: Doc) {
	return { path: d.path, title: d.title, domain: d.domain, systems: d.systems, status: d.status, updated_at: d.updated_at };
}

function buildServer(env: Env): McpServer {
	const server = new McpServer({ name: raguConfig.name, version: "1.0.0" });

	server.registerTool(
		"search_docs",
		{
			title: "Search the knowledge base",
			description: `Semantic search over the ${raguConfig.title} (business rules, flows, integrations, decisions). Returns the most relevant documents with metadata and full content.`,
			inputSchema: z.object({
				query: z.string().describe("Natural-language question or search terms"),
				systems: z.array(z.string()).optional().describe(`Filter by system: ${SYSTEMS.join(", ")}`),
				domain: z.string().optional().describe("Filter by exact domain"),
				status: z.array(z.string()).optional().describe(`Filter by status: ${STATUSES.join(", ")}`),
				topK: z.number().min(1).max(20).optional().describe("Number of results (default 5)"),
			}),
		},
		async ({ query, systems, domain, status, topK }) => {
			const embedding = await env.AI.run(EMBEDDING_MODEL as never, { text: [query] });
			const vector = (embedding as { data: number[][] }).data[0];
			const k = topK ?? 5;

			const baseFilter: Record<string, unknown> = {};
			if (domain) baseFilter.domain = domain;
			if (status?.length) baseFilter.status = { $in: status };

			// One query per requested system (boolean flag filter), merged by best score.
			const variants: (string | null)[] = systems?.length ? systems : [null];
			const seen = new Map<string, { score: number; metadata: Record<string, unknown> }>();
			for (const system of variants) {
				const filter = { ...baseFilter };
				if (system) filter[systemMetadataKey(system)] = { $eq: true };
				const res = await env.VECTORIZE_INDEX.query(vector, {
					topK: k,
					filter: Object.keys(filter).length ? filter : undefined,
					returnMetadata: true,
				});
				for (const m of res.matches) {
					const existing = seen.get(m.id);
					if (!existing || m.score > existing.score) {
						seen.set(m.id, { score: m.score, metadata: (m.metadata ?? {}) as Record<string, unknown> });
					}
				}
			}
			const results = [...seen.entries()]
				.sort((a, b) => b[1].score - a[1].score)
				.slice(0, k)
				.map(([id, v]) => {
					const path = String(v.metadata?.path ?? id);
					const doc = DOCS_BY_PATH.get(path);
					const warning = doc ? statusWarning(doc.status) : null;
					return {
						path,
						title: doc?.title ?? v.metadata?.title,
						score: v.score,
						domain: doc?.domain,
						systems: doc?.systems,
						status: doc?.status,
						...(warning ? { warning } : {}),
						content: doc?.content ?? null,
					};
				});

			return { content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }] };
		},
	);

	server.registerTool(
		"get_document",
		{
			title: "Read a full document",
			description: "Returns the full markdown of one document by its exact path (e.g. domain/refunds.md).",
			inputSchema: z.object({
				path: z.string().describe("Path relative to the docs directory, e.g. domain/refunds.md"),
			}),
		},
		async ({ path }) => {
			const doc = DOCS_BY_PATH.get(path);
			if (!doc) {
				return { content: [{ type: "text" as const, text: `Document not found: ${path}` }], isError: true };
			}
			const warning = statusWarning(doc.status);
			return {
				content: [
					{
						type: "text" as const,
						text: JSON.stringify({ ...docSummary(doc), ...(warning ? { warning } : {}), content: doc.content }, null, 2),
					},
				],
			};
		},
	);

	server.registerTool(
		"list_documents",
		{
			title: "List documents",
			description:
				"Lists every document in the knowledge base, optionally filtered by system or domain. Returns metadata only; use get_document for the content.",
			inputSchema: z.object({
				systems: z.array(z.string()).optional(),
				domain: z.string().optional(),
			}),
		},
		async ({ systems, domain }) => {
			let docs = DOCS;
			if (systems?.length) docs = docs.filter((d) => d.systems.some((s) => systems.includes(s)));
			if (domain) docs = docs.filter((d) => d.domain === domain);
			return { content: [{ type: "text" as const, text: JSON.stringify(docs.map(docSummary), null, 2) }] };
		},
	);

	return server;
}

async function reindex(env: Env): Promise<{ count: number }> {
	// bge-m3 caps total tokens per call; dense documents can reach ~3k tokens each, so keep batches small.
	const BATCH_SIZE = 5;
	for (let i = 0; i < DOCS.length; i += BATCH_SIZE) {
		const batch = DOCS.slice(i, i + BATCH_SIZE);
		const embeddings = await env.AI.run(EMBEDDING_MODEL as never, {
			text: batch.map((d) => `${d.title}\n\n${d.content}`),
		});
		const vectors = (embeddings as { data: number[][] }).data;
		await env.VECTORIZE_INDEX.upsert(
			batch.map((d, idx) => ({
				id: d.path,
				values: vectors[idx],
				metadata: {
					path: d.path,
					title: d.title,
					domain: d.domain ?? "",
					status: d.status,
					...systemsMetadata(d.systems),
				},
			})),
		);
	}
	return { count: DOCS.length };
}

function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let result = 0;
	for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return result === 0;
}

/** Parses `alice:tok1,bob:tok2`. Entries without a name get a positional name. */
function parseTokens(raw: string | undefined): { name: string; token: string }[] {
	if (!raw) return [];
	return raw
		.split(",")
		.map((entry, i) => {
			const idx = entry.indexOf(":");
			const name = idx > 0 ? entry.slice(0, idx).trim() : `client-${i + 1}`;
			const token = (idx > 0 ? entry.slice(idx + 1) : entry).trim();
			return { name, token };
		})
		.filter((e) => e.token.length > 0);
}

function matchToken(token: string, env: Env): string | null {
	for (const entry of parseTokens(env.MCP_TOKENS)) {
		if (timingSafeEqual(token, entry.token)) return entry.name;
	}
	return null;
}

function bearer(request: Request): string | null {
	const auth = request.headers.get("Authorization");
	return auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : null;
}

function mcpHandler(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
	const handler = createMcpHandler(() => buildServer(env), { route: "/mcp" });
	return handler(request, env, ctx);
}

async function adminAndAssets(request: Request, env: Env): Promise<Response | null> {
	const url = new URL(request.url);

	if (url.pathname === "/admin/version") {
		return Response.json({ sha: BUNDLE.sha, generatedAt: BUNDLE.generatedAt, docCount: DOCS.length });
	}

	if (url.pathname === "/admin/reindex") {
		const token = bearer(request);
		if (!token || !env.REINDEX_SECRET || !timingSafeEqual(token, env.REINDEX_SECRET)) {
			return new Response("Unauthorized", { status: 401 });
		}
		const result = await reindex(env);
		return Response.json({ ok: true, ...result });
	}

	return null;
}

// ---------------------------------------------------------------------------
// Mode 1 (default): static bearer tokens only. Works with Claude Code, Cursor and any
// MCP client that can send an Authorization header.
// ---------------------------------------------------------------------------
const tokenOnlyWorker = {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname === "/mcp" || url.pathname.startsWith("/mcp/")) {
			const token = bearer(request);
			if (!token || !matchToken(token, env)) return new Response("Unauthorized", { status: 401 });
			return mcpHandler(request, env, ctx);
		}
		return (await adminAndAssets(request, env)) ?? env.ASSETS.fetch(request);
	},
};

// ---------------------------------------------------------------------------
// Mode 2 (remote.oauth = true): OAuth provider for clients that need a browser login
// (claude.ai web). /authorize is expected to sit behind Cloudflare Access, which sets
// Cf-Access-Authenticated-User-Email at the edge; static tokens still work as a fallback.
// Requires an OAUTH_KV binding in wrangler.jsonc.
// ---------------------------------------------------------------------------
const oauthDefaultHandler = {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname === "/authorize") {
			const email = request.headers.get("Cf-Access-Authenticated-User-Email");
			if (!email) {
				return new Response("Unauthorized: expected Cloudflare Access header", { status: 401 });
			}
			const oauthApi = getOAuthApi(providerOptions, env);
			const authReq = await oauthApi.parseAuthRequest(request);
			const { redirectTo } = await oauthApi.completeAuthorization({
				request: authReq,
				userId: email,
				metadata: { email },
				scope: authReq.scope,
				props: { user: email },
			});
			return Response.redirect(redirectTo, 302);
		}
		return (await adminAndAssets(request, env)) ?? env.ASSETS.fetch(request);
	},
};

const providerOptions: OAuthProviderOptions<Env> = {
	apiRoute: "/mcp",
	apiHandler: { fetch: mcpHandler },
	defaultHandler: oauthDefaultHandler,
	authorizeEndpoint: "/authorize",
	tokenEndpoint: "/oauth/token",
	clientRegistrationEndpoint: "/oauth/register",
	resourceMetadata: { resource: MCP_RESOURCE, resource_name: raguConfig.title },
	resolveExternalToken: async ({ token, env }) => {
		const name = matchToken(token, env);
		return name ? { props: { user: name }, audience: MCP_RESOURCE } : null;
	},
};

export default OAUTH_ENABLED ? new OAuthProvider(providerOptions) : tokenOnlyWorker;
