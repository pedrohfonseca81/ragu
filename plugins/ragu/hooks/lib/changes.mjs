// Detects uncommitted changes in the configured systems and in the knowledge base,
// and maps changed code files back to the docs that cite them in `sources:`.
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { extname, join, relative } from "node:path";
import { resolveSource } from "./config.mjs";

/** Uncommitted (modified, added, untracked, renamed) paths relative to `repoDir`. */
export function gitChangedFiles(repoDir) {
	if (!existsSync(join(repoDir, ".git"))) return [];
	const res = spawnSync("git", ["status", "--porcelain", "--untracked-files=all"], {
		cwd: repoDir,
		encoding: "utf-8",
		timeout: 10_000,
	});
	if (res.status !== 0) return [];
	return parsePorcelain(res.stdout);
}

export function parsePorcelain(stdout) {
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

export function isCodeFile(path, hookConfig) {
	const segments = path.split("/");
	if (segments.some((s) => hookConfig.ignore.includes(s))) return false;
	return hookConfig.codeExtensions.includes(extname(path).toLowerCase());
}

/** @returns {{ systemId: string, files: string[] }[]} code changes per system */
export function codeChangesBySystem(config) {
	const out = [];
	for (const system of config.systems) {
		if (!existsSync(system.path)) continue;
		const files = gitChangedFiles(system.path).filter((f) => isCodeFile(f, config.hook));
		if (files.length) out.push({ systemId: system.id, path: system.path, files });
	}
	return out;
}

/** Changed markdown under docsDir or inbox/, relative to the KB root. */
export function docChanges(config) {
	const docsRel = relative(config.root, config.docsDir).replace(/\\/g, "/");
	return gitChangedFiles(config.root).filter(
		(f) => /\.mdx?$/.test(f) && (f.startsWith(`${docsRel}/`) || f.startsWith("inbox/")),
	);
}

/** Reads only the `sources:` list from a markdown file's frontmatter (no YAML dependency). */
export function readSources(markdown) {
	const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
	if (!fm) return [];
	const lines = fm[1].split(/\r?\n/);
	const sources = [];
	let inSources = false;
	for (const line of lines) {
		if (/^sources:\s*\[(.*)\]\s*$/.test(line)) {
			const inline = /^sources:\s*\[(.*)\]\s*$/.exec(line)[1].trim();
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
			if (item) sources.push(item[1].replace(/^['"]|['"]$/g, ""));
			else if (!/^\s/.test(line)) inSources = false;
		}
	}
	return sources;
}

/**
 * For every doc, checks whether any of its `sources:` points at a file that changed.
 * @param {ReturnType<typeof codeChangesBySystem>} changes
 * @returns {{ doc: string, hits: string[] }[]}
 */
export function staleDocs(config, changes, listDocs) {
	const changed = new Set();
	for (const c of changes) for (const f of c.files) changed.add(`${c.systemId}/${f}`);
	const result = [];
	for (const docPath of listDocs(config.docsDir)) {
		let markdown;
		try {
			markdown = readFileSync(docPath, "utf-8");
		} catch {
			continue;
		}
		const hits = [];
		for (const src of readSources(markdown)) {
			const r = resolveSource(src, config);
			if (r && changed.has(`${r.systemId}/${r.relPath}`)) hits.push(src);
		}
		if (hits.length) result.push({ doc: relative(config.docsDir, docPath).replace(/\\/g, "/"), hits });
	}
	return result;
}
