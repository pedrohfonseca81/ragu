// The per-user registry of knowledge bases, written by `create-ragu install`, and the order in
// which a `ragu-mcp` started without --root decides what to serve.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { findConfigFor } from "./discovery.ts";
import type { Logger, RegistryEntry } from "./types.ts";

export interface RegistryOptions {
	home?: string;
	env?: NodeJS.ProcessEnv;
	log?: Logger;
}

/** $XDG_CONFIG_HOME/ragu/knowledge-bases.json, falling back to ~/.config. */
export function registryFile({ home = homedir(), env = process.env }: RegistryOptions = {}): string {
	const base = env.XDG_CONFIG_HOME ? resolve(env.XDG_CONFIG_HOME) : join(home, ".config");
	return join(base, "ragu", "knowledge-bases.json");
}

function isEntry(value: unknown): value is { name?: unknown; config: string } {
	return typeof value === "object" && value !== null && "config" in value && typeof value.config === "string";
}

function entriesOf(data: unknown): unknown[] {
	if (typeof data !== "object" || data === null || !("knowledgeBases" in data)) return [];
	return Array.isArray(data.knowledgeBases) ? data.knowledgeBases : [];
}

/** Registered knowledge bases whose config still exists; dead entries are reported through `log`. */
export function readRegistry({ home, env, log = () => {} }: RegistryOptions = {}): RegistryEntry[] {
	const file = registryFile({ home, env });
	if (!existsSync(file)) return [];
	let entries: unknown[];
	try {
		entries = entriesOf(JSON.parse(readFileSync(file, "utf-8")));
	} catch (e) {
		log(`ignoring ${file}: ${e instanceof Error ? e.message : String(e)}`);
		return [];
	}
	const alive: RegistryEntry[] = [];
	for (const entry of entries) {
		if (!isEntry(entry)) continue;
		const name = typeof entry.name === "string" ? entry.name : undefined;
		if (existsSync(entry.config)) alive.push({ name, config: resolve(entry.config) });
		else log(`registry entry ${name ?? entry.config} points at a missing ${entry.config}; run \`npx create-ragu install\` from a knowledge base to prune it`);
	}
	return alive;
}

/**
 * Which knowledge base(s) a `ragu-mcp` started with no `--root` should serve:
 *  1. the one governing `cwd`;
 *  2. the one governing `$PWD` (an MCP server launched by a global plugin may get the plugin
 *     directory as cwd while PWD still names the workspace the agent was opened in);
 *  3. every knowledge base in the per-user registry.
 * Returns config paths; empty when nothing applies.
 */
export function resolveConfigs(cwd: string, { env = process.env, home, log }: RegistryOptions = {}): string[] {
	const direct = findConfigFor(cwd, env);
	if (direct) return [direct];
	if (env.PWD && resolve(env.PWD) !== resolve(cwd)) {
		const fromPwd = findConfigFor(env.PWD, env);
		if (fromPwd) return [fromPwd];
	}
	return readRegistry({ env, home, log }).map((e) => e.config);
}
