# Working with Ragu

The short version: let your agent do the setup, then work as usual and let the hook keep the docs honest.

## Let the agent set it up

[`AGENT-SETUP.md`](../AGENT-SETUP.md) is written for the agent, not for you. Paste this into your agent from the directory that holds your repositories:

```
Read https://raw.githubusercontent.com/pedrohfonseca81/ragu/main/AGENT-SETUP.md and set up Ragu for this project.
Systems: api (./api), web (./web). Knowledge base at ./knowledge-base.
```

It creates the knowledge base, connects each repository (`AGENTS.md` block, MCP), and either bootstraps the docs from the code (`ragu-init`, one system at a time, asking before writing) or, for a new project, writes the rules you dictate as `unverified` pages that the code will later verify.

## Existing project: docs come from the code

```bash
npx create-ragu knowledge-base --systems "api:../api,web:../web" --no-remote --install --connect -y   # scaffold + connect repos
claude plugin marketplace add pedrohfonseca81/ragu && claude plugin install ragu@ragu             # plugin, per user
```

Then `/ragu-init api` (or "ragu-init api" in Antigravity). The skill explores the repository and writes a **map** to `inbox/init-api.md` (modules, domain candidates with `file:line`, integrations, flows, open questions, proposed pages), then **stops and asks** which pages to create. Only after you confirm does it write `systems/api.md`, glossary rows and one `domain/*.md` per business rule, all with `status: inferred` and `human_reviewed: false`, and runs `npx create-ragu install api` so the repository is connected. Read the pages; flip `human_reviewed: true` on the ones that are right. Repeat per system, never several at once.

## New project: docs are the spec

Same scaffold with empty repositories. Write the rules you already know as pages with `status: unverified` and `sources: []` (from `templates/`), record the first decisions with `/ragu-adr`. As you implement, the Stop hook notices code changes and asks for `ragu-sync`, which turns `unverified` into `verified` with real sources. A page the code ends up contradicting becomes `outdated` and lands in `inbox/DIVERGENCES.md`: a spec/implementation conflict, caught at the moment it happens.

## A day with it

You, in `api/`: *"Extend the refund window from 30 to 45 days."*

1. The agent searches the knowledge base (`search_docs "refund"`), reads `domain/refunds.md` (`sources: api/src/billing/refund.ts:18`) and finds it links `decisions/0004-refund-window.md`: the 30 days came from a payment-provider chargeback limit. It tells you before changing anything.
2. You say go. It edits `refund.ts`, and tries to finish.
3. The Stop hook: *"Code changed but the knowledge base did not: `domain/refunds.md` cites `api/src/billing/refund.ts:18`."* The agent updates the page (new value, same source line, `updated_at` today), writes `decisions/0009-refund-window-45-days.md` with the reason you gave, runs `npm run check`, and only then finishes.
4. Next week a teammate's agent, in another repo, another tool, asks "why 45 days?" and gets the ADR, not a guess.

Nothing here depends on the agent remembering to document: the `sources:` reverse map and the hook do the remembering. Your part is reviewing pages and flipping `human_reviewed`.

## Skills

| skill | what it does |
|---|---|
| `/ragu-sync` | Diffs every configured system, classifies changes as behavioural or technical, updates the pages that cite the changed files (or creates new ones from `templates/`), fixes `sources`/`status`/`updated_at`, runs `check`. |
| `/ragu-init <system-id>` | Two-phase bootstrap of one system: map to `inbox/init-<id>.md` → confirmation → pages with `status: inferred` → `create-ragu install`. Never several systems at once. |
| `/ragu-adr <title>` | Next `NNNN`, filled ADR template, cross-links from the affected `systems/` and `domain/` pages. |
| `/ragu-audit [scope]` | `check --json` + git-history staleness (`sources` newer than `updated_at`) + claim-by-claim comparison; fixes drifted line numbers, marks unresolvable divergences `outdated`, logs them. |

In Antigravity the same skills are activated by description ("ragu-sync", "ragu-audit the domain section").

## Humans

`npm run dev` in the knowledge base serves a [Starlight](https://starlight.astro.build) site at `http://localhost:4321`. Open `src/content/docs/` in Obsidian if you prefer: links are plain relative markdown (`../domain/refunds.md`) and the site rewrites them to routes at build time, so both tools work on the same files. The build also emits `/llms.txt`, `/llms-small.txt` and `/llms-full.txt` for tools that prefer one file over MCP.
