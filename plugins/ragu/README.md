# ragu — Claude Code plugin

Keeps a [Ragu](https://github.com/pedrohfonseca/ragu) knowledge base in sync with the code it documents.

## What it does

**Stop hook** (`hooks/enforce.mjs`) — runs every time Claude Code is about to finish a turn:

1. Finds the knowledge base that governs the current directory (`ragu.config.json` in an ancestor, or in a sibling directory whose `systems` include the current repo; `RAGU_CONFIG` overrides).
2. Looks for uncommitted code changes in every configured system (`git status`, filtered by `hook.codeExtensions` / `hook.ignore`).
3. If code changed **and** docs changed → runs the knowledge base's `scripts/check.mjs` and blocks on errors.
4. If code changed and docs did **not** → blocks **once per session** with the list of pages whose `sources:` cite the changed files, and instructions to update them or justify why nothing needs documenting.
5. Outside a Ragu workspace it does nothing.

This is a nudge with a reverse map (code file → citing pages), not a formal proof of sync. The agent can still finish after explaining why a change is purely technical.

**Skills**

| Skill | Use it when |
|---|---|
| `/ragu-sync` | you changed code and want the docs to reflect it (also what the hook asks for) |
| `/ragu-init <system-id>` | adopting Ragu on an existing repo — maps the system first, writes pages after you confirm |
| `/ragu-adr <title>` | recording a decision as a numbered ADR |
| `/ragu-audit [scope]` | checking that pages still match the code; marks divergences `outdated` |

## Install

```bash
claude plugin marketplace add pedrohfonseca/ragu
claude plugin install ragu@ragu
```

Local development:

```bash
claude plugin marketplace add /path/to/ragu
claude plugin install ragu@ragu
```

## Requirements

Node ≥ 20 on `PATH` (the hook runs with `node`). No other dependencies.

## Test

```bash
node --test "plugins/ragu/test/**/*.test.mjs"
```
