# Setting up Ragu: instructions for an agent

You are reading this because a person asked you to set up [Ragu](https://github.com/pedrohfonseca81/ragu) for their project. Ragu is a markdown knowledge base for business rules, flows, integrations and decisions, where every page cites the code it describes (`sources: api/src/billing/refund.ts:42`), agents read it over MCP, and a Stop hook stops you from finishing a task that changed code without updating the pages that cite it.

Follow the steps below in order. Run the commands yourself; ask the person only what is listed under **Ask**. Report what you did at the end using the checklist in [Report](#report).

Requirements: Node ≥ 20 and git on `PATH`. Claude Code or Antigravity (IDE or `agy` CLI) as the agent runtime.

## 0. Decide the scenario

- **Existing project**: there is code already. Go to [1](#1-existing-project). The knowledge base will be bootstrapped *from* the code.
- **New project**: little or no code yet. Go to [2](#2-new-project). The knowledge base is written *before* the code, as the specification, and the code catches up with it.

Both end in the same [layout](#layout) and the same [daily loop](#3-daily-loop).

### Layout

The knowledge base is a git repository of its own, a **sibling** of the repositories it documents:

```
work/
├── api/               ← code repository (a "system", id `api`)
├── web/               ← another system
└── knowledge-base/    ← created by create-ragu
```

In a monorepo it lives inside the repository (`work/knowledge-base/` next to `work/apps/api/`), with `"path": "../apps/api"` in its config. Either way, one knowledge base documents any number of systems.

**Ask** the person: which repositories to document (a short id and the path of each), and where the knowledge base should live. Default: sibling directory `knowledge-base`, one system per repository, id = directory name.

## 1. Existing project

### 1.1 Create the knowledge base

From the parent directory of the code repositories (so the relative paths are short):

```bash
npx create-ragu knowledge-base --systems "api:../api,web:../web" --no-remote --install --no-connect -y
```

- `--systems` is `id:path` pairs, paths relative to the knowledge base.
- `--no-remote` keeps everything local (no Cloudflare). The remote server with semantic search can be added later; see the README.
- The example docs (a fictional bookshop) are skipped automatically when real systems are given, so the docs start empty.

### 1.2 Connect the code repositories

```bash
cd knowledge-base
npx create-ragu install
```

For every system this writes, in the repository root: a marked block in `AGENTS.md` (created if missing) telling agents where the knowledge base is and the three rules; `@AGENTS.md` in `CLAUDE.md`; and the MCP server in `.mcp.json`. Nothing else goes into a repository. On this machine it registers the knowledge base in `~/.config/ragu/knowledge-bases.json` (for `ragu-mcp`) and, when Antigravity is installed, puts the ragu plugin in `~/.gemini/config/plugins/ragu/`. It is idempotent; re-run it after adding a system.

Commit those files in each repository. If a repository already had an `AGENTS.md`, only the block between `<!-- ragu:start -->` and `<!-- ragu:end -->` was added; check that it does not contradict what was already there.

### 1.3 Install the plugin for Claude Code

Claude Code plugins are per user, so this is manual:

```bash
claude plugin marketplace add pedrohfonseca81/ragu
claude plugin install ragu@ragu
```

Antigravity got its copy in 1.2. Restart the agent runtime so it loads the hook, the skills and the MCP server.

### 1.4 Bootstrap the docs from the code, one system at a time

With the plugin loaded, run the `ragu-init` skill for the first system (`/ragu-init api` in Claude Code; in Antigravity, ask for "ragu-init api"). It explores the repository and writes a **map** to `inbox/init-api.md` (modules, candidate business rules with `file:line`, integrations, flows, open questions), then **stops and asks** which pages to create. After confirmation it writes `systems/api.md`, glossary rows and `domain/*.md` pages, every one with `status: inferred`, `human_reviewed: false` and precise `sources:`, and runs `npm run check`.

If you are the agent running `ragu-init`: never skip the confirmation step, never invent a motivation for a rule (write `Reason not documented` and log the question in `inbox/QUESTIONS.md`), and never set `human_reviewed: true`.

Repeat for the other systems. Then `npm run dev` in the knowledge base to show the site at http://localhost:4321.

## 2. New project

The knowledge base is the specification. Pages are written first as `status: unverified` with `sources: []`; as the code appears, `ragu-sync` promotes them to `verified` with real `sources:`.

### 2.1 Create the repositories

```bash
mkdir -p work && cd work
mkdir api && git -C api init -q                      # one per system; empty is fine
npx create-ragu knowledge-base --systems "api:../api" --no-remote --install --no-connect -y
cd knowledge-base && npx create-ragu install
```

Then install the Claude Code plugin as in [1.3](#13-install-the-plugin-for-claude-code).

### 2.2 Write the specification as pages

**Ask** the person for the rules, flows and integrations they already know. For each, create a page from `templates/` (`rule.md`, `flow.md`, `system.md`, `adr.md`):

```yaml
---
title: Orders can be cancelled until they are shipped
domain: orders
systems: [api]
status: unverified          # nothing in the code yet
human_reviewed: false
sources: []
updated_at: 2026-01-01
---
```

Write `systems/api.md` (what the system will be), the glossary rows, one `domain/*.md` per rule, and `decisions/0001-*.md` for choices made now (use the `ragu-adr` skill: it numbers and cross-links). Run `npm run check`; it accepts `unverified` pages with empty sources.

### 2.3 Build the code against the pages

While implementing, read the pages first (`search_docs` over MCP, or open the files). When a rule lands in code, the Stop hook will notice the code change and ask for the knowledge base to follow; run `ragu-sync`: it sets `status: verified`, fills `sources:` with the exact `file:line`, and updates `updated_at`. Pages the code contradicts become `outdated` and go to `inbox/DIVERGENCES.md`; that is the signal to decide which one is right.

## 3. Daily loop

Once set up, this is what happens on every task in a connected repository:

1. Before touching a business rule, contract, integration or flow, search the knowledge base (`search_docs`) and read the pages whose `sources:` cite the files you are about to change.
2. Make the code change.
3. When you try to finish, the Stop hook checks `git status` in every system. If code changed and the knowledge base did not, it blocks **once** with the list of pages that cite the changed files. Update them (`ragu-sync`), or state explicitly that the change is purely technical (refactor, tests, dependencies).
4. `npm run check` in the knowledge base must pass: frontmatter schema, relative links, `sources` that exist, unique ADR numbers.
5. Decisions go in `decisions/` via `ragu-adr`. Doubts go in `inbox/QUESTIONS.md`, never in the pages as guesses.

Periodically, or after a big refactor, run `ragu-audit`: it re-checks every page against the code and marks what drifted.

## Rules that never bend

- The code is the truth. When a page and the code disagree, the page is `outdated`; log it in `inbox/DIVERGENCES.md`.
- Never invent the why. Without an explicit motivation in code or an ADR, write `Reason not documented` and ask.
- Never set `human_reviewed: true`. Only a person does.
- No secrets in the knowledge base. Environment variable *names* are fine.
- Standard relative markdown links, never `[[wikilinks]]`.

The full contract is `AGENTS.md` inside the knowledge base; it overrides this file.

## Report

Tell the person:

- where the knowledge base is and the systems it documents (`ragu.config.json`);
- which files were written in each code repository (`AGENTS.md`, `CLAUDE.md`, `.mcp.json`) and that they need committing;
- whether the Claude Code plugin was installed and whether the Antigravity plugin was installed (`~/.gemini/config/plugins/ragu/`);
- for an existing project: the pages created by `ragu-init`, their status, and the questions left in `inbox/QUESTIONS.md`;
- for a new project: the pages written as specification and which are still `unverified`;
- the commands they will use: `npm run dev`, `npm run check`, `ragu-sync`, `ragu-adr`, `ragu-audit`.
