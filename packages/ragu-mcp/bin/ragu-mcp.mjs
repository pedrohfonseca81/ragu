#!/usr/bin/env node
// Usage: ragu-mcp [--root <dir>] [--no-watch]
// Starts a stdio MCP server over the Ragu knowledge base found at --root, or the one that governs
// cwd (upwards, a configured sibling, or the monorepo containing cwd; same rules as the plugin hook),
// or $PWD, or else every knowledge base registered on this machine by `create-ragu install`.
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createServerFactory, createState, findConfigFile, registryFile, resolveConfigs } from "../src/index.mjs";

const args = process.argv.slice(2);
const rootIdx = args.indexOf("--root");
const root = rootIdx >= 0 ? args[rootIdx + 1] : process.cwd();
const watchFiles = !args.includes("--no-watch");

if (args.includes("--help") || args.includes("-h")) {
	console.log(`ragu-mcp: local MCP server for a Ragu knowledge base

Usage: ragu-mcp [--root <dir>] [--no-watch]

  --root <dir>   directory containing ragu.config.json. Default: the knowledge base that governs
                 cwd (found upwards, as a sibling that lists cwd's repo in "systems", or in the
                 monorepo that contains cwd), then the one governing $PWD, then every knowledge
                 base registered in $XDG_CONFIG_HOME/ragu/knowledge-bases.json by
                 \`create-ragu install\` (several are served as one index with a "kb" field).
                 RAGU_CONFIG=/path/to/ragu.config.json overrides.
  --no-watch     don't re-index when files under the docs directories change

Add to Claude Code:
  claude mcp add ragu -- npx ragu-mcp --root /path/to/your-kb`);
	process.exit(0);
}

// stdout is the MCP wire; every log line goes to stderr.
const log = (msg) => console.error(`ragu-mcp: ${msg}`);

const configPaths = rootIdx >= 0 ? [findConfigFile(root)].filter(Boolean) : resolveConfigs(root, { log });
if (!configPaths.length) {
	log(
		rootIdx >= 0
			? `no ragu.config.json in ${root} or above`
			: `no ragu.config.json governs ${root} and no knowledge base is registered in ${registryFile()} (run \`npx create-ragu install\` from a knowledge base, pass --root <kb-dir>, or set RAGU_CONFIG)`,
	);
	process.exit(1);
}
const state = createState(configPaths, { watchFiles, log });
serveStdio(createServerFactory(state), { onerror: (e) => log(e.message) });
