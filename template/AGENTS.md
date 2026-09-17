# Agent Guidelines: Knowledge Base

This repository is the **single source of truth** for business rules, flows, integrations and decisions of the systems listed in `ragu.config.json`. It is read by humans (Starlight site, Obsidian vault) and by agents (via MCP and the `ragu` Claude Code plugin).

## Layout (`src/content/docs/`)

The top-level folders are defined by `sections` in `ragu.config.json`. Defaults:

- `index.md`: overview and system diagram.
- `glossary.md`: business language → code mapping.
- `systems/`: technical context of each repository (one file per system id).
- `domain/`: atomic business rules (one concept per page).
- `flows/`: end-to-end sequence diagrams and flows.
- `integrations/`: contracts with third parties and gateways.
- `decisions/`: ADRs, numbered `NNNN-slug.md`.
- `standards/`: engineering conventions.
- `inbox/` (outside the site): uncertain material, open questions (`QUESTIONS.md`) and divergences (`DIVERGENCES.md`).

Templates for new pages live in `templates/`.

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
