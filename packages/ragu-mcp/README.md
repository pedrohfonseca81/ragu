# ragu-mcp

Local MCP server (stdio) for a [Ragu](https://github.com/pedrohfonseca81/ragu) knowledge base. Lexical search with MiniSearch over your markdown docs: no cloud, no model download, indexes in under a second and re-indexes when files change.

```bash
claude mcp add knowledge-base -- npx ragu-mcp --root /path/to/knowledge-base
```

Options: `--root <dir>`, `--no-watch`. Without `--root` it serves, in order: the knowledge base that governs cwd (`ragu.config.json` upwards, in a sibling directory whose `systems` include cwd's repository, or in the monorepo that contains cwd); the one governing `$PWD`; or every knowledge base registered in `$XDG_CONFIG_HOME/ragu/knowledge-bases.json` by `create-ragu install`. Several knowledge bases are served as one index: each document carries a `kb` field, `search_docs` and `list_documents` take a `kb` filter, and `get_document` takes `kb` when the same path exists in more than one. `RAGU_CONFIG=/path/to/ragu.config.json` overrides everything. That is what lets the configs written by `create-ragu install` (a repository's `.mcp.json`, the Antigravity plugin's `mcp_config.json`) run it with no arguments, and lets one user-level MCP entry (`claude mcp add --scope user ragu -- npx -y ragu-mcp`) cover every project.

Tools, identical signatures to the remote Cloudflare worker:

- `search_docs(query, systems?, domain?, status?, topK?)`
- `get_document(path)`
- `list_documents(systems?, domain?)`

Documents with `status: outdated` carry a warning in the response.
