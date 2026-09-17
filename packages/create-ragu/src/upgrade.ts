// `create-ragu upgrade`: refreshes the scaffold-owned layer of an existing knowledge base (site theme
// and config, validation scripts, agent contract, toolchain versions) from the packaged template.
// Content is never touched: src/content/docs, ragu.config.json, inbox/, templates/, README.md.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { editJson, readJson } from "./fs.ts";
import { REMOTE_ONLY_DEPS, REMOTE_ONLY_DEV_DEPS, REMOTE_ONLY_FILES, REMOTE_ONLY_SCRIPTS, stripRemoteFromAstroConfig, templateDir } from "./scaffold.ts";
import type { FileOutcome } from "./types.ts";

/** Files and directories the template owns; each is copied over what the knowledge base has. */
const OWNED = ["astro.config.mjs", "tsconfig.json", "AGENTS.md", "CLAUDE.md", "scripts", "public", "src/styles", "src/components", "src/pages", "src/assets", "src/content.config.ts", ".github/workflows/ci.yml"];
/** Owned only when the remote worker is configured. */
const OWNED_REMOTE = ["src/worker", "src/wasm-stub.js", ".github/workflows/reindex.yml"];
/** Files earlier templates shipped and the current one replaced, by sha256 so a user's own file of that name stays. */
const RETIRED: Record<string, string> = {
	"public/favicon.svg": "be2b36f0928e1d7f3b57f5dcbb3e726b707ce95b6a6570abaa9322fc3765b09c",
};

export interface UpgradeOptions {
	configPath: string;
	dryRun?: boolean;
}

export interface UpgradedFile {
	path: string;
	outcome: FileOutcome | "removed";
}

export interface UpgradeResult {
	root: string;
	remote: boolean;
	files: UpgradedFile[];
	/** package.json dependencies or scripts changed: `npm install` is due. */
	packageChanged: boolean;
}

interface PackageJson {
	scripts?: Record<string, string>;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
}

function sha256(file: string): string {
	return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function sameContent(a: string, b: string): boolean {
	return existsSync(a) && existsSync(b) && readFileSync(a).equals(readFileSync(b));
}

/** Copies one file or directory from the template, recording what changed. */
function refresh(from: string, to: string, root: string, files: UpgradedFile[], dryRun: boolean, transform?: (source: string) => string): void {
	if (!existsSync(from)) return;
	if (statSync(from).isDirectory()) {
		for (const entry of readdirSync(from)) {
			if (entry.endsWith(".generated.json")) continue;
			refresh(join(from, entry), join(to, entry), root, files, dryRun, transform);
		}
		return;
	}
	const path = relative(root, to);
	const content = transform ? transform(readFileSync(from, "utf-8")) : null;
	const same = content === null ? sameContent(from, to) : existsSync(to) && readFileSync(to, "utf-8") === content;
	if (same) {
		files.push({ path, outcome: "kept" });
		return;
	}
	files.push({ path, outcome: existsSync(to) ? "updated" : "created" });
	if (dryRun) return;
	mkdirSync(dirname(to), { recursive: true });
	writeFileSync(to, content ?? readFileSync(from));
}

/** Template versions win for the toolchain; scripts and dependencies the user added stay. */
function mergePackageJson(templatePkg: PackageJson, pkg: PackageJson, remote: boolean): boolean {
	let changed = false;
	const skipDeps = new Set(remote ? [] : [...REMOTE_ONLY_DEPS, ...REMOTE_ONLY_DEV_DEPS]);
	// Without the remote worker, scaffold() replaces the template's prebuild (which also generates the worker data).
	const skipScripts = new Set(remote ? [] : [...REMOTE_ONLY_SCRIPTS, "prebuild"]);
	for (const field of ["dependencies", "devDependencies"] as const) {
		const target = (pkg[field] ??= {});
		for (const [name, version] of Object.entries(templatePkg[field] ?? {})) {
			if (skipDeps.has(name) || target[name] === version) continue;
			target[name] = version;
			changed = true;
		}
	}
	const scripts = (pkg.scripts ??= {});
	for (const [name, command] of Object.entries(templatePkg.scripts ?? {})) {
		if (skipScripts.has(name) || scripts[name] === command) continue;
		scripts[name] = command;
		changed = true;
	}
	if (!remote && scripts.prebuild !== "npm run check") {
		scripts.prebuild = "npm run check";
		changed = true;
	}
	return changed;
}

export function upgrade({ configPath, dryRun = false }: UpgradeOptions): UpgradeResult {
	const root = dirname(configPath);
	const template = templateDir();
	const remote = Boolean(readJson<{ remote?: unknown }>(configPath, {}).remote);
	const files: UpgradedFile[] = [];

	for (const path of [...OWNED, ...(remote ? OWNED_REMOTE : [])]) {
		const transform = path === "astro.config.mjs" && !remote ? stripRemoteFromAstroConfig : undefined;
		refresh(join(template, path), join(root, path), root, files, dryRun, transform);
	}
	const stale = [
		...Object.entries(RETIRED).filter(([path, sha]) => existsSync(join(root, path)) && sha256(join(root, path)) === sha).map(([path]) => path),
		...(remote ? [] : REMOTE_ONLY_FILES.filter((path) => existsSync(join(root, path)))),
	];
	for (const path of stale) {
		files.push({ path, outcome: "removed" });
		if (!dryRun) rmSync(join(root, path), { recursive: true, force: true });
	}

	const templatePkg = readJson<PackageJson>(join(template, "package.json"), {});
	let packageChanged = false;
	if (dryRun) {
		packageChanged = mergePackageJson(templatePkg, readJson<PackageJson>(join(root, "package.json"), {}), remote);
	} else {
		editJson<PackageJson>(join(root, "package.json"), (pkg) => {
			packageChanged = mergePackageJson(templatePkg, pkg, remote);
		});
	}
	files.push({ path: "package.json", outcome: packageChanged ? "updated" : "kept" });

	return { root, remote, files, packageChanged };
}
