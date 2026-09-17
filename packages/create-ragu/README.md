# create-ragu

Scaffolds a [Ragu](https://github.com/pedrohfonseca81/ragu) knowledge base: markdown pages that cite the code they describe, validated by schema, published as a Starlight site and Obsidian vault, searchable by agents over MCP, and kept in sync with your code by an agent plugin. Also connects your code repositories to it.

```bash
npx create-ragu knowledge-base          # wizard: name, systems, remote, example docs, connect
npx create-ragu install                 # connect the repositories of the knowledge base governing cwd
```

```
npx create-ragu [dir] [options]

  --name <kebab>           package/worker name (default: from dir)
  --title <text>           site title
  --systems <list>         "api:../api,web:../web" (id:path, comma separated)
  --remote | --no-remote   include the Cloudflare remote MCP worker (default: ask)
  --no-example             start with empty sections instead of the example bookshop docs
  --install | --no-install run npm install (default: ask)
  --plugin | --no-plugin   install the ragu Claude Code plugin (default: ask)
  --connect | --no-connect connect the configured systems' repositories (= install) (default: ask)
  -y, --yes                accept defaults for anything not given

npx create-ragu install [system-id ...] [--config <path>] [--force]
```

`install` writes, in each repository: a marked block in `AGENTS.md` (where the knowledge base is, the MCP server names, three rules), `@AGENTS.md` in `CLAUDE.md`, and the server in `.mcp.json`. Nothing else goes into a repository. On this machine it registers the knowledge base in `$XDG_CONFIG_HOME/ragu/knowledge-bases.json` (for `ragu-mcp`) and, when Antigravity is installed, puts the ragu plugin in `~/.gemini/config/plugins/ragu/`. Idempotent; teammates run it once after cloning.

| Harness | Status |
|---|---|
| Claude Code | ✅ Supported |
| Antigravity (IDE, `agy` CLI) | ✅ Supported |
| Codex CLI | ❌ Not supported |
| OpenCode | ❌ Not supported |
| Cursor | ❌ Not supported |
| GitHub Copilot | ❌ Not supported |
| Windsurf | ❌ Not supported |
| Cline | ❌ Not supported |
| Kiro | ❌ Not supported |

Supported means hook, skills and MCP; the others only get the MCP server and the `AGENTS.md` rules.

The example docs describe fictional systems `api` and `web`; with your own `--systems` the project starts empty (run `/ragu-init <id>` to bootstrap it from the code).

Docs: [pedrohfonseca81/ragu](https://github.com/pedrohfonseca81/ragu#readme) · [supported agents](https://github.com/pedrohfonseca81/ragu/blob/main/docs/agents.md) · [configuration](https://github.com/pedrohfonseca81/ragu/blob/main/docs/config.md)
