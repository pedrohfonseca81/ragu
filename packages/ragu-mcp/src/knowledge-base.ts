// Loads one or several knowledge bases into memory and searches them (MiniSearch, lexical).
import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import matter from "gray-matter";
import MiniSearch from "minisearch";
import { walkMarkdown } from "./walk.ts";
import type { Doc, DocSummary, KnowledgeBase, RaguConfigFile, SearchOptions, SearchResult } from "./types.ts";

export type Index = MiniSearch<Doc>;

const OUTDATED_WARNING = "⚠️ status: outdated. This document is known to diverge from the current code. Check the sources before trusting it.";

/** Frontmatter fields a page may carry; everything is optional because pages are user-written. */
interface Frontmatter {
	title?: unknown;
	domain?: unknown;
	systems?: unknown;
	status?: unknown;
	updated_at?: unknown;
}

function asString(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}

function asStringList(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function asIsoDate(value: unknown): string | null {
	if (value instanceof Date) return value.toISOString().slice(0, 10);
	if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString().slice(0, 10);
	return null;
}

function readDoc(file: string, docsDir: string): Doc {
	const { data, content } = matter(readFileSync(file, "utf-8"));
	const fm = data as Frontmatter;
	const path = relative(docsDir, file).replace(/\\/g, "/");
	return {
		id: path,
		path,
		title: asString(fm.title) ?? path,
		domain: asString(fm.domain),
		systems: asStringList(fm.systems),
		status: asString(fm.status) ?? "unverified",
		updated_at: asIsoDate(fm.updated_at),
		content: content.trim(),
	};
}

/** Reads one knowledge base: its config and every page under its docs directory. */
export function loadDocs(configPath: string): KnowledgeBase {
	const raw = JSON.parse(readFileSync(configPath, "utf-8")) as RaguConfigFile;
	const root = dirname(resolve(configPath));
	const docsDir = resolve(root, raw.docsDir ?? "src/content/docs");
	return {
		name: raw.name,
		title: raw.title,
		systems: (raw.systems ?? []).map((s) => s.id),
		docsDir,
		docs: walkMarkdown(docsDir).map((file) => readDoc(file, docsDir)),
	};
}

/**
 * One knowledge base, or several merged into one index. With several, every document carries
 * `kb` (the knowledge base's name) and ids are `<kb>:<path>` so equal paths don't collide.
 */
export function loadKnowledgeBases(configPaths: string | string[]): KnowledgeBase {
	const paths = ([] as string[]).concat(configPaths);
	const first = paths[0];
	if (paths.length === 1 && first !== undefined) return loadDocs(first);
	const kbs = paths.map(loadDocs);
	const names = kbs.map((k, i) => k.name ?? `kb${i + 1}`);
	return {
		name: "ragu",
		title: `knowledge bases ${names.join(", ")}`,
		names,
		systems: [...new Set(kbs.flatMap((k) => k.systems))],
		docsDirs: kbs.flatMap((k) => (k.docsDir ? [k.docsDir] : [])),
		docs: kbs.flatMap((k, i) => {
			const kb = names[i] ?? `kb${i + 1}`;
			return k.docs.map((d) => ({ ...d, kb, id: `${kb}:${d.path}` }));
		}),
	};
}

export function buildIndex(docs: Doc[]): Index {
	const index = new MiniSearch<Doc>({
		fields: ["title", "content", "domain", "path"],
		storeFields: ["id"],
		idField: "id",
		searchOptions: {
			boost: { title: 3, domain: 2, path: 1.5 },
			fuzzy: 0.2,
			prefix: true,
			combineWith: "OR",
		},
	});
	index.addAll(docs);
	return index;
}

export function statusWarning(status: string): string | undefined {
	return status === "outdated" ? OUTDATED_WARNING : undefined;
}

export function docSummary(d: Doc): DocSummary {
	return {
		...(d.kb !== undefined ? { kb: d.kb } : {}),
		path: d.path,
		title: d.title,
		domain: d.domain,
		systems: d.systems,
		status: d.status,
		updated_at: d.updated_at,
	};
}

function matches(doc: Doc, { kb, systems, domain, status }: SearchOptions): boolean {
	if (kb && doc.kb !== kb) return false;
	if (systems?.length && !doc.systems.some((s) => systems.includes(s))) return false;
	if (domain && doc.domain !== domain) return false;
	if (status?.length && !status.includes(doc.status)) return false;
	return true;
}

/** Pure search over an in-memory knowledge base. */
export function searchDocs(kb: KnowledgeBase, index: Index, options: SearchOptions): SearchResult[] {
	const limit = options.topK ?? 5;
	const byId = new Map(kb.docs.map((d) => [d.id, d]));
	const results: SearchResult[] = [];
	for (const hit of index.search(options.query)) {
		const doc = byId.get(String(hit.id));
		if (!doc || !matches(doc, options)) continue;
		const warning = statusWarning(doc.status);
		results.push({
			...docSummary(doc),
			score: Number(hit.score.toFixed(3)),
			...(warning ? { warning } : {}),
			content: doc.content,
		});
		if (results.length >= limit) break;
	}
	return results;
}
