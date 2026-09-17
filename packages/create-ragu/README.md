# create-ragu

Scaffolds a [Ragu](https://github.com/pedrohfonseca81/ragu) knowledge base: markdown pages validated by schema, a Starlight site + Obsidian vault, MCP access for agents, and an agent plugin (Claude Code, Antigravity) that keeps the docs in sync with your code. Also connects your code repositories to it.

```bash
npx create-ragu knowledge-base
```

```
Usage: npx create-ragu [dir] [options]

  --name <kebab>           package/worker name (default: from dir)
  --title <text>           site title
  --systems <list>         "api:../api,web:../web" (id:path, comma separated)
  --remote | --no-remote   include the Cloudflare remote MCP worker
  --no-example             start with empty sections instead of the example docs
  --install | --no-install run npm install
  --plugin | --no-plugin   install the ragu Claude Code plugin
  --connect | --no-connect connect the configured systems' repositories (= install)
  -y, --yes                accept defaults for anything not given

Usage: npx create-ragu install [system-id ...] [--config <path>] [--force]

  Connects code repositories to the knowledge base that governs the current directory.
  In each repository: AGENTS.md block, @AGENTS.md in CLAUDE.md, .mcp.json entry.
  On this machine: the knowledge base is registered in ~/.config/ragu/knowledge-bases.json
  (for ragu-mcp) and, when Antigravity is installed, the plugin goes to ~/.gemini/config/plugins/ragu.
  Idempotent; re-run after adding a system or to upgrade the plugin.
```

The example docs describe fictional systems `api` and `web`; when you pass your own `--systems`, the project starts empty (run `/ragu-init <id>` in Claude Code to bootstrap it from the code).

Full tutorial: https://github.com/pedrohfonseca81/ragu#readme
