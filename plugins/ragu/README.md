# ragu: agent plugin (Claude Code and Antigravity)

Keeps a [Ragu](https://github.com/pedrohfonseca81/ragu) knowledge base in sync with the code it documents. One directory, two manifests:

| agent | manifest | hook | skills |
|---|---|---|---|
| Claude Code | `.claude-plugin/plugin.json` | `hooks/hooks.json` → `Stop` | `skills/*/SKILL.md`, invoked as `/ragu-*` |
| Antigravity (IDE, CLI `agy`) | `plugin.json` | `hooks.json` → `Stop` | same files, activated by description |

## What it does

**Stop hook** (`hooks/enforce.mjs`) runs every time the agent is about to finish a turn. It detects the payload format on stdin (Claude Code: `cwd`/`session_id`; Antigravity: `workspacePaths`/`conversationId`) and answers in the matching dialect (`decision: "block"` vs `decision: "continue"`).

1. Finds the knowledge base that governs the current directory (`ragu.config.json` in an ancestor; in a sibling directory whose `systems` include the current repo or a git worktree of it; or in a child directory when the current directory contains one of its `systems`, i.e. the workspace parent or monorepo root; `RAGU_CONFIG` overrides). Inside a linked worktree of a system, the hook inspects that worktree instead of the main checkout.
2. Looks for uncommitted code changes in every configured system (`git status`, filtered by `hook.codeExtensions` / `hook.ignore`).
3. If code changed **and** docs changed → runs the knowledge base's `scripts/check.mjs` and blocks on errors.
4. If code changed and docs did **not** → blocks **once per session** with the list of pages whose `sources:` cite the changed files, and instructions to update them or justify why nothing needs documenting.
5. Outside a Ragu workspace it does nothing.

Systems may be subdirectories of a larger git repository (`"path": "../apps/api"`): changes are listed with `git status -- .` inside the system and reported relative to it.

This is a nudge with a reverse map (code file → citing pages), not a formal proof of sync. The agent can still finish after explaining why a change is purely technical.

**Skills**

| Skill | Use it when |
|---|---|
| `/ragu-sync` | you changed code and want the docs to reflect it (also what the hook asks for) |
| `/ragu-init <system-id>` | adopting Ragu on an existing repo: maps the system first, writes pages after you confirm |
| `/ragu-adr <title>` | recording a decision as a numbered ADR |
| `/ragu-audit [scope]` | checking that pages still match the code; marks divergences `outdated` |

## Install

Per user, for every harness; nothing is copied into repositories. See [docs/agents.md](../../docs/agents.md).

- **Claude Code**: `claude plugin marketplace add pedrohfonseca81/ragu && claude plugin install ragu@ragu` (from a checkout: `claude plugin marketplace add "$(pwd)"`).
- **Antigravity** (IDE or `agy` CLI): `npx create-ragu install` copies this directory to `~/.gemini/config/plugins/ragu/` when `~/.gemini` exists, version-gated (`--force` reinstalls), with an `mcp_config.json` declaring one server, `kb` → `npx -y ragu-mcp`, exposed as `ragu_kb`. The hook reads the workspace from its stdin payload, so the global location does not matter; `ragu-mcp` resolves the knowledge base from `$PWD` or the per-user registry. `agy plugin validate ~/.gemini/config/plugins/ragu` checks the layout.

## Payloads

`hooks/enforce.mjs` reads JSON on stdin and prints a JSON decision. `adapt()` normalises both dialects; adding a harness is one more entry there ([docs/hook.md](../../docs/hook.md#adding-a-harness)).

| harness | in | block | allow |
|---|---|---|---|
| Claude Code | `{ cwd, session_id, stop_hook_active }` | `{ decision: "block", reason }` | `{}` or `{ systemMessage }` |
| Antigravity | `{ workspacePaths, conversationId, executionNum }` | `{ decision: "continue", reason }` | `{}` or `{ decision: "allow", reason }` |

The block is issued once per session: a lock file per session id under `$TMPDIR/ragu-hook/` (24 h), and Claude Code's `stop_hook_active` short-circuits a continuation. Antigravity runs the hook command with this directory as cwd, hence the relative path in `hooks.json`. SKILL.md `description:` values are quoted because Antigravity parses strict YAML.

## Requirements

Node ≥ 20 on `PATH` (the hook runs with `node`). No other dependencies. Tests: `node --test test/` from the repository root via `npm test`.
