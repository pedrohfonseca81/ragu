// ragu-mcp: local stdio MCP server over one or several Ragu knowledge bases.
// Same three tools and signatures as the remote Cloudflare worker, so agents don't notice which
// one they're talking to. Search is lexical (MiniSearch): no network, no model download.
export { findConfigFile, findConfigFor, gitToplevel } from "./discovery.ts";
export { readRegistry, registryFile, resolveConfigs } from "./registry.ts";
export { buildIndex, docSummary, loadDocs, loadKnowledgeBases, searchDocs, statusWarning } from "./knowledge-base.ts";
export { createServerFactory, createState } from "./server.ts";
export { walkMarkdown } from "./walk.ts";
export { STATUSES } from "./types.ts";
export type * from "./types.ts";
