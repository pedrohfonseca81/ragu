// @ts-check
// Remark plugin: rewrites relative `.md` links (the form Obsidian and GitHub understand)
// into Starlight routes at build time, so one link syntax works everywhere.
//   ../domain/order-cancellation.md      -> /domain/order-cancellation/
//   ./glossary.md#term                   -> /glossary/#term
//   ../index.md                          -> /
import { dirname, relative, resolve } from "node:path";
import { visit } from "unist-util-visit";

/**
 * @param {{ docsDir: string, base?: string }} options
 * @returns {(tree: import("mdast").Root, file: { path?: string }) => void}
 */
export default function remarkMdLinks({ docsDir, base = "/" }) {
	const prefix = base.endsWith("/") ? base : `${base}/`;
	return (tree, file) => {
		if (!file.path) return;
		const filePath = file.path;
		visit(tree, "link", (node) => {
			const url = node.url ?? "";
			if (/^[a-z]+:/i.test(url) || url.startsWith("/") || url.startsWith("#")) return;
			const [pathPart = "", hash] = url.split("#");
			if (!pathPart.endsWith(".md")) return;
			const target = resolve(dirname(filePath), pathPart);
			let route = relative(docsDir, target).replace(/\\/g, "/").replace(/\.md$/, "");
			if (route.startsWith("..")) return; // outside the docs dir; leave as-is (check.mjs reports it)
			if (route === "index") route = "";
			else route = route.replace(/\/index$/, "");
			node.url = `${prefix}${route}${route ? "/" : ""}${hash ? `#${hash}` : ""}`;
		});
	};
}
