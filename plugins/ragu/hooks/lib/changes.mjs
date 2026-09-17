// @ts-check
// Detects uncommitted changes in the configured systems and in the knowledge base,
// and maps changed code files back to the docs that cite them in `sources:`.
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { extname, join, relative } from "node:path";
import { gitToplevel, resolveSource } from "./config.mjs";

/** @typedef {import("./config.mjs").RaguConfig} RaguConfig */
/** @typedef {import("./config.mjs").HookConfig} HookConfig */

/**
 * @typedef {object} SystemChanges  Uncommitted code files of one system, relative to its path.
 * @property {string} systemId
 * @property {string} path
 * @property {string[]} files
 *
 * @typedef {object} StaleDoc  A page whose `sources:` cite changed files.
 * @property {string} doc  Relative to docsDir.
 * @property {string[]} hits  The citing `sources:` entries.
 */

/**
 * Uncommitted (modified, added, untracked, renamed) paths under `repoDir`, relative to it.
 * `repoDir` may be a subdirectory of the repository (monorepo layouts).
 * @param {string} repoDir
 * @returns {string[]}
 */
export function gitChangedFiles(repoDir) {
	const top = gitToplevel(repoDir);
	if (!top) return [];
	const res = spawnSync("git", ["status", "--porcelain", "--untracked-files=all", "--", "."], {
		cwd: repoDir,
		encoding: "utf-8",
		timeout: 10_000,
	});
	if (res.status !== 0) return [];
	// porcelain paths are relative to the repository root, not to cwd
	return parsePorcelain(res.stdout).map((p) => relative(repoDir, join(top, p)).replace(/\\/g, "/"));
}

/**
 * @param {string} stdout
 * @returns {string[]}
 */
export function parsePorcelain(stdout) {
	/** @type {string[]} */
	const files = [];
	for (const line of stdout.split("\n")) {
		if (line.length < 4) continue;
		let path = line.slice(3);
		// "R  old -> new" / "C  old -> new": the new path is what matters.
		const arrow = path.indexOf(" -> ");
		if (arrow >= 0) path = path.slice(arrow + 4);
		if (path.startsWith('"') && path.endsWith('"')) path = path.slice(1, -1);
		files.push(path);
	}
	return files;
}

/**
 * @param {string} path
 * @param {HookConfig} hookConfig
 */
export function isCodeFile(path, hookConfig) {
	const segments = path.split("/");
	if (segments.some((s) => hookConfig.ignore.includes(s))) return false;
	return hookConfig.codeExtensions.includes(extname(path).toLowerCase());
}

/**
 * Code changes per system.
 * @param {RaguConfig} config
 * @returns {SystemChanges[]}
 */
export function codeChangesBySystem(config) {
	/** @type {SystemChanges[]} */
	const out = [];
	for (const system of config.systems) {
		if (!existsSync(system.path)) continue;
		const files = gitChangedFiles(system.path).filter((f) => isCodeFile(f, config.hook));
		if (files.length) out.push({ systemId: system.id, path: system.path, files });
	}
	return out;
}

/**
 * Changed markdown under docsDir or inbox/, relative to the KB root.
 * @param {RaguConfig} config
 * @returns {string[]}
 */
export function docChanges(config) {
	const docsRel = relative(config.root, config.docsDir).replace(/\\/g, "/");
	return gitChangedFiles(config.root).filter(
		(f) => /\.mdx?$/.test(f) && (f.startsWith(`${docsRel}/`) || f.startsWith("inbox/")),
	);
}

/**
 * Reads only the `sources:` list from a markdown file's frontmatter (no YAML dependency).
 * @param {string} markdown
 * @returns {string[]}
 */
export function readSources(markdown) {
	const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
	if (!fm) return [];
	const lines = (fm[1] ?? "").split(/\r?\n/);
	/** @type {string[]} */
	const sources = [];
	let inSources = false;
	for (const line of lines) {
		const inlineList = /^sources:\s*\[(.*)\]\s*$/.exec(line);
		if (inlineList) {
			const inline = (inlineList[1] ?? "").trim();
			if (inline) sources.push(...inline.split(",").map((s) => s.trim().replace(/^['"]|['"]$/g, "")));
			inSources = false;
			continue;
		}
		if (/^sources:\s*$/.test(line)) {
			inSources = true;
			continue;
		}
		if (inSources) {
			const item = /^\s+-\s+(.+?)\s*$/.exec(line);
			if (item) sources.push((item[1] ?? "").replace(/^['"]|['"]$/g, ""));
			else if (!/^\s/.test(line)) inSources = false;
		}
	}
	return sources;
}

/**
 * For every doc, checks whether any of its `sources:` points at a file that changed.
 * @param {RaguConfig} config
 * @param {SystemChanges[]} changes
 * @param {(dir: string) => string[]} listDocs
 * @returns {StaleDoc[]}
 */
export function staleDocs(config, changes, listDocs) {
	const changed = new Set(changes.flatMap((c) => c.files.map((f) => `${c.systemId}/${f}`)));
	/** @type {StaleDoc[]} */
	const result = [];
	for (const docPath of listDocs(config.docsDir)) {
		/** @type {string} */
		let markdown;
		try {
			markdown = readFileSync(docPath, "utf-8");
		} catch {
			continue;
		}
		/** @type {string[]} */
		const hits = [];
		for (const src of readSources(markdown)) {
			const r = resolveSource(src, config);
			if (r && changed.has(`${r.systemId}/${r.relPath}`)) hits.push(src);
		}
		if (hits.length) result.push({ doc: relative(config.docsDir, docPath).replace(/\\/g, "/"), hits });
	}
	return result;
}
