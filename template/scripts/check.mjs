#!/usr/bin/env node
// Fast validation of the knowledge base (< 2s, no Astro):
//   - frontmatter matches the shared schema (same one the site uses)
//   - relative markdown links point to existing files
//   - `sources:` entries resolve to a known system and an existing file
//   - `decisions/` files follow NNNN-slug.md and numbers are unique
//
// Usage: node scripts/check.mjs [--json]
// Exit code 1 on any error. Warnings never fail the run.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import matter from "gray-matter";
import { z } from "zod";
import { findConfigFile, loadConfig, resolveSource } from "./lib/config.mjs";
import { frontmatterFields } from "./lib/frontmatter.mjs";
import { walkMarkdown } from "./lib/walk.mjs";

export function runCheck(configPath) {
	const config = loadConfig(configPath);
	const schema = z.object({ title: z.string().min(1), ...frontmatterFields(z, config) }).passthrough();
	const errors = [];
	const warnings = [];
	const files = walkMarkdown(config.docsDir);
	const known = new Set(files.map((f) => relative(config.docsDir, f)));
	const adrNumbers = new Map();
	const missingSystemDirs = new Set(config.systems.filter((s) => !existsSync(s.path)).map((s) => s.id));

	for (const file of files) {
		const rel = relative(config.docsDir, file).replace(/\\/g, "/");
		let parsed;
		try {
			parsed = matter(readFileSync(file, "utf-8"));
		} catch (e) {
			errors.push(`${rel}: cannot parse frontmatter (${e.message})`);
			continue;
		}
		const result = schema.safeParse(parsed.data);
		if (!result.success) {
			for (const issue of result.error.issues) {
				errors.push(`${rel}: frontmatter.${issue.path.join(".") || "(root)"}: ${issue.message}`);
			}
			continue;
		}
		const fm = result.data;
		if (fm.human_reviewed === true && fm.status === "outdated") {
			warnings.push(`${rel}: human_reviewed is true but status is outdated`);
		}

		// sources
		for (const src of fm.sources) {
			const r = resolveSource(src, config);
			if (!r.ok) {
				errors.push(`${rel}: sources "${src}": ${r.reason}`);
				continue;
			}
			if (missingSystemDirs.has(r.systemId)) continue; // repo not checked out here; can't verify
			if (!existsSync(r.absPath)) errors.push(`${rel}: sources "${src}": file not found at ${r.absPath}`);
		}

		// relative markdown links
		for (const link of extractRelativeLinks(parsed.content)) {
			const target = resolve(dirname(file), link);
			const targetRel = relative(config.docsDir, target).replace(/\\/g, "/");
			if (!known.has(targetRel) && !existsSync(target)) {
				errors.push(`${rel}: broken link "${link}"`);
			}
		}

		// ADR numbering
		if (rel.startsWith("decisions/") && rel !== "decisions/index.md") {
			const m = /^decisions\/(\d{4})-[a-z0-9-]+\.md$/.exec(rel);
			if (!m) errors.push(`${rel}: decisions must be named NNNN-slug.md`);
			else if (adrNumbers.has(m[1])) errors.push(`${rel}: ADR number ${m[1]} already used by ${adrNumbers.get(m[1])}`);
			else adrNumbers.set(m[1], rel);
		}
	}

	for (const id of missingSystemDirs) {
		const sys = config.systems.find((s) => s.id === id);
		warnings.push(`system "${id}" not found at ${sys.path}; sources for it were not verified`);
	}

	return { errors, warnings, fileCount: files.length, config };
}

/** Relative `.md` links only; ignores http(s), anchors, and absolute site paths. */
export function extractRelativeLinks(markdown) {
	const links = [];
	const withoutCode = markdown.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
	const re = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
	let m;
	while ((m = re.exec(withoutCode))) {
		const href = m[1].split("#")[0];
		if (!href || /^[a-z]+:/i.test(href) || href.startsWith("/")) continue;
		if (!href.endsWith(".md")) continue;
		links.push(href);
	}
	return links;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const configPath = findConfigFile(process.cwd());
	if (!configPath) {
		console.error("ragu.config.json not found (searched from cwd upwards)");
		process.exit(1);
	}
	const { errors, warnings, fileCount } = runCheck(configPath);
	const json = process.argv.includes("--json");
	if (json) {
		console.log(JSON.stringify({ ok: errors.length === 0, errors, warnings, fileCount }, null, 2));
	} else {
		for (const w of warnings) console.warn(`warn  ${w}`);
		for (const e of errors) console.error(`error ${e}`);
		console.log(`${fileCount} documents checked: ${errors.length} error(s), ${warnings.length} warning(s)`);
	}
	process.exit(errors.length ? 1 : 0);
}
