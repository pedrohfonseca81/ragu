---
name: ragu-sync
description: Updates the Ragu knowledge base to reflect the current code changes. Use after modifying code in any configured system, when the ragu Stop hook reports stale documents, or when the user asks to sync/update the knowledge base.
tools: Read, Glob, Grep, Bash, Edit, Write
---

# /ragu-sync — reflect code changes in the knowledge base

You are updating a knowledge base that is the **single source of truth** for business rules, flows, integrations and decisions. It is read by humans and by other agents, so precision matters more than volume.

## 0. Locate the knowledge base

Find `ragu.config.json` (in the current directory, an ancestor, or a sibling directory of the code repo). Read it: `docsDir`, `systems[{id, path}]`, `sections`. Read the knowledge base's `AGENTS.md` — its rules override anything here.

## 1. Identify what changed in the code

For each system in the config, run `git status --porcelain` and `git diff` (staged and unstaged) inside `systems[].path`. Ignore lockfiles, generated files and anything under `hook.ignore`.

Classify each change:
- **Behavioural**: a business rule, validation, state machine, API contract, integration call, permission, or flow changed. → must be documented.
- **Technical only**: refactor, rename without behaviour change, lint, tests, dependencies. → no doc change; say so in your final answer.

## 2. Find the pages that cite the changed files

Search `docsDir` for frontmatter `sources:` entries of the form `<system-id>/<path>` matching the changed files (the Stop hook already lists these as "potentially stale"). Also grep page bodies for the module/function names involved.

If no page cites the file and the change is behavioural, a new page is needed. Pick the section from `ragu.config.json → sections` (default: `domain/` for a rule, `flows/` for a sequence, `integrations/` for a third party, `decisions/` for an ADR, `systems/` for repo-level context) and start from the matching file in `templates/`.

## 3. Edit the markdown

For each affected page:
- Update the rule/flow text to match the code **exactly** — values, conditions, statuses, error codes.
- Update `sources:` to the precise `<system-id>/<path>:<line>` you read. Remove sources that no longer exist.
- Set `status`:
  - `verified` when you read the code that implements it,
  - `inferred` when you deduced it from behaviour without a named rule,
  - `outdated` when the code contradicts the page and you cannot fix the page confidently — then add an entry to `inbox/DIVERGENCES.md`.
- Set `updated_at` to today (`YYYY-MM-DD`).
- **Never** set `human_reviewed: true`.
- Never invent motivation. If the "why" is not in code or an ADR, write `Reason not documented` and add the question to `inbox/QUESTIONS.md` with the source that raised it.
- Use relative markdown links (`../domain/page.md`), never wikilinks.
- Keep the glossary in sync when a business term or its code name changed.

## 4. Validate

Run `npm run check` in the knowledge base root. Fix every error. Warnings about systems not found on disk are fine.

## 5. Report

In your final answer, list the pages created/updated with their new `status`, any entries added to `inbox/`, and — for changes you classified as technical only — a one-line justification per file.
