# Configuration

`ragu.config.json` is the single source of truth. The Zod schema, the sidebar, both MCP servers and the hook derive from it. JSON Schema: [`schema.json`](../schema.json).

```jsonc
{
  "name": "acme-kb",                       // package + worker name (kebab-case); the MCP server name
  "title": "Acme Knowledge Base",          // site title
  "docsDir": "src/content/docs",           // the vault
  "systems": [                             // repos this base documents; [] is valid
    { "id": "api", "path": "../api" },     // id → frontmatter `systems` and `sources` prefix
    { "id": "web", "path": "../web" }      // path → where the hook looks for changes
  ],
  "sections": [                            // top-level folders, sidebar order
    { "dir": "systems",      "label": "Systems" },
    { "dir": "domain",       "label": "Domain" },
    { "dir": "flows",        "label": "Flows" },
    { "dir": "integrations", "label": "Integrations" },
    { "dir": "decisions",    "label": "Decisions" },
    { "dir": "standards",    "label": "Standards" }
  ],
  "statuses": ["verified", "inferred", "unverified", "outdated"],   // fixed in v1
  "hook": {
    "codeExtensions": [".ts", ".tsx", ".js", ".py", ".ex", ".go", ".rs", ".rb", ".java", ".kt", ".sql"],
    "ignore": ["node_modules", "dist", "_build", "deps", ".git", ".agents", ".agent", ".claude", ".gemini"]
  },
  "remote": {                              // omit for local-only
    "provider": "cloudflare",
    "url": "https://acme-kb.example.workers.dev",
    "embeddingModel": "@cf/baai/bge-m3",
    "vectorizeIndex": "acme-kb-docs",
    "oauth": false
  }
}
```

## Layout

The knowledge base is a git repository of its own. Recommended: a **sibling** of the repositories it documents.

```
work/
├── api/               ← git repo
├── web/               ← git repo
└── knowledge-base/    ← git repo created by create-ragu
```

It can also live inside a monorepo (`systems: [{ "id": "api", "path": "../apps/api" }]`; `install` then writes one `AGENTS.md` at the repository root listing every system) or stand alone with `systems: []`.

## Sections

Edit `sections`; the sidebar follows. Skills only rely on `systems`, `domain` and `decisions` existing. The example project (`create-ragu` without `--systems`, or `--example`) is a fictional bookshop with systems `api` and `web`.

## Scripts in a generated project

| command | what |
|---|---|
| `npm run dev` | Starlight dev server at `http://localhost:4321` |
| `npm run check` | fast validation (frontmatter, links, sources, ADR numbers); what the hook runs |
| `npm run build` | `check` + docs bundle + Astro build with links validator and Mermaid |
| `npm run mcp` | local MCP server (same as `npx ragu-mcp --root .`) |
| `npm run deploy` | remote only: `check` + bundle + `wrangler deploy` |

## create-ragu

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

`install` connects repositories to the knowledge base that governs the current directory (or `--config`). With no ids, every configured system. In each repository it writes:

| file | what | read by |
|---|---|---|
| `AGENTS.md` | a block between `<!-- ragu:start -->` / `<!-- ragu:end -->`: where the knowledge base is, the MCP server names, and three rules (search before changing a rule, sync after, code is the truth). Created if missing; replaced in place on re-runs, nothing outside the markers is touched | every agent that reads `AGENTS.md` |
| `CLAUDE.md` | `@AGENTS.md` include (created or prepended) | Claude Code |
| `.mcp.json` | server `<kb-name>` → `npx -y ragu-mcp` (merged; other servers kept) | Claude Code |

Commit those. On the machine that runs it, `install` also registers the knowledge base in `$XDG_CONFIG_HOME/ragu/knowledge-bases.json` (for `ragu-mcp`) and installs the Antigravity plugin in `~/.gemini/config/plugins/ragu/` when `~/.gemini` exists (`--force` reinstalls an equal or newer copy). It is idempotent; teammates run it once after cloning.

## Obsidian

Open `src/content/docs/` as a vault. Keep links as relative markdown (`[text](../domain/page.md)`), never `[[wikilinks]]`. `.obsidian/workspace*.json` is git-ignored by the template.

## llms.txt

The site build emits `/llms.txt`, `/llms-small.txt` and `/llms-full.txt` (via `starlight-llms-txt`) for tools that prefer a single file over MCP.
