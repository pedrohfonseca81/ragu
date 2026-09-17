// Finds the ragu.config.json that governs a directory. Same rules as the plugin's Stop hook
// (plugins/ragu/hooks/lib/config.mjs), kept separate so the package has no dependency on it.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { RaguConfigFile } from "./types.ts";

/** Walks up from `start` until a ragu.config.json is found. */
export function findConfigFile(start: string): string | null {
	let dir = resolve(start);
	for (;;) {
		const candidate = join(dir, "ragu.config.json");
		if (existsSync(candidate)) return candidate;
		const parent = dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
}

/** Absolute path of the git working tree that contains `dir`, or null. */
export function gitToplevel(dir: string): string | null {
	if (!existsSync(dir)) return null;
	const res = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: dir, encoding: "utf-8", timeout: 10_000 });
	return res.status === 0 ? resolve(res.stdout.trim()) : null;
}

function isInside(child: string, parent: string): boolean {
	const rel = relative(parent, child);
	return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/** Absolute system paths of the config at `configPath`, or null when it cannot be read. */
function systemPathsOf(configPath: string): string[] | null {
	try {
		const raw = JSON.parse(readFileSync(configPath, "utf-8")) as RaguConfigFile;
		const root = dirname(configPath);
		return (raw.systems ?? []).map((s) => resolve(root, s.path));
	} catch {
		return null;
	}
}

/** ragu.config.json files one level below `dir`, skipping dot directories and node_modules. */
function childConfigs(dir: string): string[] {
	let entries;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return [];
	}
	return entries
		.filter((e) => e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules")
		.map((e) => join(dir, e.name, "ragu.config.json"))
		.filter((candidate) => existsSync(candidate));
}

/**
 * Finds the knowledge base that governs `cwd`:
 *  1. `RAGU_CONFIG`, if set;
 *  2. a ragu.config.json in `cwd` or an ancestor;
 *  3. a ragu.config.json in an immediate child of `cwd` or an ancestor (sibling layout), when
 *     `cwd` is inside one of its systems, or is the git repository containing one (monorepo).
 */
export function findConfigFor(cwd: string, env: NodeJS.ProcessEnv = process.env): string | null {
	const start = resolve(cwd);
	if (env.RAGU_CONFIG && existsSync(env.RAGU_CONFIG)) return resolve(env.RAGU_CONFIG);
	const direct = findConfigFile(start);
	if (direct) return direct;

	for (let dir = start; ; dir = dirname(dir)) {
		for (const candidate of childConfigs(dir)) {
			const systems = systemPathsOf(candidate);
			if (!systems) continue;
			if (systems.some((s) => isInside(start, s))) return candidate;
			if (systems.some((s) => isInside(s, start) && gitToplevel(start) === gitToplevel(s))) return candidate;
		}
		if (dirname(dir) === dir) return null;
	}
}
