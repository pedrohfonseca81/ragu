<p align="center">
  <img src="assets/ragu-banner.png" alt="Ragu" width="720">
</p>

<p align="center"><strong>A knowledge base that stays true to your code — and that your agents can actually use.</strong></p>

<p align="center">
  <a href="https://www.npmjs.com/package/create-ragu"><img alt="create-ragu on npm" src="https://img.shields.io/npm/v/create-ragu?label=create-ragu&color=c0392b"></a>
  <a href="https://www.npmjs.com/package/ragu-mcp"><img alt="ragu-mcp on npm" src="https://img.shields.io/npm/v/ragu-mcp?label=ragu-mcp&color=c0392b"></a>
  <a href="https://github.com/useperfit/ragu/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/useperfit/ragu/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-cream"></a>
</p>

Ragu gives you a markdown knowledge base for business rules, flows, integrations and decisions, with three things most doc setups lack:

1. **Every page cites the code it describes** (`sources: api/src/billing/refund.ts:42`), and the build fails when a citation or a link breaks.
2. **Agents read it over MCP** — locally in one command, or remotely on Cloudflare with semantic search.
3. **An agent plugin keeps it in sync** (Claude Code and Antigravity). When code changes and the docs don't, the agent is stopped with the exact list of pages that cite the changed files, before it declares the task done.

Humans get a [Starlight](https://starlight.astro.build) site and an Obsidian vault from the same files. Nothing is hidden behind a service: it is markdown, a JSON config, and a few hundred lines of Node.

```
                  ┌──────────────────────────────────────────────────────────┐
                  │                    your code repos                       │
                  │        api/            web/           worker/            │
                  └───────┬─────────────────────────────────────▲────────────┘
        changes           │                                     │  reads rules,
        (git status)      │                                     │  flows, ADRs
                          ▼                                     │
   ┌──── Claude Code / Antigravity + ragu plugin ──────┐   ┌────┴─────────────┐
   │  Stop hook: "code changed, these 3 pages cite it" │   │  any MCP client  │
   │  /ragu-sync  /ragu-init  /ragu-adr  /ragu-audit   │   │  (Claude Code,   │
   └───────────────────────┬───────────────────────────┘   │   Cursor, ...)   │
                           │ edits                          └────▲─────────────┘
                           ▼                                     │ search_docs
   ┌───────────────────────────────────────────────┐             │ get_document
   │        knowledge base  (markdown + config)    │             │ list_documents
   │  ragu.config.json   src/content/docs/**/*.md  │◄────────────┤
   │  scripts/check.mjs  →  frontmatter, links,    │   ragu-mcp (local, stdio)
   │                        sources, ADR numbering │   or Cloudflare worker (remote)
   └───────────────────────┬───────────────────────┘
                           ▼
                Starlight site · Obsidian vault · llms.txt
```

---

## Contents

- [Quick start (5 minutes, no cloud)](#quick-start-5-minutes-no-cloud)
- [Using Ragu with your project](#using-ragu-with-your-project)
- [How the sync loop works](#how-the-sync-loop-works)
- [Writing pages](#writing-pages)
- [Skills reference](#skills-reference)
- [Remote MCP on Cloudflare](#remote-mcp-on-cloudflare)
- [Advanced](#advanced)
- [Config reference](#config-reference)
- [Repository layout](#repository-layout)
- [Roadmap](#roadmap)

---

## Quick start (5 minutes, no cloud)

Requirements: Node ≥ 20, git. Claude Code or Antigravity for the plugin (optional but it's the point).

### 1. Create the knowledge base

```bash
npx create-ragu knowledge-base
```

The wizard asks for a name, a title, the systems you want to document (`api:../api, web:../web` — ids plus paths relative to the knowledge base), whether you want the Cloudflare remote server, and whether to start with the example docs (a fictional bookshop). Non-interactive:

```bash
npx create-ragu knowledge-base --systems "api:../api,web:../web" --no-remote --no-install --no-plugin
```

Recommended layout — the knowledge base as a **sibling** of the repos it documents:

```
work/
├── api/               ← git repo
├── web/               ← git repo
└── knowledge-base/    ← git repo created by create-ragu
```

It can also live inside a monorepo (`systems: [{ "id": "api", "path": "../apps/api" }]`) or stand alone with `systems: []`.

### 2. Run the site

```bash
cd knowledge-base
npm install
npm run dev          # http://localhost:4321
```

Open `src/content/docs/` in Obsidian if you prefer. Links are plain relative markdown (`../domain/refunds.md`); the site rewrites them to routes at build time, so both tools work on the same files.

### 3. Connect your repositories

```bash
npx create-ragu install          # from the knowledge base or any of its systems
```

(The wizard offers this step at the end of `create-ragu`; this is the same thing, re-runnable.) For every configured system it finds the repository root and writes:

| file | what | for |
|---|---|---|
| `AGENTS.md` | a block between `<!-- ragu:start -->` / `<!-- ragu:end -->`: where the knowledge base is, the MCP server name, and three rules (search before changing a rule, sync after, code is the truth). Created if missing; replaced in place on re-runs, nothing outside the markers is touched | every agent that reads `AGENTS.md` |
| `CLAUDE.md` | `@AGENTS.md` include (created or prepended) | Claude Code |
| `.mcp.json` | server `<kb-name>` → `npx -y ragu-mcp` (merged; other servers kept) | Claude Code |
| `.agents/plugins/ragu/` | the agent plugin (Stop hook + skills + `mcp_config.json`), version-gated so re-runs only upgrade | Antigravity |

It also registers `.agents/plugins` in `~/.gemini/config/plugins.json` on this machine (the Antigravity CLI does not discover workspace plugins by itself as of 1.2.3; teammates run `npx create-ragu install` once after cloning), and does the same for the knowledge base itself so ADRs and audits work from there. Commit the files in each repository.

In a monorepo (one git repository holding `knowledge-base/` and `apps/api`, `apps/web`) the block is written once at the repository root and lists every system.

**MCP.** `ragu-mcp` is a stdio MCP server with lexical search (MiniSearch), no cloud. Run with no arguments it finds the knowledge base that governs the current directory (upwards, a configured sibling, or the monorepo) — which is why the generated configs need no paths. It re-indexes when files change. Three tools:

| tool | input | returns |
|---|---|---|
| `search_docs` | `query`, optional `systems[]`, `domain`, `status[]`, `topK` | ranked documents with metadata + content |
| `get_document` | `path` (e.g. `domain/refunds.md`) | one document |
| `list_documents` | optional `systems[]`, `domain` | metadata only |

Pages with `status: outdated` come back with a warning so the agent doesn't trust them blindly. To add it by hand: `claude mcp add knowledge-base -- npx ragu-mcp --root /path/to/knowledge-base`.

### 4. Install the agent plugin

Claude Code plugins are per user, so this is the one step `install` cannot do for you:

```bash
claude plugin marketplace add useperfit/ragu
claude plugin install ragu@ragu
```

Antigravity (IDE or `agy` CLI) got the plugin in step 3 (`.agents/plugins/ragu/` in each repository, registered in `~/.gemini/config/plugins.json`). Same hook, same skills, activated by description instead of `/ragu-*`; `agy plugin validate .agents/plugins/ragu` checks the layout.

### 5. Bootstrap the docs from an existing repo

In Claude Code, from anywhere inside the workspace:

```
/ragu-init api
```

The skill explores the repo and writes a **map** to `inbox/init-api.md` — modules, domain candidates with `file:line`, integrations, flows, open questions, proposed pages — then **stops and asks** which pages to create. Only after you confirm does it write `systems/api.md`, glossary rows and `domain/*.md` pages, all with `status: inferred` and `human_reviewed: false`, and runs `npx create-ragu install api` so the repository is connected. Review the pages; flip `human_reviewed` yourself when a page is right.

---

## Using Ragu with your project

The short version: let your agent do the setup, then work as usual and let the hook keep the docs honest.

### Let the agent set it up

[`AGENT-SETUP.md`](AGENT-SETUP.md) is written for the agent, not for you. Paste this into Claude Code or Antigravity from the directory that holds your repositories:

```
Read https://raw.githubusercontent.com/useperfit/ragu/main/AGENT-SETUP.md and set up Ragu for this project.
Systems: api (./api), web (./web). Knowledge base at ./knowledge-base.
```

It creates the knowledge base, connects each repository (`AGENTS.md` block, MCP, plugin), and either bootstraps the docs from the code (`ragu-init`, one system at a time, asking before writing) or — for a new project — writes the rules you dictate as `unverified` pages that the code will later verify.

### Existing project: docs come from the code

```bash
npx create-ragu knowledge-base --systems "api:../api,web:../web" --no-remote --install --connect -y   # 1. scaffold + connect repos
claude plugin marketplace add useperfit/ragu && claude plugin install ragu@ragu             # 2. Claude Code plugin (per user)
```

Then `/ragu-init api` in Claude Code (or "ragu-init api" in Antigravity). You get a map in `inbox/init-api.md`, confirm which pages to create, and end with `systems/api.md`, glossary rows and one `domain/*.md` per business rule — each `status: inferred` with `file:line` sources. Read them; flip `human_reviewed: true` on the ones that are right. Repeat per system.

### New project: docs are the spec

Same scaffold with empty repositories. Write the rules you already know as pages with `status: unverified` and `sources: []` (from `templates/`), record the first decisions with `/ragu-adr`. As you implement, the Stop hook notices code changes and asks for `ragu-sync`, which turns `unverified` into `verified` with real sources. A page the code ends up contradicting becomes `outdated` and lands in `inbox/DIVERGENCES.md` — a spec/implementation conflict, caught at the moment it happens.

### A day with it

You, in `api/`: *"Extend the refund window from 30 to 45 days."*

1. The agent searches the knowledge base (`search_docs "refund"`), reads `domain/refunds.md` (`sources: api/src/billing/refund.ts:18`) and finds it links `decisions/0004-refund-window.md` — the 30 days came from a payment-provider chargeback limit. It tells you before changing anything.
2. You say go. It edits `refund.ts`, and tries to finish.
3. The Stop hook: *"Code changed but the knowledge base did not — `domain/refunds.md` cites `api/src/billing/refund.ts:18`."* The agent updates the page (new value, same source line, `updated_at` today), writes `decisions/0009-refund-window-45-days.md` with the reason you gave, runs `npm run check`, and only then finishes.
4. Next week a teammate's agent — in another repo, another tool — asks "why 45 days?" and gets the ADR, not a guess.

Nothing here depends on the agent remembering to document: the `sources:` reverse map and the hook do the remembering. Your part is reviewing pages and flipping `human_reviewed`.

---

## How the sync loop works

The plugin registers a **Stop hook**: a script that runs every time the agent (Claude Code or Antigravity) is about to finish a turn.

```
Claude is done
   │
   ├─ no ragu.config.json governs cwd?              → allow, silently
   ├─ no uncommitted code changes in any system?    → allow
   ├─ docs changed too?                             → run scripts/check.mjs
   │        ├─ passes                                → allow ("validated")
   │        └─ fails                                 → BLOCK with the errors
   └─ code changed, docs didn't
            ├─ already reminded this session?       → allow
            └─ first time                            → BLOCK once:
                  "Code changed but the knowledge base did not.
                   Changed: api: src/billing/refund.ts
                   Pages whose sources cite these files:
                     - domain/refunds.md (sources: api/src/billing/refund.ts:42)
                   Update them (/ragu-sync), or say why this change is purely technical."
```

The reverse map — *changed file → pages that cite it* — comes from the `sources:` frontmatter, which is why the skills insist on precise citations. It is a strong nudge, not a proof: after one block the agent may finish with a justification (refactors, lint, tests). The `check.mjs` gate is what keeps the base structurally valid at all times: frontmatter schema, relative links, `sources` that point at existing files, unique ADR numbers. It runs in under two seconds; the full Astro build (with the Starlight links validator and Mermaid rendering) runs in CI.

How the hook finds the knowledge base from a code repo: it walks up from `cwd` looking for `ragu.config.json`, and at each level also looks one directory down — so a sibling `knowledge-base/` is found from `api/src/...`, but only if `api` is one of its configured `systems`. The workspace directory that holds the knowledge base *and* at least one of its systems (the sibling layout's parent, or a monorepo root) is governed by it too, so the hook also runs when the agent is started from there. Git worktrees are followed: a linked worktree of a system (`git worktree add`, or Claude Code's `.claude/worktrees/<branch>/`) is governed by the same knowledge base, and the hook inspects the worktree being edited rather than the main checkout; a `ragu.config.json` read from a worktree of the knowledge base still resolves its `systems` from the main tree. Set `RAGU_CONFIG=/path/to/ragu.config.json` to force it.

---

## Writing pages

Every page under `src/content/docs/` has this frontmatter (validated by Zod in the site build and by `check.mjs`):

```yaml
---
title: Orders can be cancelled until they are shipped
domain: orders
systems: [api]                 # ids from ragu.config.json
status: verified               # verified | inferred | unverified | outdated
human_reviewed: false          # only a human flips this
sources:
  - api/src/orders/cancel.ts:18   # <system-id>/<path>[:line]
updated_at: 2026-01-01
---
```

| status | meaning |
|---|---|
| `verified` | confirmed in code; `sources` has `file:line` |
| `inferred` | deduced from behaviour; no named rule in the code |
| `unverified` | inherited from prose docs, not yet checked against code |
| `outdated` | code and page disagree — recorded in `inbox/DIVERGENCES.md`; served with a warning |

Default sections (configurable): `systems/` one page per repo · `domain/` one rule per page · `flows/` sequence diagrams · `integrations/` third parties · `decisions/` ADRs `NNNN-slug.md` · `standards/` conventions · `glossary.md` business term → code. Page templates live in `templates/`.

The rules agents follow are in the generated `AGENTS.md` (`CLAUDE.md` includes it). The two that matter most: **code defines the truth**, and **never invent the why** — if the motivation isn't in code or an ADR, write `Reason not documented` and log a question in `inbox/QUESTIONS.md`.

---

## Skills reference

| skill | what it does |
|---|---|
| `/ragu-sync` | Diffs every configured system, classifies changes as behavioural or technical, updates the pages that cite the changed files (or creates new ones from `templates/`), fixes `sources`/`status`/`updated_at`, runs `check`. |
| `/ragu-init <system-id>` | Two-phase bootstrap of one system: map to `inbox/init-<id>.md` → confirmation → pages with `status: inferred` → `create-ragu install`. Never several systems at once. |
| `/ragu-adr <title>` | Next `NNNN`, filled ADR template, cross-links from the affected `systems/` and `domain/` pages. |
| `/ragu-audit [scope]` | `check --json` + git-history staleness (`sources` newer than `updated_at`) + claim-by-claim comparison; fixes drifted line numbers, marks unresolvable divergences `outdated`, logs them. |

---

## Remote MCP on Cloudflare

Use this when the knowledge base should be reachable by people and agents that don't have the repo checked out, or when you want semantic search. One Cloudflare Worker serves the static site, the MCP endpoint and the reindex hook; embeddings come from Workers AI (`@cf/baai/bge-m3`) and live in Vectorize.

Scaffold with `--remote` (or answer yes in the wizard). Then, once:

```bash
npx wrangler login

# 1. vector index (bge-m3 = 1024 dimensions)
npx wrangler vectorize create <name>-docs --dimensions=1024 --metric=cosine

# 2. secrets
npx wrangler secret put MCP_TOKENS        # alice:<random>,bob:<random>  — one per person/client, revocable individually
npx wrangler secret put REINDEX_SECRET    # any random string

# 3. first deploy + first index
npm run deploy                            # builds the site, bundles docs, deploys the worker
curl -X POST https://<worker-url>/admin/reindex -H "Authorization: Bearer <REINDEX_SECRET>"
```

Put the worker URL in `ragu.config.json → remote.url` (it is also the site's canonical URL).

**Keep the index fresh automatically.** `.github/workflows/reindex.yml` runs on every push to `main`: it waits until `GET /admin/version` reports the pushed commit (the docs bundle embeds the git SHA), then calls `POST /admin/reindex`. Configure in GitHub → Settings → Secrets and variables → Actions:

- variable `KB_URL` = the worker URL
- secret `REINDEX_SECRET` = the same value as the wrangler secret

Deploy itself is whatever you prefer: `npm run deploy` by hand, or the Cloudflare Workers Git integration on `main`.

**Connect clients** with a token from `MCP_TOKENS`:

```bash
claude mcp add --transport http knowledge-base https://<worker-url>/mcp \
  --header "Authorization: Bearer <token>"
```

Rotate or revoke one person by editing the `MCP_TOKENS` secret; nobody else is affected.

---

## Advanced

### OAuth + Cloudflare Access (for claude.ai on the web)

The claude.ai web app can't send a static bearer header; it needs an OAuth flow. Ragu ships one behind a flag:

1. Set `remote.oauth: true` in `ragu.config.json`.
2. Create a KV namespace and add the binding to `wrangler.jsonc`:
   ```bash
   npx wrangler kv namespace create OAUTH_KV
   ```
   ```jsonc
   "kv_namespaces": [{ "binding": "OAUTH_KV", "id": "<id>" }]
   ```
3. In the Cloudflare dashboard, put the worker behind **Cloudflare Access** (Zero Trust → Access → Applications) with an email OTP or SSO policy, and add a bypass rule for `/mcp*`, `/oauth/*`, `/admin/*` and `/.well-known/*`. `/authorize` must **not** be bypassed — the worker trusts the `Cf-Access-Authenticated-User-Email` header Access sets after login.
4. Deploy. Static tokens keep working alongside OAuth.

### Obsidian

Open `src/content/docs/` as a vault. Keep links as relative markdown (`[text](../domain/page.md)`), never `[[wikilinks]]`. `.obsidian/workspace*.json` is git-ignored by the template.

### llms.txt

The site build emits `/llms.txt`, `/llms-small.txt` and `/llms-full.txt` (via `starlight-llms-txt`) for tools that prefer a single file over MCP.

### Custom sections

Edit `sections` in `ragu.config.json`; the sidebar follows. Skills only rely on `systems`, `domain` and `decisions` existing.

### Running the hook outside Claude Code

`plugins/ragu/hooks/enforce.mjs` reads a JSON payload on stdin and prints a JSON decision. It understands two dialects: Claude Code (`{ "cwd", "session_id", "stop_hook_active" }` → `{ "decision": "block", "reason" }`) and Antigravity (`{ "workspacePaths", "conversationId" }` → `{ "decision": "continue", "reason" }`). Adding another agent is one entry in `adapt()`; contributions welcome.

---

## Config reference

`ragu.config.json` is the single source of truth. The Zod schema, the sidebar, both MCP servers and the hook derive from it. JSON Schema: [`schema.json`](schema.json).

```jsonc
{
  "name": "acme-kb",                       // package + worker name (kebab-case)
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

`create-ragu install [system-id ...] [--config <path>] [--force] [--no-register]` connects repositories (see [Connect your repositories](#3-connect-your-repositories)).

Scripts in a generated project:

| command | what |
|---|---|
| `npm run dev` | Starlight dev server |
| `npm run check` | fast validation (frontmatter, links, sources, ADR numbers) — what the hook runs |
| `npm run build` | `check` + docs bundle + Astro build with links validator and Mermaid |
| `npm run mcp` | local MCP server (same as `npx ragu-mcp --root .`) |
| `npm run deploy` | remote only: `check` + bundle + `wrangler deploy` |

---

## Repository layout

```
ragu/
├── AGENT-SETUP.md          setup instructions written for an agent (paste the raw URL to yours)
├── template/               what create-ragu copies; also the example project (dogfood)
├── packages/
│   ├── create-ragu/        the scaffolder (npx create-ragu)
│   └── ragu-mcp/           local stdio MCP server (npx ragu-mcp)
├── plugins/ragu/           agent plugin (Claude Code + Antigravity): Stop hook + skills + tests
├── .claude-plugin/         marketplace manifest (claude plugin marketplace add useperfit/ragu)
└── schema.json             JSON Schema for ragu.config.json
```

Develop:

```bash
npm install
npm test                    # all packages + plugin hook tests
npm run build:template      # full site build of the example
claude plugin marketplace add "$(pwd)" && claude plugin install ragu@ragu
```

---

## Roadmap

- Hook adapters for more agents (Cursor, Codex…): one entry in `adapt()`
- Local semantic search (transformers.js) as an opt-in for `ragu-mcp`
- Vector store providers beyond Cloudflare (pgvector, Turso)
- A `ragu-check` GitHub Action that fails a PR when code changes without doc changes
- A core package with an upgrade path instead of the copied template
- `tags` in frontmatter

Contributions welcome. MIT.
