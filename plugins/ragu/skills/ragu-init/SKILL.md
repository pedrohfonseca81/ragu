---
name: ragu-init
description: Bootstraps the Ragu knowledge base for one existing system (repository): maps its modules, domains and business rules, asks for confirmation, then writes the initial pages with status inferred. Use when adopting Ragu on an existing codebase or adding a new system to the config.
tools: Read, Glob, Grep, Bash, Edit, Write, AskUserQuestion
---

# /ragu-init <system-id>: bootstrap documentation for one system

Argument: a system `id` from `ragu.config.json → systems`. If missing or unknown, list the configured ids and ask which one. **One system per run**; never bootstrap several at once.

This skill is deliberately two-phase. Phase 1 produces a map and stops; Phase 2 writes pages only after the user confirms. Dumping dozens of confident pages from a first skim is the failure mode to avoid.

## Phase 1: map the system (no docs written yet)

Explore `systems[id].path`:

1. **Shape**: language, framework, package manager, entry points, how it is run (README, package manifest, Dockerfile, CI).
2. **Modules**: top-level folders/packages and what each owns. Prefer the code's own vocabulary.
3. **Domain candidates**: entities, aggregates, state machines (`status` enums, transitions), money/permissions/limits: anything that reads as a business rule. For each, note `path:line`.
4. **Integrations**: outbound HTTP clients, webhooks, queues, third-party SDKs, and the env var *names* they use (never values).
5. **Flows**: 2–4 end-to-end sequences that cross module or system boundaries (e.g. checkout, signup, refund).
6. **Existing decisions**: ADRs, `docs/`, design notes, long comments explaining a choice.
7. **Doubts**: anything you could not determine from code; write them as questions with the source that raised them.

Write all of it to `inbox/init-<system-id>.md` in the knowledge base, structured as:

```
# Init map: <system-id>
## Shape
## Modules
## Domain candidates          (table: concept | where | rule as you understand it | confidence)
## Integrations
## Flows
## Existing decisions
## Open questions
## Proposed pages             (path → one-line purpose)
```

Then **stop and ask** the user to review the "Proposed pages" list: which to create, which to merge or drop, and answers to any blocking questions. Use `AskUserQuestion` if available; otherwise ask in plain text and wait.

## Phase 2: write the pages (after confirmation)

Use the files in the knowledge base's `templates/` and the frontmatter from `AGENTS.md`. For every page:

- `status: inferred` unless you read a named rule in the code, in which case `verified`.
- `human_reviewed: false`, always.
- `sources:` with precise `<system-id>/<path>:<line>` entries for every claim.
- `updated_at:` today.
- Motivation only when the code or an ADR states it; otherwise `Reason not documented`.

Create, in this order:

1. `systems/<system-id>.md` from `templates/system.md`.
2. Glossary entries in `glossary.md` (business term → code identifier → page link). Append; do not rewrite existing rows.
3. `domain/*.md` for each confirmed rule (one concept per page) from `templates/rule.md`.
4. `flows/*.md` for confirmed flows from `templates/flow.md` (Mermaid sequence diagrams; label unverified steps "unknown").
5. `integrations/*.md` for third parties.
6. `decisions/NNNN-*.md` only for decisions that already exist in the repo (import them, next free number); never invent ADRs.
7. Move remaining open questions to `inbox/QUESTIONS.md` and delete `inbox/init-<system-id>.md`.

Link pages to each other with relative markdown links. Add the system to `index.md` (overview + diagram) if it is not there.

## Connect the repository

Run `npx create-ragu install <system-id>` from the knowledge base. It writes, in the system's repository, a marked block in `AGENTS.md` pointing at the knowledge base, `@AGENTS.md` in `CLAUDE.md`, the MCP server in `.mcp.json`, and the agent plugin in `.agents/plugins/ragu/` (Antigravity). Tell the user to commit those files there. Do not hand-write the block: the command is idempotent and future runs update it in place.

## Validate and report

Run `npm run check` in the knowledge base and fix all errors. Report the pages created with their status, the questions left in `inbox/QUESTIONS.md`, and the files written in the system's repository.
