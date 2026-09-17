# Writing pages

Every page under `src/content/docs/` has this frontmatter (validated by Zod in the site build and by `scripts/check.mjs`):

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

## Status

| status | meaning |
|---|---|
| `verified` | confirmed in code; `sources` has `file:line` |
| `inferred` | deduced from behaviour; no named rule in the code |
| `unverified` | inherited from prose docs, not yet checked against code |
| `outdated` | code and page disagree, recorded in `inbox/DIVERGENCES.md`; served with a warning |

`human_reviewed` is orthogonal: agents never set it to `true`. Flip it yourself once you have read a page and it is right.

## Sources

`sources:` is the reverse map the hook and `ragu-audit` rely on: `<system-id>/<path>[:line]`, one per claim the page makes. Cite the construct that defines the rule (the function, the enum, the migration), not the file in general. `check.mjs` fails when a source points at a file that does not exist; `ragu-audit` fixes line numbers that drifted and marks pages whose sources no longer say what the page claims.

## Sections

Default sections (configurable in `ragu.config.json → sections`):

| folder | one page per |
|---|---|
| `systems/` | repository: what it is, how to run it, where things live |
| `domain/` | business rule |
| `flows/` | end-to-end sequence that crosses modules or systems (Mermaid diagrams render in the site) |
| `integrations/` | third party |
| `decisions/` | ADR, `NNNN-slug.md`, numbered sequentially |
| `standards/` | convention |
| `glossary.md` | business term → where it lives in code |

Page templates live in `templates/`. `inbox/` (`QUESTIONS.md`, `DIVERGENCES.md`, `init-<system>.md`) is where agents leave what they could not decide; it is not published.

## Links

Standard relative markdown links, `[text](../domain/page.md)`, never `[[wikilinks]]`: they must work in Obsidian and in the Starlight build, which validates every link.

## Rules agents follow

The generated `AGENTS.md` in the knowledge base is the contract; `CLAUDE.md` includes it. The two that matter most:

- **Code defines the truth.** When a page disagrees with the code, the page is `outdated` and the divergence goes to `inbox/DIVERGENCES.md`; a human decides which one is right.
- **Never invent the why.** If the motivation is not in code or an ADR, write `Reason not documented` and log a question in `inbox/QUESTIONS.md`.

## Granularity

A page is the set of rules that change together and live in one module of the code: billing as "commission, discount and split" is one page; billing as "everything money-related" is three or four. Not one page per rule (fragments with no narrative) and not one page per domain (a wall). Split when the body passes ~8 KB, `sources:` cites more than ~8 files or files from several modules, or the page holds more than one state machine.

The thresholds are not aesthetic. Search embeds and returns whole pages, so a page that mixes topics is found less precisely and costs more context per hit; and the Stop hook flags a page stale whenever any of its `sources` changes, so a page citing fifteen files is re-read for changes that concern one of its sections. `npm run check` warns on both thresholds for `domain/`, `flows/` and `integrations/` pages (`systems/` and `decisions/` are one page per repository or decision by design).

## Validation

`npm run check` runs in under two seconds: frontmatter schema, relative links, `sources` that point at existing files, unique ADR numbers, and the granularity warnings above. It is what the Stop hook runs. `npm run build` adds the Astro build with Starlight's link validator and Mermaid rendering; run it in CI.
