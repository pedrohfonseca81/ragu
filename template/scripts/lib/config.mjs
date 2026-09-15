// Loads and lightly validates ragu.config.json. Shared by every script in this project.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const STATUSES = ["verified", "inferred", "unverified", "outdated"];

export const DEFAULT_SECTIONS = [
	{ dir: "systems", label: "Systems" },
	{ dir: "domain", label: "Domain" },
	{ dir: "flows", label: "Flows" },
	{ dir: "integrations", label: "Integrations" },
	{ dir: "decisions", label: "Decisions" },
	{ dir: "standards", label: "Standards" },
];

export const DEFAULT_HOOK = {
	codeExtensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".py", ".ex", ".exs", ".go", ".rs", ".rb", ".java", ".kt", ".sql"],
	ignore: ["node_modules", "dist", "_build", "deps", ".git"],
};

/** Walks up from `start` until it finds a ragu.config.json. Returns the config file path or null. */
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

/** Reads a config file and fills in defaults. `root` is the directory containing it. */
export function loadConfig(configPath) {
	const raw = JSON.parse(readFileSync(configPath, "utf-8"));
	const root = dirname(resolve(configPath));
	const errors = validateConfig(raw);
	if (errors.length) {
		throw new Error(`Invalid ${configPath}:\n- ${errors.join("\n- ")}`);
	}
	return {
		root,
		name: raw.name,
		title: raw.title,
		docsDir: resolve(root, raw.docsDir ?? "src/content/docs"),
		systems: (raw.systems ?? []).map((s) => ({ id: s.id, path: resolve(root, s.path) })),
		sections: raw.sections ?? DEFAULT_SECTIONS,
		statuses: STATUSES,
		hook: { ...DEFAULT_HOOK, ...(raw.hook ?? {}) },
		remote: raw.remote ?? null,
	};
}

export function validateConfig(raw) {
	const errors = [];
	if (!raw || typeof raw !== "object") return ["config must be an object"];
	if (typeof raw.name !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(raw.name)) errors.push("`name` must be kebab-case");
	if (typeof raw.title !== "string" || !raw.title) errors.push("`title` is required");
	if (!Array.isArray(raw.systems)) errors.push("`systems` must be an array (may be empty)");
	else {
		const ids = new Set();
		for (const s of raw.systems) {
			if (!s || typeof s.id !== "string" || typeof s.path !== "string") errors.push("each system needs `id` and `path`");
			else if (ids.has(s.id)) errors.push(`duplicate system id: ${s.id}`);
			else ids.add(s.id);
		}
	}
	if (raw.sections !== undefined) {
		if (!Array.isArray(raw.sections) || raw.sections.some((s) => !s?.dir || !s?.label)) {
			errors.push("`sections` must be an array of {dir, label}");
		}
	}
	if (raw.statuses !== undefined && JSON.stringify(raw.statuses) !== JSON.stringify(STATUSES)) {
		errors.push(`\`statuses\` is fixed in v1: ${JSON.stringify(STATUSES)}`);
	}
	if (raw.remote !== undefined && raw.remote !== null) {
		if (raw.remote.provider !== "cloudflare") errors.push("`remote.provider` must be \"cloudflare\"");
		if (typeof raw.remote.url !== "string") errors.push("`remote.url` is required");
	}
	return errors;
}

/** Resolves a `sources:` entry (`<system-id>/<path>[:line]`) against the config. */
export function resolveSource(entry, config) {
	const m = /^([^/]+)\/(.+?)(?::(\d+)(?:-(\d+))?)?$/.exec(entry.trim());
	if (!m) return { ok: false, reason: "expected <system-id>/<path>[:line]" };
	const [, systemId, relPath, line] = m;
	const system = config.systems.find((s) => s.id === systemId);
	if (!system) return { ok: false, reason: `unknown system "${systemId}"` };
	return {
		ok: true,
		systemId,
		relPath,
		line: line ? Number(line) : null,
		absPath: join(system.path, relPath),
		systemPath: system.path,
	};
}
