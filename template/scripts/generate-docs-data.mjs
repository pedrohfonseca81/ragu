#!/usr/bin/env node
// @ts-check
// Bundles src/content/docs/**/*.md into src/worker/docs-data.generated.json.
// Runs before build/deploy so the remote MCP worker ships the latest content.
// The local MCP server (ragu-mcp) reads the markdown directly and does not need this file.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { execSync } from "node:child_process";
import matter from "gray-matter";
import { findConfigFile, loadConfig } from "./lib/config.mjs";
import { walkMarkdown } from "./lib/walk.mjs";

const configPath = findConfigFile(process.cwd());
if (!configPath) {
	console.error("ragu.config.json not found");
	process.exit(1);
}
const config = loadConfig(configPath);
const OUT_FILE = join(config.root, "src", "worker", "docs-data.generated.json");

function gitSha() {
	try {
		return execSync("git rev-parse HEAD", { cwd: config.root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
	} catch {
		return "unknown";
	}
}

/** @param {unknown} value */
const asDate = (value) => (typeof value === "string" || value instanceof Date ? new Date(value).toISOString().slice(0, 10) : null);

const docs = walkMarkdown(config.docsDir).map((/** @type {string} */ filePath) => {
	const { data: fm, content } = matter(readFileSync(filePath, "utf-8"));
	const path = relative(config.docsDir, filePath).replace(/\\/g, "/");
	return {
		path,
		title: fm.title ?? path,
		domain: fm.domain ?? null,
		systems: fm.systems ?? [],
		status: fm.status ?? "unverified",
		updated_at: asDate(fm.updated_at),
		content: content.trim(),
	};
});

const output = {
	generatedAt: new Date().toISOString(),
	sha: gitSha(),
	systems: config.systems.map((s) => s.id),
	docs,
};

mkdirSync(dirname(OUT_FILE), { recursive: true });
writeFileSync(OUT_FILE, JSON.stringify(output, null, 2));
console.log(`Wrote ${relative(config.root, OUT_FILE)}: ${docs.length} documents (sha ${output.sha.slice(0, 7)})`);
