# ragu-mcp

Local MCP server (stdio) for a [Ragu](https://github.com/pedrohfonseca81/ragu) knowledge base. Lexical search with MiniSearch over your markdown docs: no cloud, no model download, indexes in under a second and re-indexes when files change.

```bash
npx ragu-mcp [--root <dir>] [--no-watch]
claude mcp add knowledge-base -- npx -y ragu-mcp --root /path/to/knowledge-base
```

Without `--root` it serves, in order: the knowledge base that governs cwd (`ragu.config.json` upwards, in a sibling directory whose `systems` include cwd's repository, or in the monorepo that contains cwd); the one governing `$PWD`; or every knowledge base registered in `$XDG_CONFIG_HOME/ragu/knowledge-bases.json` by `create-ragu install`. That is what lets the configs written by `create-ragu install` run it with no arguments, and lets one user-level entry (`claude mcp add --scope user ragu -- npx -y ragu-mcp`) cover every project. `RAGU_CONFIG=/path/to/ragu.config.json` overrides everything.

Tools, identical to the remote Cloudflare worker's:

| tool | input | returns |
|---|---|---|
| `search_docs` | `query`, optional `systems[]`, `domain`, `status[]`, `topK`, `kb` | ranked documents with metadata + content |
| `get_document` | `path` (e.g. `domain/refunds.md`), optional `kb` | one document |
| `list_documents` | optional `systems[]`, `domain`, `kb` | metadata only |

Documents with `status: outdated` carry a warning. Several knowledge bases are served as one index: each document carries `kb`, the list/search tools take a `kb` filter, and `get_document` needs `kb` when the same path exists in more than one.

Docs: [pedrohfonseca81/ragu](https://github.com/pedrohfonseca81/ragu#readme) · [supported agents](https://github.com/pedrohfonseca81/ragu/blob/main/docs/agents.md)
