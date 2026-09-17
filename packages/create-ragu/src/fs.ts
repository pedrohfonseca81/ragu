import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export function readJson<T>(file: string, fallback: T): T {
	if (!existsSync(file)) return fallback;
	return JSON.parse(readFileSync(file, "utf-8")) as T;
}

export function writeJson(file: string, data: unknown): void {
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

/** Reads a JSON file, lets `edit` mutate it, writes it back. */
export function editJson<T>(file: string, edit: (data: T) => void): void {
	const data = JSON.parse(readFileSync(file, "utf-8")) as T;
	edit(data);
	writeJson(file, data);
}

export interface CopyOptions {
	/** Entry names to skip at any depth. */
	skip?: ReadonlySet<string>;
	/** Extra predicate on entry names to skip. */
	skipIf?: (name: string) => boolean;
	/** Renames an entry on the way (e.g. `_gitignore` → `.gitignore`). */
	rename?: (name: string) => string;
}

/** Recursive copy with per-entry filtering and renaming. */
export function copyDir(src: string, dest: string, { skip = new Set(), skipIf = () => false, rename = (n) => n }: CopyOptions = {}): void {
	mkdirSync(dest, { recursive: true });
	for (const entry of readdirSync(src)) {
		if (skip.has(entry) || skipIf(entry)) continue;
		const from = join(src, entry);
		const to = join(dest, rename(entry));
		if (statSync(from).isDirectory()) copyDir(from, to, { skip, skipIf, rename });
		else cpSync(from, to);
	}
}

export function isEmptyDir(dir: string): boolean {
	try {
		return readdirSync(dir).length === 0;
	} catch {
		return false;
	}
}
