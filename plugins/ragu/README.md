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

**Claude Code** (per user, works in every directory):

```bash
claude plugin marketplace add pedrohfonseca81/ragu
claude plugin install ragu@ragu
```

**Antigravity** (IDE or `agy` CLI): per user as well, done by `create-ragu` when `~/.gemini` exists:

```bash
npx create-ragu install          # from the knowledge base or one of its systems
```

copies this directory to `~/.gemini/config/plugins/ragu/` (a customization root Antigravity scans by itself; nothing goes into the repositories) and writes `mcp_config.json` next to it with one server, `kb` → `npx -y ragu-mcp`, exposed as `ragu_kb`. With no arguments `ragu-mcp` serves the knowledge base governing the workspace (`$PWD`), or every knowledge base registered on the machine. Re-running upgrades the copy only when this plugin's `plugin.json` version is newer (`--force` overrides). The hook command is relative to `hooks.json`, as Antigravity runs it from that directory; the hook reads the workspace from its stdin payload, so the global location does not matter. `agy plugin validate ~/.gemini/config/plugins/ragu` checks the layout.

Local development (Claude Code):

```bash
claude plugin marketplace add /path/to/ragu
claude plugin install ragu@ragu
```

## Requirements

Node ≥ 20 on `PATH` (the hook runs with `node`). No other dependencies.

Antigravity has no "already continuing" flag, so the hook keeps a small lock file per conversation under the OS temp dir and never re-blocks the same conversation for the same reason.

## Test

```bash
node --test "plugins/ragu/test/**/*.test.mjs"
```
