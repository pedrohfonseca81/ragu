// @ts-check
// Builds the sitemap that starlight-site-graph renders as the page graph: one node per page, one edge per
// relative `.md` link, resolved the same way remark-md-links.mjs resolves them for the site. The plugin's own
// generator does not understand `.md` links, so it is bypassed with `sitemapConfig.sitemap`.
import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { walkMarkdown } from "./walk.mjs";

/**
 * @typedef {{ external: boolean, exists: boolean, title: string, links?: string[], backlinks?: string[] }} SitemapEntry
 */

/**
 * Route of a docs file, in the form the plugin uses as key: `domain/order-cancellation/`, root is `/`.
 * @param {string} docsDir
 * @param {string} filePath
 */
function routeOf(docsDir, filePath) {
	let route = relative(docsDir, filePath).replace(/\\/g, "/").replace(/\.mdx?$/, "");
	if (route === "index") route = "";
	else route = route.replace(/\/index$/, "");
	return route ? `${route}/` : "/";
}

/** @param {string} text */
function titleOf(text) {
	const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? "";
	const title = /^title:\s*(.+)$/m.exec(fm)?.[1] ?? "";
	return title.trim().replace(/^['"]|['"]$/g, "");
}

/**
 * @param {string} docsDir  Absolute path to the docs directory.
 * @returns {Record<string, SitemapEntry>}
 */
export function buildSiteGraphSitemap(docsDir) {
	/** @type {Record<string, SitemapEntry>} */
	const sitemap = {};
	/** @type {Map<string, Set<string>>} */
	const backlinks = new Map();
	const files = walkMarkdown(docsDir);

	for (const file of files) {
		const route = routeOf(docsDir, file);
		const text = readFileSync(file, "utf-8");
		const links = new Set();
		for (const m of text.matchAll(/\]\(([^)\s]+?\.md)(?:#[^)]*)?\)/g)) {
			const href = m[1] ?? "";
			if (!href || /^[a-z]+:/i.test(href) || href.startsWith("/")) continue;
			const target = resolve(dirname(file), href);
			if (relative(docsDir, target).startsWith("..")) continue;
			const to = routeOf(docsDir, target);
			if (to === route) continue;
			links.add(to);
			if (!backlinks.has(to)) backlinks.set(to, new Set());
			backlinks.get(to)?.add(route);
		}
		sitemap[route] = {
			external: false,
			exists: true,
			title: titleOf(text) || route.replace(/\/$/, "").split("/").pop() || "Overview",
			links: [...links],
		};
	}
	for (const [route, from] of backlinks) {
		if (sitemap[route]) sitemap[route].backlinks = [...from];
	}
	return sitemap;
}
