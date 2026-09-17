// @ts-check
// Minimal ragu.config.json loader for the hook. Mirrors template/scripts/lib/config.mjs
// (kept separate so the plugin has no dependency on the knowledge base's own scripts).
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

/**
 * @typedef {object} SystemSpec
 * @property {string} id
 * @property {string} path  Absolute.
 *
 * @typedef {object} HookConfig
 * @property {string[]} codeExtensions
 * @property {string[]} ignore
 *
 * @typedef {object} RaguConfig  ragu.config.json with absolute paths and defaults applied.
 * @property {string} root
 * @property {string} name
 * @property {string} docsDir
 * @property {SystemSpec[]} systems
 * @property {HookConfig} hook
 *
 * @typedef {object} ResolvedSource  A `sources:` entry resolved against the config.
 * @property {string} systemId
 * @property {string} relPath
 * @property {number | null} line
 * @property {string} absPath
 */

/** @type {HookConfig} */
export const DEFAULT_HOOK = {
	codeExtensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".py", ".ex", ".exs", ".go", ".rs", ".rb", ".java", ".kt", ".sql"],
	ignore: ["node_modules", "dist", "_build", "deps", ".git", ".agents", ".agent", ".claude", ".gemini"],
};

/**
 * Walks up from `start` until a ragu.config.json is found.
 * @param {string} start
 * @returns {string | null}
 */
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

/**
 * Absolute path of the git working tree that contains `dir`, or null.
 * @param {string} dir
 * @returns {string | null}
 */
export function gitToplevel(dir) {
	if (!existsSync(dir)) return null;
	const res = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: dir, encoding: "utf-8", timeout: 10_000 });
	if (res.status !== 0) return null;
	return resolve(res.stdout.trim());
}

/**
 * Absolute path of the repository's common `.git` directory. Linked worktrees created with
 * `git worktree add` share it with the main working tree, which is how we tell that two
 * directories are checkouts of the same repository. Null outside a repository.
 * @param {string} dir
 * @returns {string | null}
 */
export function gitCommonDir(dir) {
	if (!existsSync(dir)) return null;
	const res = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
		cwd: dir,
		encoding: "utf-8",
		timeout: 10_000,
	});
	if (res.status !== 0) return null;
	return resolve(dir, res.stdout.trim());
}

/**
 * Absolute path of the main working tree of the repository containing `dir`, or null.
 * @param {string} dir
 * @returns {string | null}
 */
export function gitMainWorktree(dir) {
	if (!existsSync(dir)) return null;
	const res = spawnSync("git", ["worktree", "list", "--porcelain"], { cwd: dir, encoding: "utf-8", timeout: 10_000 });
	if (res.status !== 0) return null;
	const first = res.stdout.split("\n").find((l) => l.startsWith("worktree "));
	return first ? resolve(first.slice("worktree ".length)) : null;
}

/**
 * True when `a` and `b` are checkouts (main or linked worktree) of the same repository.
 * @param {string} a
 * @param {string} b
 */
export function sameRepo(a, b) {
	const ca = gitCommonDir(a);
	return ca != null && ca === gitCommonDir(b);
}

/**
 * The system paths that apply when working from `cwd`. When `cwd` is inside a linked git
 * worktree of a system's repository, that system's path is redirected to the worktree so the
 * hook inspects the checkout actually being edited instead of the main working tree.
 * @param {RaguConfig} config
 * @param {string} cwd
 * @returns {RaguConfig}
 */
export function forWorkingTree(config, cwd) {
	const top = gitToplevel(cwd);
	if (!top) return config;
	const systems = config.systems.map((s) => {
		const sTop = gitToplevel(s.path);
		if (!sTop || sTop === top || !sameRepo(top, s.path)) return s;
		return { ...s, path: join(top, relative(sTop, s.path)) };
	});
	return { ...config, systems };
}

/**
 * @param {string} child
 * @param {string} parent
 */
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
 *     knowledge base or inside one of its configured systems; if `cwd` is a linked git
 *     worktree of one of the systems; or if `cwd` is the workspace that contains both the
 *     knowledge base and at least one of its systems (sibling layout or monorepo root).
 * @param {string} cwd
 * @returns {string | null}
 */
export function findConfigFor(cwd) {
	const start = resolve(cwd);
	if (process.env.RAGU_CONFIG && existsSync(process.env.RAGU_CONFIG)) return resolve(process.env.RAGU_CONFIG);
	const direct = findConfigFile(start);
	if (direct) return direct;

	let dir = start;
	for (;;) {
		/** @type {import("node:fs").Dirent[]} */
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
				if (config.systems.some((s) => isInside(s.path, start))) return candidate;
				if (config.systems.some((s) => sameRepo(start, s.path))) return candidate;
			} catch {
				/* invalid config; keep looking */
			}
		}
		const parent = dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
}

/**
 * @param {string} configPath
 * @returns {RaguConfig}
 */
export function loadConfig(configPath) {
	/** @type {{ name?: string, docsDir?: string, systems?: { id: string, path: string }[], hook?: Partial<HookConfig> }} */
	const raw = JSON.parse(readFileSync(configPath, "utf-8"));
	const root = dirname(resolve(configPath));
	// Relative system paths are meant from the kb's main working tree. When the config is read
	// from a linked worktree of the kb (e.g. .claude/worktrees/<branch>/), `../api` would land
	// inside the worktree; resolve it from the equivalent spot in the main tree instead.
	const systemsBase = mainTreeEquivalent(root);
	return {
		root,
		name: raw.name ?? "",
		docsDir: resolve(root, raw.docsDir ?? "src/content/docs"),
		systems: (raw.systems ?? []).map((s) => ({ id: s.id, path: resolve(systemsBase, s.path) })),
		hook: { ...DEFAULT_HOOK, ...(raw.hook ?? {}) },
	};
}

/** @param {string} dir */
function mainTreeEquivalent(dir) {
	const top = gitToplevel(dir);
	if (!top) return dir;
	const main = gitMainWorktree(dir);
	if (!main || main === top) return dir;
	return join(main, relative(top, dir));
}

/**
 * Resolves `<system-id>/<path>[:line]` to an absolute path, or null when the system is unknown.
 * @param {string} entry
 * @param {RaguConfig} config
 * @returns {ResolvedSource | null}
 */
export function resolveSource(entry, config) {
	const m = /^([^/]+)\/(.+?)(?::(\d+)(?:-(\d+))?)?$/.exec(String(entry).trim());
	if (!m) return null;
	const [, systemId = "", relPath = "", line] = m;
	const system = config.systems.find((s) => s.id === systemId);
	if (!system) return null;
	return { systemId, relPath, line: line ? Number(line) : null, absPath: join(system.path, relPath) };
}
