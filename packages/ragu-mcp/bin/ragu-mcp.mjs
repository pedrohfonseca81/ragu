#!/usr/bin/env node
// Usage: ragu-mcp [--root <dir>] [--no-watch]
// Starts a stdio MCP server over the Ragu knowledge base found at --root, or the one that governs
// cwd (upwards, a configured sibling, or the monorepo containing cwd — same rules as the plugin hook).
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createServerFactory, createState, findConfigFile, findConfigFor } from "../src/index.mjs";

const args = process.argv.slice(2);
const rootIdx = args.indexOf("--root");
const root = rootIdx >= 0 ? args[rootIdx + 1] : process.cwd();
const watchFiles = !args.includes("--no-watch");

if (args.includes("--help") || args.includes("-h")) {
	console.log(`ragu-mcp — local MCP server for a Ragu knowledge base

Usage: ragu-mcp [--root <dir>] [--no-watch]

  --root <dir>   directory containing ragu.config.json (default: the knowledge base that governs
                 cwd — found upwards, as a sibling that lists cwd's repo in "systems", or in the
                 monorepo that contains cwd; RAGU_CONFIG=/path/to/ragu.config.json overrides)
  --no-watch     don't re-index when files under the docs directory change

Add to Claude Code:
  claude mcp add ragu -- npx ragu-mcp --root /path/to/your-kb`);
	process.exit(0);
}

const configPath = rootIdx >= 0 ? findConfigFile(root) : findConfigFor(root);
if (!configPath) {
	console.error(`ragu-mcp: no ragu.config.json governs ${root} (pass --root <kb-dir> or set RAGU_CONFIG)`);
	process.exit(1);
}

// stdout is the MCP wire; every log line goes to stderr.
const log = (msg) => console.error(`ragu-mcp: ${msg}`);
const state = createState(configPath, { watchFiles, log });
serveStdio(createServerFactory(state), { onerror: (e) => log(e.message) });
