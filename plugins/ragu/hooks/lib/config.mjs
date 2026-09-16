// Minimal ragu.config.json loader for the hook. Mirrors template/scripts/lib/config.mjs
// (kept separate so the plugin has no dependency on the knowledge base's own scripts).
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export const DEFAULT_HOOK = {
	codeExtensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".py", ".ex", ".exs", ".go", ".rs", ".rb", ".java", ".kt", ".sql"],
	ignore: ["node_modules", "dist", "_build", "deps", ".git", ".agents", ".agent", ".claude", ".gemini"],
};

/** Walks up from `start` until a ragu.config.json is found. */
export function findConfigFile(start) {
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
export function gitToplevel(dir) {
	if (!existsSync(dir)) return null;
	const res = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: dir, encoding: "utf-8", timeout: 10_000 });
	if (res.status !== 0) return null;
	return resolve(res.stdout.trim());
}

function isInside(child, parent) {
	const rel = relative(parent, child);
	return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/**
 * Finds the knowledge base that governs `cwd`:
 *  1. `RAGU_CONFIG` env var, if set;
 *  2. a ragu.config.json in `cwd` or any ancestor;
 *  3. a ragu.config.json in an immediate child of `cwd` or any ancestor (the common
 *     "kb is a sibling of the code repos" layout), accepted only if `cwd` lies inside the
 *     knowledge base or inside one of its configured systems — or, for monorepos, if `cwd`
 *     is the git working tree that contains one of the systems.
 */
export function findConfigFor(cwd) {
	const start = resolve(cwd);
	if (process.env.RAGU_CONFIG && existsSync(process.env.RAGU_CONFIG)) return resolve(process.env.RAGU_CONFIG);
	const direct = findConfigFile(start);
	if (direct) return direct;

	let dir = start;
	for (;;) {
		let entries = [];
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			/* unreadable ancestor */
		}
		for (const entry of entries) {
			if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "node_modules") continue;
			const candidate = join(dir, entry.name, "ragu.config.json");
			if (!existsSync(candidate)) continue;
			try {
				const config = loadConfig(candidate);
				if (isInside(start, config.root) || config.systems.some((s) => isInside(start, s.path))) return candidate;
				if (config.systems.some((s) => isInside(s.path, start) && gitToplevel(start) === gitToplevel(s.path))) return candidate;
			} catch {
				/* invalid config; keep looking */
			}
		}
		const parent = dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
}

export function loadConfig(configPath) {
	const raw = JSON.parse(readFileSync(configPath, "utf-8"));
	const root = dirname(resolve(configPath));
	return {
		root,
		name: raw.name,
		docsDir: resolve(root, raw.docsDir ?? "src/content/docs"),
		systems: (raw.systems ?? []).map((s) => ({ id: s.id, path: resolve(root, s.path) })),
		hook: { ...DEFAULT_HOOK, ...(raw.hook ?? {}) },
	};
}

/** Resolves `<system-id>/<path>[:line]` to an absolute path, or null when the system is unknown. */
export function resolveSource(entry, config) {
	const m = /^([^/]+)\/(.+?)(?::(\d+)(?:-(\d+))?)?$/.exec(String(entry).trim());
	if (!m) return null;
	const [, systemId, relPath, line] = m;
	const system = config.systems.find((s) => s.id === systemId);
	if (!system) return null;
	return { systemId, relPath, line: line ? Number(line) : null, absPath: join(system.path, relPath) };
}
