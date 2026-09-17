# Supported agents

Ragu reaches an agent in three ways: a **Stop hook** that blocks it from finishing when code changed and the pages citing it did not; **skills** (`ragu-sync`, `ragu-init`, `ragu-adr`, `ragu-audit`); and **MCP** (`search_docs`, `get_document`, `list_documents`). The hook and the skills come from one plugin, [`plugins/ragu`](../plugins/ragu), with a manifest per harness. The `AGENTS.md` block written by `create-ragu install` (where the knowledge base is, search before / sync after, code is the truth) works with every agent that reads that file.

| Harness | Status |
|---|---|
| Claude Code | ✅ Supported |
| Antigravity (IDE, `agy` CLI) | ✅ Supported |
| Codex CLI | ❌ Not supported |
| OpenCode | ❌ Not supported |
| Cursor | ❌ Not supported |
| Gemini CLI | ❌ Not supported |
| GitHub Copilot | ❌ Not supported |
| Windsurf | ❌ Not supported |
| Cline | ❌ Not supported |
| Kiro | ❌ Not supported |

Supported means the Stop hook, the skills and MCP. A harness that is not supported can still read the knowledge base over MCP (`npx -y ragu-mcp`, [setup](#any-mcp-client)) and follow the `AGENTS.md` rules, but nothing stops it from finishing with stale docs. Adapters are tracked in [#1](https://github.com/pedrohfonseca81/ragu/issues/1); adding one is [one function](hook.md#adding-a-harness). claude.ai on the web uses the [remote server](remote-mcp.md#oauth--cloudflare-access-for-claudeai-on-the-web).

Nothing harness-specific is written into your repositories: `install` leaves `AGENTS.md`, `CLAUDE.md` and `.mcp.json` there and installs plugins per user.

## Claude Code

Plugins are per user, so this is the one step `create-ragu` cannot do for you (the wizard offers to run it):

```bash
claude plugin marketplace add pedrohfonseca81/ragu
claude plugin install ragu@ragu
```

You get the Stop hook and the four skills as `/ragu-sync`, `/ragu-init <system-id>`, `/ragu-adr <title>`, `/ragu-audit [scope]`, in every directory. MCP comes from the `.mcp.json` that `install` writes in each connected repository (server `<kb-name>` → `npx -y ragu-mcp`, no path: the server finds the knowledge base from the directory Claude Code was opened in). `claude mcp list` inside a repository shows it connected.

One user-level entry instead of per-repository files also works, because `ragu-mcp` falls back to every knowledge base registered on your machine (see [ragu-mcp](#ragu-mcp)):

```bash
claude mcp add --scope user ragu -- npx -y ragu-mcp
```

Local development of the plugin: `claude plugin marketplace add /path/to/ragu && claude plugin install ragu@ragu`.

## Antigravity

`create-ragu install` (and the wizard) install the plugin per user in `~/.gemini/config/plugins/ragu/` whenever `~/.gemini` exists on the machine; there is no flag, only detection. Re-running upgrades the copy when the plugin's version is newer (`--force` reinstalls). Restart `agy` or the IDE afterwards.

- Same Stop hook; Antigravity's payload (`workspacePaths`, `conversationId`) is detected on stdin and the answer is `{ "decision": "continue", "reason" }`. The hook reads the workspace from the payload, so the global location does not matter.
- Same skills, activated by description: ask for "ragu-init api" instead of typing `/ragu-init api`.
- MCP: the plugin's `mcp_config.json` declares one server, `kb` → `npx -y ragu-mcp`, which Antigravity exposes as `ragu_kb`. Antigravity starts plugin MCP servers with the plugin directory as cwd, so `ragu-mcp` looks at `$PWD` (the workspace `agy` was opened in) and then at the registry of knowledge bases on the machine.
- `agy plugin validate ~/.gemini/config/plugins/ragu` checks the layout. Antigravity's SKILL.md parser is strict YAML; keep `description:` quoted when it contains a colon.

Known limit: when the IDE is launched from outside any workspace (`$PWD` is your home), `ragu-mcp` serves every registered knowledge base as one index; documents then carry a `kb` field and the tools accept a `kb` filter.

## Any MCP client

Point the client at the local server. With `--root` it is explicit; without it, `ragu-mcp` resolves the knowledge base from cwd, then `$PWD`, then the per-user registry.

```json
{ "mcpServers": { "knowledge-base": { "command": "npx", "args": ["-y", "ragu-mcp", "--root", "/path/to/knowledge-base"] } } }
```

Cursor reads `.cursor/mcp.json` and Windsurf `~/.codeium/windsurf/mcp_config.json` in this shape; Codex takes the same command and args in `~/.codex/config.toml`. Most of these clients read `AGENTS.md`, so the rules block written by `install` applies to them too. There is no Stop hook: the agent can finish with stale docs. Running the hook yourself, or wiring it to another harness, is described in [hook.md](hook.md).

For agents without a checkout (claude.ai on the web, teammates' tools), use the [remote server](remote-mcp.md).

## ragu-mcp

`npx ragu-mcp [--root <dir>] [--no-watch]`, stdio, lexical search with MiniSearch, no cloud, no model download. Indexes in under a second and re-indexes when files change. Three tools, identical to the remote worker's:

| tool | input | returns |
|---|---|---|
| `search_docs` | `query`, optional `systems[]`, `domain`, `status[]`, `topK`, `kb` | ranked documents with metadata + content |
| `get_document` | `path` (e.g. `domain/refunds.md`), optional `kb` | one document |
| `list_documents` | optional `systems[]`, `domain`, `kb` | metadata only |

Pages with `status: outdated` come back with a warning so the agent doesn't trust them blindly.

Without `--root` it serves, in order: the knowledge base governing cwd (`ragu.config.json` upwards; in a sibling directory whose `systems` include cwd's repository; or in a child directory when cwd is the workspace parent or monorepo root); the one governing `$PWD`; or every knowledge base registered in `$XDG_CONFIG_HOME/ragu/knowledge-bases.json` (`~/.config/ragu/` by default). `create-ragu` and `create-ragu install` write that registry; entries whose config disappeared are skipped with a warning and pruned on the next write. `RAGU_CONFIG=/path/to/ragu.config.json` overrides everything.

Several knowledge bases are served as one index: every document carries `kb`, `search_docs` and `list_documents` take a `kb` filter, and `get_document` needs `kb` when the same path exists in more than one.
