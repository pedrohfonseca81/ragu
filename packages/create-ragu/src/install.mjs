// `create-ragu install`: connects code repositories (and the knowledge base itself) to Ragu.
// Pure filesystem logic, no prompts, so it can be tested without a TTY.
//
// For every target repository it writes:
//   - AGENTS.md   a marked block (<!-- ragu:start --> … <!-- ragu:end -->) pointing at the
//                 knowledge base; created if missing, replaced in place when re-run
//   - CLAUDE.md   `@AGENTS.md` include (created or prepended)
//   - .mcp.json   Claude Code project MCP server `<kb-name>` → `npx -y ragu-mcp`
// Nothing harness-specific beyond that lands in a repository. Per user, on this machine, it also:
//   - registers the knowledge base in $XDG_CONFIG_HOME/ragu/knowledge-bases.json, which lets
//     `ragu-mcp` serve it when started from a directory it does not govern (a global MCP config)
//   - installs the agent plugin for Antigravity in ~/.gemini/config/plugins/ragu when Antigravity
//     is present (~/.gemini exists), like the Claude Code plugin is installed per user
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const BLOCK_START = "<!-- ragu:start -->";
export const BLOCK_END = "<!-- ragu:end -->";
const PLUGIN_SKIP = new Set(["test", "node_modules"]);

/** The packed copy (packages/create-ragu/plugin) wins; in the monorepo we use ../../plugins/ragu. */
export function pluginDir() {
	const packed = resolve(here, "..", "plugin");
	if (existsSync(join(packed, "plugin.json"))) return packed;
	const mono = resolve(here, "..", "..", "..", "plugins", "ragu");
	if (existsSync(join(mono, "plugin.json"))) return mono;
	throw new Error("ragu plugin directory not found");
}

/** The plugin's own config loader: same discovery rules as the Stop hook. */
async function pluginLib() {
	return import(pathToFileURL(join(pluginDir(), "hooks", "lib", "config.mjs")).href);
}

export async function findConfig(cwd) {
	const { findConfigFor } = await pluginLib();
	return findConfigFor(cwd);
}

export async function loadConfig(configPath) {
	const { loadConfig: load, gitToplevel } = await pluginLib();
	return { config: load(configPath), gitToplevel };
}

function pluginVersion(dir) {
	try {
		return JSON.parse(readFileSync(join(dir, "plugin.json"), "utf-8")).version ?? "0.0.0";
	} catch {
		return null;
	}
}

export function compareVersions(a, b) {
	const pa = String(a).split(".").map(Number);
	const pb = String(b).split(".").map(Number);
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		const d = (pa[i] ?? 0) - (pb[i] ?? 0);
		if (d) return Math.sign(d);
	}
	return 0;
}

function copyDir(src, dest) {
	mkdirSync(dest, { recursive: true });
	for (const entry of readdirSync(src)) {
		if (PLUGIN_SKIP.has(entry)) continue;
		const from = join(src, entry);
		const to = join(dest, entry);
		if (statSync(from).isDirectory()) copyDir(from, to);
		else cpSync(from, to);
	}
}

function readJson(file, fallback) {
	if (!existsSync(file)) return fallback;
	return JSON.parse(readFileSync(file, "utf-8"));
}

function writeJson(file, data) {
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

const MCP_SERVER = { command: "npx", args: ["-y", "ragu-mcp"] };
/** Server name inside the Antigravity plugin; Antigravity exposes it as `ragu_kb`. */
export const ANTIGRAVITY_MCP_NAME = "kb";

export function antigravityPluginDir(home = homedir()) {
	return join(home, ".gemini", "config", "plugins", "ragu");
}

/**
 * Installs the plugin for Antigravity, per user, in ~/.gemini/config/plugins/ragu (a customization
 * root Antigravity scans by itself). Skipped when Antigravity is not set up on this machine. The
 * copy is replaced only by a newer version (`force` overrides); mcp_config.json is always (re)written
 * and runs `ragu-mcp` with no arguments, which resolves the knowledge base from the workspace or
 * the registry.
 * @returns {"installed" | "updated" | "kept" | "skipped"}
 */
export function installAntigravityPlugin({ home = homedir(), force = false } = {}) {
	if (!existsSync(join(home, ".gemini"))) return "skipped";
	const src = pluginDir();
	const dest = antigravityPluginDir(home);
	const installed = existsSync(dest) ? pluginVersion(dest) : null;
	let outcome = "kept";
	if (installed === null || force || compareVersions(pluginVersion(src), installed) > 0) {
		copyDir(src, dest);
		outcome = installed === null ? "installed" : "updated";
	}
	writeJson(join(dest, "mcp_config.json"), { mcpServers: { [ANTIGRAVITY_MCP_NAME]: MCP_SERVER } });
	return outcome;
}

/** $XDG_CONFIG_HOME/ragu/knowledge-bases.json (ragu-mcp reads the same file). */
export function registryFile({ home = homedir(), env = process.env } = {}) {
	const base = env.XDG_CONFIG_HOME ? resolve(env.XDG_CONFIG_HOME) : join(home, ".config");
	return join(base, "ragu", "knowledge-bases.json");
}

/**
 * Records the knowledge base in the per-user registry. Entries whose config no longer exists are
 * dropped on the way.
 * @returns {"registered" | "updated" | "kept"}
 */
export function registerKnowledgeBase(configPath, name, opts = {}) {
	const file = registryFile(opts);
	const config = resolve(configPath);
	const data = readJson(file, {});
	const before = JSON.stringify(data.knowledgeBases ?? []);
	const entries = (data.knowledgeBases ?? []).filter((e) => e && typeof e.config === "string" && existsSync(e.config));
	const existing = entries.find((e) => resolve(e.config) === config);
	let outcome;
	if (!existing) {
		entries.push({ name, config });
		outcome = "registered";
	} else {
		outcome = existing.name === name ? "kept" : "updated";
		existing.name = name;
	}
	if (outcome === "kept" && JSON.stringify(entries) === before) return outcome;
	writeJson(file, { ...data, knowledgeBases: entries });
	return outcome;
}

export function agentsBlock({ kbRel, kbName, systemIds }) {
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
export function upsertBlock(existing, block) {
	if (existing == null) return `${block}\n`;
	const start = existing.indexOf(BLOCK_START);
	const end = existing.indexOf(BLOCK_END);
	if (start >= 0 && end > start) {
		return existing.slice(0, start) + block + existing.slice(end + BLOCK_END.length);
	}
	const sep = existing.length === 0 ? "" : existing.endsWith("\n\n") ? "" : existing.endsWith("\n") ? "\n" : "\n\n";
	return `${existing}${sep}${block}\n`;
}

export function injectAgentsMd(root, blockInput) {
	const file = join(root, "AGENTS.md");
	const existing = existsSync(file) ? readFileSync(file, "utf-8") : null;
	const next = upsertBlock(existing, agentsBlock(blockInput));
	if (next !== existing) writeFileSync(file, next);
	return existing === null ? "created" : next === existing ? "kept" : "updated";
}

/** Makes sure CLAUDE.md includes AGENTS.md (Claude Code reads `@file` includes). */
export function ensureClaudeInclude(root) {
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

/** Adds the knowledge base to the repository's Claude Code `.mcp.json` (other servers are kept). */
export function mergeMcpJson(root, kbName) {
	const file = join(root, ".mcp.json");
	const data = readJson(file, {});
	data.mcpServers ??= {};
	const before = JSON.stringify(data.mcpServers[kbName]);
	data.mcpServers[kbName] = MCP_SERVER;
	const after = JSON.stringify(data.mcpServers[kbName]);
	if (before === after) return "kept";
	writeJson(file, data);
	return before === undefined ? "created" : "updated";
}

/**
 * Connects the selected systems (all when `systemIds` is empty) and the knowledge base itself,
 * then does the per-user part: registry entry and, when present, the Antigravity plugin.
 * Systems that share one git repository (monorepo) are connected once, at the repository root.
 * @returns {{ kb: object, targets: object[], registry: string, antigravity: string }}
 */
export async function install({ configPath, systemIds = [], force = false, home = homedir(), env = process.env }) {
	const { config, gitToplevel } = await loadConfig(configPath);
	const unknown = systemIds.filter((id) => !config.systems.some((s) => s.id === id));
	if (unknown.length) throw new Error(`unknown system(s): ${unknown.join(", ")} (configured: ${config.systems.map((s) => s.id).join(", ") || "none"})`);
	const selected = systemIds.length ? config.systems.filter((s) => systemIds.includes(s.id)) : config.systems;

	// Group by repository root.
	const groups = new Map();
	for (const s of selected) {
		if (!existsSync(s.path)) {
			groups.set(`missing:${s.id}`, { root: null, ids: [s.id], path: s.path });
			continue;
		}
		const root = gitToplevel(s.path) ?? resolve(s.path);
		if (!groups.has(root)) groups.set(root, { root, ids: [] });
		groups.get(root).ids.push(s.id);
	}

	const targets = [];
	for (const g of groups.values()) {
		if (!g.root) {
			targets.push({ ids: g.ids, root: null, error: `path not found: ${g.path}` });
			continue;
		}
		if (resolve(g.root) === resolve(config.root)) {
			// A system whose git root is the knowledge base itself: nothing to connect.
			targets.push({ ids: g.ids, root: g.root, error: "system lives inside the knowledge base repository; skipped" });
			continue;
		}
		targets.push({
			ids: g.ids,
			root: g.root,
			agents: injectAgentsMd(g.root, { kbRel: relative(g.root, config.root), kbName: config.name, systemIds: g.ids }),
			claude: ensureClaudeInclude(g.root),
			mcp: mergeMcpJson(g.root, config.name),
		});
	}

	const kb = { root: config.root, mcp: mergeMcpJson(config.root, config.name) };
	const registry = registerKnowledgeBase(configPath, config.name, { home, env });
	const antigravity = installAntigravityPlugin({ home, force });
	return { kb, targets, registry, antigravity };
}
