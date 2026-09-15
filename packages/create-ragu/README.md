# create-ragu

Scaffolds a [Ragu](https://github.com/pedrohfonseca/ragu) knowledge base: markdown pages validated by schema, a Starlight site + Obsidian vault, MCP access for agents, and a Claude Code plugin that keeps the docs in sync with your code.

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
  -y, --yes                accept defaults for anything not given
```

The example docs describe fictional systems `api` and `web`; when you pass your own `--systems`, the project starts empty (run `/ragu-init <id>` in Claude Code to bootstrap it from the code).

Full tutorial: https://github.com/pedrohfonseca/ragu#readme
