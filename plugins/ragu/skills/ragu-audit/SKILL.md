---
name: ragu-audit
description: Audits the Ragu knowledge base against the code — checks every page's sources still exist and still say what the page claims, marks divergent pages outdated and records divergences. Use periodically, after large refactors, or when the user asks whether the docs are still accurate.
tools: Read, Glob, Grep, Bash, Edit, Write
---

# /ragu-audit [section-or-path] — verify the knowledge base against the code

Optional argument narrows the audit to one section (`domain`), one page (`domain/refunds.md`) or one system id. Default: everything, in this order: `domain/`, `flows/`, `integrations/`, `decisions/`, `systems/`, `standards/`, `glossary.md`.

## 1. Deterministic pass

In the knowledge base root run `node scripts/check.mjs --json`. Every error there is a finding (unknown system, missing source file, broken link). Fix trivial ones (moved file → update the path); everything else goes into the report below.

Then, for each page in scope, compute staleness from git history:

```bash
# inside systems[id].path, for each source file of the page
git log -1 --format=%cs -- <path>
```

If the last commit date of any source is **after** the page's `updated_at`, the page is *suspect*.

## 2. Semantic pass (suspect pages first, then the rest)

For each page:
1. Read the page and every `sources:` entry (the file, around the cited line — the line number may have drifted; find the construct by name).
2. Compare claim by claim: values, conditions, allowed statuses, error codes, exceptions, who can do what.
3. Decide:
   - **Accurate** → refresh line numbers if they drifted, set `updated_at` today, keep `status`.
   - **Fixable divergence** (you can state the current behaviour with confidence from code) → rewrite the claim, set `status: verified`, `updated_at` today, and log a short entry in `inbox/DIVERGENCES.md` ("was X, code does Y since <commit/date>") so humans know it changed.
   - **Unresolvable divergence** (contradiction between two places in code, or intent unclear) → set `status: outdated`, add a detailed entry to `inbox/DIVERGENCES.md` with both sources, and a question in `inbox/QUESTIONS.md`.
   - **Source gone, concept gone** → propose deletion in the report; do not delete pages yourself.

Never set `human_reviewed: true`. Never invent a "why".

## 3. Validate and report

Run `npm run check`. Then report a table:

| page | result (accurate / fixed / outdated / delete?) | what changed | sources touched |

Followed by the counts and the list of entries added to `inbox/`.
