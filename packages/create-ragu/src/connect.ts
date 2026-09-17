// The three files `install` leaves in a connected repository: the AGENTS.md block, the
// @AGENTS.md include in CLAUDE.md, and the .mcp.json server. Nothing harness-specific beyond that.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readJson, writeJson } from "./fs.ts";
import { MCP_SERVER } from "./plugin.ts";
import type { FileOutcome } from "./types.ts";

export const BLOCK_START = "<!-- ragu:start -->";
export const BLOCK_END = "<!-- ragu:end -->";

export interface AgentsBlockInput {
	/** Knowledge base path relative to the repository root. */
	kbRel: string;
	kbName: string;
	systemIds: string[];
}

export function agentsBlock({ kbRel, kbName, systemIds }: AgentsBlockInput): string {
	const rel = kbRel.replace(/\\/g, "/") || ".";
	const ids = systemIds.map((id) => `\`${id}\``).join(", ");
	return `${BLOCK_START}
## Knowledge base (Ragu)

The business rules, flows, integrations and decisions of this repository (system ${ids}) are documented in the Ragu knowledge base at \`${rel}/\`. Agents reach it over MCP (\`search_docs\`, \`get_document\`, \`list_documents\`): server \`${kbName}\` from this repository's \`.mcp.json\`, or \`ragu_kb\` from the ragu plugin in Antigravity.

- **Before** changing a business rule, API contract, integration or flow: search the knowledge base (\`search_docs\`) and read the pages whose \`sources:\` cite the files you are about to touch.
- **After** changing one: update those pages, or create new ones, using the \`ragu-sync\` skill. A Stop hook reminds you once per session if code changed and the knowledge base did not.
- The code is the truth. When a page disagrees with the code, mark it \`status: outdated\` and log the divergence in \`${rel}/inbox/DIVERGENCES.md\`. Never invent a motivation (write \`Reason not documented\` and log a question in \`${rel}/inbox/QUESTIONS.md\`); never set \`human_reviewed: true\`.
- Full rules: \`${rel}/AGENTS.md\`.
${BLOCK_END}`;
}

/** Inserts or replaces the marked block. Everything outside the markers is left untouched. */
export function upsertBlock(existing: string | null, block: string): string {
	if (existing === null) return `${block}\n`;
	const start = existing.indexOf(BLOCK_START);
	const end = existing.indexOf(BLOCK_END);
	if (start >= 0 && end > start) return existing.slice(0, start) + block + existing.slice(end + BLOCK_END.length);
	const separator = existing.length === 0 || existing.endsWith("\n\n") ? "" : existing.endsWith("\n") ? "\n" : "\n\n";
	return `${existing}${separator}${block}\n`;
}

export function injectAgentsMd(root: string, input: AgentsBlockInput): FileOutcome {
	const file = join(root, "AGENTS.md");
	const existing = existsSync(file) ? readFileSync(file, "utf-8") : null;
	const next = upsertBlock(existing, agentsBlock(input));
	if (existing === null) {
		writeFileSync(file, next);
		return "created";
	}
	if (next === existing) return "kept";
	writeFileSync(file, next);
	return "updated";
}

/** Makes sure CLAUDE.md includes AGENTS.md (Claude Code reads `@file` includes). */
export function ensureClaudeInclude(root: string): FileOutcome {
	const file = join(root, "CLAUDE.md");
	if (!existsSync(file)) {
		writeFileSync(file, "@AGENTS.md\n");
		return "created";
	}
	const existing = readFileSync(file, "utf-8");
	if (/^@AGENTS\.md\s*$/m.test(existing)) return "kept";
	writeFileSync(file, `@AGENTS.md\n\n${existing}`);
	return "updated";
}

interface McpJson {
	mcpServers?: Record<string, unknown>;
}

/** Adds the knowledge base to the repository's `.mcp.json` (other servers are kept). */
export function mergeMcpJson(root: string, kbName: string): FileOutcome {
	const file = join(root, ".mcp.json");
	const data = readJson<McpJson>(file, {});
	const servers = (data.mcpServers ??= {});
	const before = JSON.stringify(servers[kbName]);
	if (before === JSON.stringify(MCP_SERVER)) return "kept";
	servers[kbName] = MCP_SERVER;
	writeJson(file, data);
	return before === undefined ? "created" : "updated";
}
