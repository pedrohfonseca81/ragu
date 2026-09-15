---
name: ragu-adr
description: Creates a new Architecture Decision Record in the Ragu knowledge base with the next sequential number, the standard template and links to related pages. Use when the user says "record this decision", "write an ADR", or makes an architectural/technology choice worth preserving.
tools: Read, Glob, Grep, Bash, Edit, Write
---

# /ragu-adr <short title> — record a decision

## 1. Number and file name

Find the knowledge base (`ragu.config.json`). List `decisions/` and take the highest `NNNN` prefix + 1 (start at `0001`). Slug the title: lowercase, ASCII, hyphens, ≤ 60 chars. File: `decisions/NNNN-<slug>.md`.

## 2. Content

Start from `templates/adr.md`. Fill every section; never leave template placeholders:

- **Title**: `NNNN - <title>`.
- **Frontmatter**: `domain` (the area the decision affects), `systems` (ids from the config that it touches), `status: unverified` for a decision not yet implemented or `verified` when you checked the code implements it, `sources` (the ADR in the code repo if one exists, plus the code that implements it), `updated_at` today, `human_reviewed: false`.
- **Status**: `proposed` (default) or `accepted` if the user says it is decided. `superseded` only when replacing an older ADR — then edit the old one's Status to `superseded` and link both ways.
- **Context**: the forces at play, as stated by the user or found in code/issues. Do not embellish.
- **Decision**: one clear statement.
- **Alternatives considered**: only ones actually discussed or documented; else `Not documented`.
- **Consequences**: positive and negative; include what becomes harder.
- **Verification in code**: what you checked, or "Not yet implemented".
- **Related**: relative links to affected `domain/`, `flows/`, `systems/` pages.

## 3. Cross-link

Add a link to the new ADR under "Related" in the pages it affects (at minimum the `systems/<id>.md` of each system involved).

## 4. Validate

Run `npm run check` in the knowledge base. Report the file path and the pages you linked from.
