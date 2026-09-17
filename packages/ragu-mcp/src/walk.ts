import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** Recursively lists .md/.mdx files under `dir`, sorted for stable output. */
export function walkMarkdown(dir: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) files.push(...walkMarkdown(full));
		else if (entry.endsWith(".md") || entry.endsWith(".mdx")) files.push(full);
	}
	return files.sort();
}
