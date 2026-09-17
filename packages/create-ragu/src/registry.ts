// $XDG_CONFIG_HOME/ragu/knowledge-bases.json: the knowledge bases on this machine, so ragu-mcp
// can serve them from a directory none of them governs (a global MCP config).
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { readJson, writeJson } from "./fs.ts";
import type { RegistryOutcome, UserEnv } from "./types.ts";

interface RegistryEntry {
	name: string;
	config: string;
}

interface RegistryFile {
	knowledgeBases?: unknown[];
}

function isEntry(value: unknown): value is RegistryEntry {
	return typeof value === "object" && value !== null && "config" in value && typeof value.config === "string";
}

/** $XDG_CONFIG_HOME/ragu/knowledge-bases.json (ragu-mcp reads the same file). */
export function registryFile({ home = homedir(), env = process.env }: UserEnv = {}): string {
	const base = env.XDG_CONFIG_HOME ? resolve(env.XDG_CONFIG_HOME) : join(home, ".config");
	return join(base, "ragu", "knowledge-bases.json");
}

/** Records the knowledge base in the per-user registry, dropping entries whose config no longer exists. */
export function registerKnowledgeBase(configPath: string, name: string, userEnv: UserEnv = {}): RegistryOutcome {
	const file = registryFile(userEnv);
	const config = resolve(configPath);
	const data = readJson<RegistryFile>(file, {});
	const before = data.knowledgeBases ?? [];
	const alive = before.filter((e): e is RegistryEntry => isEntry(e) && existsSync(e.config));
	const existing = alive.find((e) => resolve(e.config) === config);

	let outcome: RegistryOutcome;
	if (!existing) {
		alive.push({ name, config });
		outcome = "registered";
	} else {
		outcome = existing.name === name ? "kept" : "updated";
		existing.name = name;
	}
	const pruned = alive.length !== before.length;
	if (outcome !== "kept" || pruned) writeJson(file, { ...data, knowledgeBases: alive });
	return outcome;
}
