// `create-ragu install`: connects code repositories to the knowledge base that governs cwd, and
// does the per-user part (registry entry, Antigravity plugin). Pure filesystem logic, no prompts.
import { existsSync } from "node:fs";
import { relative, resolve } from "node:path";
import { ensureClaudeInclude, injectAgentsMd, mergeMcpJson } from "./connect.ts";
import { installAntigravityPlugin, pluginLib } from "./plugin.ts";
import { registerKnowledgeBase } from "./registry.ts";
import type { ConnectedRepo, InstallResult, LoadedConfig, SystemSpec, UserEnv } from "./types.ts";

export async function findConfig(cwd: string): Promise<string | null> {
	return (await pluginLib()).findConfigFor(cwd);
}

export interface InstallOptions extends UserEnv {
	configPath: string;
	/** Empty means every configured system. */
	systemIds?: string[];
	/** Reinstall the Antigravity plugin even when the installed copy is not older. */
	force?: boolean;
}

interface RepoGroup {
	root: string | null;
	ids: string[];
	/** The missing path, when `root` is null. */
	path?: string;
}

/** Groups systems by git repository so a monorepo is connected once, at its root. */
function groupByRepository(systems: SystemSpec[], gitToplevel: (dir: string) => string | null): RepoGroup[] {
	const groups = new Map<string, RepoGroup>();
	for (const system of systems) {
		if (!existsSync(system.path)) {
			groups.set(`missing:${system.id}`, { root: null, ids: [system.id], path: system.path });
			continue;
		}
		const root = gitToplevel(system.path) ?? resolve(system.path);
		const group = groups.get(root) ?? { root, ids: [] };
		group.ids.push(system.id);
		groups.set(root, group);
	}
	return [...groups.values()];
}

function connect(group: RepoGroup, config: LoadedConfig): ConnectedRepo {
	if (group.root === null) return { ids: group.ids, root: null, error: `path not found: ${group.path}` };
	if (resolve(group.root) === resolve(config.root)) {
		return { ids: group.ids, root: group.root, error: "system lives inside the knowledge base repository; skipped" };
	}
	return {
		ids: group.ids,
		root: group.root,
		agents: injectAgentsMd(group.root, { kbRel: relative(group.root, config.root), kbName: config.name, systemIds: group.ids }),
		claude: ensureClaudeInclude(group.root),
		mcp: mergeMcpJson(group.root, config.name),
	};
}

/**
 * Connects the selected systems (all when `systemIds` is empty) and the knowledge base itself,
 * registers the knowledge base for this user and installs the Antigravity plugin when present.
 */
export async function install({ configPath, systemIds = [], force = false, home, env }: InstallOptions): Promise<InstallResult> {
	const lib = await pluginLib();
	const config = lib.loadConfig(configPath);
	const known = new Set(config.systems.map((s) => s.id));
	const unknown = systemIds.filter((id) => !known.has(id));
	if (unknown.length) {
		throw new Error(`unknown system(s): ${unknown.join(", ")} (configured: ${[...known].join(", ") || "none"})`);
	}
	const selected = systemIds.length ? config.systems.filter((s) => systemIds.includes(s.id)) : config.systems;

	return {
		targets: groupByRepository(selected, lib.gitToplevel).map((group) => connect(group, config)),
		kb: { root: config.root, mcp: mergeMcpJson(config.root, config.name) },
		registry: registerKnowledgeBase(configPath, config.name, { home, env }),
		antigravity: installAntigravityPlugin({ home, force }),
	};
}
