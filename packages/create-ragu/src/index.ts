export { main, parseArgs } from "./cli.ts";
export { BLOCK_END, BLOCK_START, agentsBlock, ensureClaudeInclude, injectAgentsMd, mergeMcpJson, upsertBlock } from "./connect.ts";
export { findConfig, install } from "./install.ts";
export { ANTIGRAVITY_MCP_NAME, MCP_SERVER, antigravityPluginDir, compareVersions, installAntigravityPlugin, pluginDir } from "./plugin.ts";
export { registerKnowledgeBase, registryFile } from "./registry.ts";
export { EXAMPLE_SYSTEMS, parseSystems, scaffold, slugify, templateDir } from "./scaffold.ts";
export { upgrade } from "./upgrade.ts";
export type * from "./types.ts";
