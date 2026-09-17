<p align="center">
  <img src="assets/ragu-banner.png" alt="Ragu" width="720">
</p>

<p align="center"><strong>A knowledge base that stays true to your code, and that your agents can actually use.</strong></p>

<p align="center">
  <a href="https://www.npmjs.com/package/create-ragu"><img alt="npm" src="https://img.shields.io/npm/v/create-ragu?label=npm&color=c0392b"></a>
  <a href="https://github.com/pedrohfonseca81/ragu/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/pedrohfonseca81/ragu/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-cream"></a>
</p>

<p align="center"><sub><a href="docs/readme/README.zh-CN.md">中文</a> · <a href="docs/readme/README.ja.md">日本語</a> · <a href="docs/readme/README.ko.md">한국어</a> · <a href="docs/readme/README.es.md">Español</a> · <a href="docs/readme/README.fr.md">Français</a> · <a href="docs/readme/README.pt-BR.md">Português</a></sub></p>

Ragu gives you a markdown knowledge base for business rules, flows, integrations and decisions, with three things most doc setups lack:

1. **Every page cites the code it describes** (`sources: api/src/billing/refund.ts:42`), and the build fails when a citation or a link breaks.
2. **Agents read it over MCP**, locally in one command or remotely on Cloudflare with semantic search.
3. **An agent plugin keeps it in sync.** When code changes and the docs don't, the agent is stopped with the exact list of pages that cite the changed files, before it declares the task done.

Humans get a [Starlight](https://starlight.astro.build) site and an Obsidian vault from the same files. Nothing is hidden behind a service: it is markdown, a JSON config, and a few hundred lines of Node.

<p align="center">
  <img src="assets/ragu-flow.svg" alt="Code changes reach the agent; the plugin writes the knowledge base and reads it over ragu-mcp; pages cite code back with sources; the build publishes site, vault and llms.txt" width="720">
</p>

## Quick start

Requirements: Node ≥ 20, git, and an agent from the [table below](#supported-agents).

**1. Create the knowledge base** next to the repositories it will document. The wizard asks for the systems (`api:../api, web:../web`), connects each repository (`AGENTS.md` block, `.mcp.json`) and offers to install the plugin.

```bash
npx create-ragu knowledge-base
```

**2. Install the plugin for your agent** (per user; the wizard did it for Claude Code if you said yes):

```bash
claude plugin marketplace add pedrohfonseca81/ragu && claude plugin install ragu@ragu
```

**3. Bootstrap the docs from the code**, one system at a time:

```
/ragu-init api
```

The skill maps the repository, asks which pages to create, and writes them with `status: inferred` and `file:line` sources. Review, flip `human_reviewed: true` on the ones that are right, repeat per system. `npm run dev` in the knowledge base serves the site; `npx ragu-mcp` is the MCP server your agent already has ([details](docs/agents.md#ragu-mcp)).

Or let the agent do all of it: paste this from the directory that holds your repositories.

```
Read https://raw.githubusercontent.com/pedrohfonseca81/ragu/main/AGENT-SETUP.md and set up Ragu for this project.
Systems: api (./api), web (./web). Knowledge base at ./knowledge-base.
```

## Supported agents

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

Supported means the Stop hook, the skills and MCP. A harness that is not supported can still read the knowledge base over MCP (`npx -y ragu-mcp`, [setup](docs/agents.md#any-mcp-client)) and follow the `AGENTS.md` rules, but nothing stops it from finishing with stale docs. Adapters are tracked in [#1](https://github.com/pedrohfonseca81/ragu/issues/1); adding one is [one function](docs/hook.md#adding-a-harness). claude.ai on the web uses the [remote server](docs/remote-mcp.md#oauth--cloudflare-access-for-claudeai-on-the-web).

Nothing harness-specific is written into your repositories: `install` leaves `AGENTS.md`, `CLAUDE.md` and `.mcp.json` there and installs plugins per user.

## How it works

Every page carries frontmatter with `status` (`verified` · `inferred` · `unverified` · `outdated`), `human_reviewed`, and `sources:` citing `<system>/<file>[:line]`. `scripts/check.mjs` validates all of it, plus links and ADR numbering, in under two seconds.

The plugin's **Stop hook** runs when the agent is about to finish. If code changed in a configured system and the knowledge base did not, it blocks once, naming the changed files and every page whose `sources:` cite them; the agent updates the pages (`ragu-sync`) or explains why the change is purely technical. If the docs changed too, it runs `check` and blocks on errors. The `sources:` reverse map is what makes this precise, which is why the skills insist on `file:line` citations. Two rules the agents follow: **the code is the truth** (a page the code contradicts becomes `outdated` and is logged in `inbox/DIVERGENCES.md`) and **never invent the why** (`Reason not documented`, plus a question in `inbox/QUESTIONS.md`).

| skill | what it does |
|---|---|
| `ragu-sync` | updates the pages that cite the changed files, fixes `sources`/`status`/`updated_at`, runs `check` |
| `ragu-init <system>` | maps a repository, asks, then writes its first pages as `inferred` |
| `ragu-adr <title>` | next-numbered ADR, cross-linked from the pages it affects |
| `ragu-audit [scope]` | re-checks every citation against the code; marks divergences `outdated` |

## Documentation

- [Working with Ragu](docs/workflow.md): agent-driven setup, existing vs new project, a day with it
- [Supported agents](docs/agents.md): what each harness gets, how to connect any MCP client, `ragu-mcp`
- [Writing pages](docs/writing-pages.md): frontmatter, statuses, sections, sources, links
- [Configuration](docs/config.md): `ragu.config.json`, layouts, `create-ragu` options, scripts
- [The Stop hook](docs/hook.md): how it decides, how it finds the knowledge base, running it elsewhere
- [Remote MCP on Cloudflare](docs/remote-mcp.md): semantic search, tokens, OAuth for claude.ai
- [Contributing](docs/contributing.md): repository layout, conventions, [roadmap](https://github.com/pedrohfonseca81/ragu/issues?q=is%3Aissue+is%3Aopen+label%3Aroadmap)

[`AGENT-SETUP.md`](AGENT-SETUP.md) is the setup guide written for agents. MIT.
