// The agent plugin shipped with this package (plugins/ragu in the monorepo, ./plugin when packed)
// and its per-user installation for Antigravity.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { copyDir, writeJson } from "./fs.ts";
import type { LoadedConfig, PluginOutcome } from "./types.ts";

const here = dirname(fileURLToPath(import.meta.url));

/** The MCP server every generated config points at: `npx -y ragu-mcp`, no path. */
export const MCP_SERVER = { command: "npx", args: ["-y", "ragu-mcp"] } as const;
/** Server name inside the Antigravity plugin; Antigravity exposes it as `ragu_kb`. */
export const ANTIGRAVITY_MCP_NAME = "kb";

/** The packed copy (./plugin) wins; in the monorepo we use ../../plugins/ragu. */
export function pluginDir(): string {
	for (const candidate of [resolve(here, "..", "plugin"), resolve(here, "..", "..", "..", "plugins", "ragu")]) {
		if (existsSync(join(candidate, "plugin.json"))) return candidate;
	}
	throw new Error("ragu plugin directory not found");
}

/** The plugin's own config loader, so `install` finds and reads ragu.config.json exactly like the Stop hook. */
interface PluginLib {
	findConfigFor(cwd: string): string | null;
	loadConfig(configPath: string): LoadedConfig;
	gitToplevel(dir: string): string | null;
}

export async function pluginLib(): Promise<PluginLib> {
	return (await import(pathToFileURL(join(pluginDir(), "hooks", "lib", "config.mjs")).href)) as PluginLib;
}

type Version = [major: number, minor: number, patch: number];

function parseVersion(version: string): Version {
	const [major = 0, minor = 0, patch = 0] = version.split(".").map(Number);
	return [major, minor, patch];
}

/** Semver-style comparison of "x.y.z" strings: -1, 0 or 1. Missing parts count as 0. */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
	const va = parseVersion(a);
	const vb = parseVersion(b);
	for (let i = 0; i < 3; i++) {
		const x = va[i] ?? 0;
		const y = vb[i] ?? 0;
		if (x !== y) return x < y ? -1 : 1;
	}
	return 0;
}

function pluginVersion(dir: string): string | null {
	try {
		const manifest = JSON.parse(readFileSync(join(dir, "plugin.json"), "utf-8")) as { version?: string };
		return manifest.version ?? "0.0.0";
	} catch {
		return null;
	}
}

export function antigravityPluginDir(home: string = homedir()): string {
	return join(home, ".gemini", "config", "plugins", "ragu");
}

export interface AntigravityInstallOptions {
	home?: string;
	force?: boolean;
}

/**
 * Installs the plugin for Antigravity, per user, in ~/.gemini/config/plugins/ragu (a customization
 * root Antigravity scans by itself). Skipped when Antigravity is not set up on this machine. The
 * copy is replaced only by a newer version (`force` overrides); mcp_config.json is always (re)written
 * and runs `ragu-mcp` with no arguments, which resolves the knowledge base from the workspace or
 * the registry.
 */
export function installAntigravityPlugin({ home = homedir(), force = false }: AntigravityInstallOptions = {}): PluginOutcome {
	if (!existsSync(join(home, ".gemini"))) return "skipped";
	const src = pluginDir();
	const dest = antigravityPluginDir(home);
	const installed = existsSync(dest) ? pluginVersion(dest) : null;
	const shouldCopy = installed === null || force || compareVersions(pluginVersion(src) ?? "0.0.0", installed) > 0;
	if (shouldCopy) copyDir(src, dest, { skip: new Set(["test", "node_modules"]) });
	writeJson(join(dest, "mcp_config.json"), { mcpServers: { [ANTIGRAVITY_MCP_NAME]: MCP_SERVER } });
	if (!shouldCopy) return "kept";
	return installed === null ? "installed" : "updated";
}
