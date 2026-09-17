# The Stop hook

The plugin registers a **Stop hook**: a script that runs every time the agent is about to finish a turn.

```
agent is done
   │
   ├─ no ragu.config.json governs cwd?              → allow, silently
   ├─ no uncommitted code changes in any system?    → allow
   ├─ docs changed too?                             → run scripts/check.mjs
   │        ├─ passes                                → allow ("validated")
   │        └─ fails                                 → BLOCK with the errors
   └─ code changed, docs didn't
            ├─ already reminded this session?       → allow
            └─ first time                            → BLOCK once:
                  "Code changed but the knowledge base did not.
                   Changed: api: src/billing/refund.ts
                   Pages whose sources cite these files:
                     - domain/refunds.md (sources: api/src/billing/refund.ts:42)
                   Update them (/ragu-sync), or say why this change is purely technical."
```

The reverse map (*changed file → pages that cite it*) comes from the `sources:` frontmatter, which is why the skills insist on precise citations. It is a strong nudge, not a proof: after one block the agent may finish with a justification (refactors, lint, tests). The `check.mjs` gate is what keeps the base structurally valid at all times.

"Code" is decided by `hook.codeExtensions` and `hook.ignore` in `ragu.config.json`. Systems may be subdirectories of a larger git repository (`"path": "../apps/api"`): changes are listed with `git status -- .` inside the system and reported relative to it.

## How it finds the knowledge base

From a code repository the hook walks up from `cwd` looking for `ragu.config.json`, and at each level also looks one directory down, so a sibling `knowledge-base/` is found from `api/src/...`, but only if `api` is one of its configured `systems`. The workspace directory that holds the knowledge base *and* at least one of its systems (the sibling layout's parent, or a monorepo root) is governed by it too, so the hook also runs when the agent is started from there.

Git worktrees are followed: a linked worktree of a system (`git worktree add`, or Claude Code's `.claude/worktrees/<branch>/`) is governed by the same knowledge base, and the hook inspects the worktree being edited rather than the main checkout; a `ragu.config.json` read from a worktree of the knowledge base still resolves its `systems` from the main tree.

`RAGU_CONFIG=/path/to/ragu.config.json` forces a knowledge base. `ragu-mcp` uses the same rules, plus `$PWD` and the per-user registry as fallbacks ([agents.md](agents.md#ragu-mcp)).

## Once per session

The reminder is issued once per session, so the agent is never trapped: the hook keeps a lock file per session id under `$TMPDIR/ragu-hook/` (24 h), and Claude Code additionally sends `stop_hook_active` when it is already continuing because of a hook, which short-circuits everything. A failing `check.mjs` is reported the same way: once, with the errors.

## Running it outside a harness

`plugins/ragu/hooks/enforce.mjs` reads a JSON payload on stdin and prints a JSON decision:

```bash
echo '{ "cwd": "/path/to/api", "session_id": "shell-1" }' | node plugins/ragu/hooks/enforce.mjs
```

Two dialects are understood, detected from the payload:

| harness | payload | block answer | allow answer |
|---|---|---|---|
| Claude Code | `{ "cwd", "session_id", "stop_hook_active" }` | `{ "decision": "block", "reason" }` | `{}` or `{ "systemMessage" }` |
| Antigravity | `{ "workspacePaths", "conversationId", "executionNum" }` | `{ "decision": "continue", "reason" }` | `{}` or `{ "decision": "allow", "reason" }` |

The manifests are in the same directory: `hooks/hooks.json` for Claude Code, `hooks.json` for Antigravity (Antigravity runs the command with the plugin directory as cwd, so the path is relative to it).

## Adding a harness

Adding another agent is one entry in `adapt()` in `enforce.mjs`: how to read `cwd` and a session id from its payload, whether it has an "already continuing" flag, and how to phrase block and allow. Then a manifest in whatever format that harness wants, and a row in [agents.md](agents.md). Contributions welcome; the tests in `plugins/ragu/test/hook.test.mjs` show both existing dialects end to end.
