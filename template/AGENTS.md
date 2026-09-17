# Agent Guidelines: Knowledge Base

This repository is the **single source of truth** for business rules, flows, integrations and decisions of the systems listed in `ragu.config.json`. It is read by humans (Starlight site, Obsidian vault) and by agents (via MCP and the `ragu` Claude Code plugin).

## Layout (`src/content/docs/`)

The top-level folders are defined by `sections` in `ragu.config.json`. Defaults:

- `index.md`: overview and system diagram.
- `glossary.md`: business language → code mapping.
- `systems/`: technical context of each repository (one file per system id).
- `domain/`: business rules, one cluster per page (see *Page granularity*).
- `flows/`: end-to-end sequence diagrams and flows.
- `integrations/`: contracts with third parties and gateways.
- `decisions/`: ADRs, numbered `NNNN-slug.md`.
- `standards/`: engineering conventions.
- `inbox/` (outside the site): uncertain material, open questions (`QUESTIONS.md`) and divergences (`DIVERGENCES.md`).

Templates for new pages live in `templates/`.

## Page granularity

A page is the set of rules that **change together** and live in **one module** of the code. Not one page per rule (hundreds of 15-line fragments with no narrative) and not one page per domain (a wall the reader and the search cannot navigate). Billing as "commission, discount and split" is one page; billing as "everything money-related" is three or four.

Split a page when any of these holds:

- the body passes ~8 KB (about 100 lines of prose);
- `sources:` cites more than ~8 files, or files from more than one module;
- it describes more than one state machine or more than one independent rule cluster;
- a reader would come to it for one section and skip the rest.

Why it matters: search indexes each page as one unit and returns the whole page, so a page that mixes topics is found less precisely and costs more context; and the Claude Code hook marks a page stale whenever any of its `sources` changes, so a page citing many files is flagged (and re-read) for changes that concern one of its sections.

`npm run check` warns when a page crosses the size or sources threshold. When it does, split it into sibling pages (`billing-split.md`, `billing-subscriptions.md`), keep the shared context in a short overview page, and update the links.

## Frontmatter

Every page in `src/content/docs/` must have:

```yaml
---
title: Clear title of the rule or concept
domain: domain-name
systems: [api]              # ids from ragu.config.json → systems
status: verified | inferred | unverified | outdated
human_reviewed: false
sources:
  - api/src/path/file.ts:42   # <system-id>/<path>[:line]
updated_at: YYYY-MM-DD
---
```

- `verified`: confirmed in code, with `file:line` in `sources`.
- `inferred`: deduced from behaviour; no named rule in the code.
- `unverified`: inherited from prose documentation only.
- `outdated`: code and documentation diverge (also record it in `inbox/DIVERGENCES.md`).
- **`human_reviewed: true` is NEVER set by agents.** Only a human flips it.

`sources` is what keeps the base honest: the Claude Code hook uses it to find which pages may be stale when code changes. Always point to the most specific file (and line) you actually read.

## Non-negotiable rules

1. **Code defines the truth.** When code and docs disagree, the code wins; mark the page `outdated` and log the divergence.
2. **Never invent the why.** If the motivation is not explicit in code or an ADR, write `Reason not documented` and add the question to `inbox/QUESTIONS.md`.
3. **No secrets.** Never commit tokens, passwords or real `.env` values. Environment variable *names* are fine.
4. **Standard relative markdown links** (`[text](../domain/page.md)`), never `[[wikilinks]]`: they must work in both Obsidian and Starlight.
5. **Run `npm run check` before every commit** (and `npm run build` before pushing). Never disable validations.
