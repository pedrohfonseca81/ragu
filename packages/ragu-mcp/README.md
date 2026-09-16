# ragu-mcp

Local MCP server (stdio) for a [Ragu](https://github.com/useperfit/ragu) knowledge base. Lexical search with MiniSearch over your markdown docs — no cloud, no model download, indexes in under a second and re-indexes when files change.

```bash
claude mcp add knowledge-base -- npx ragu-mcp --root /path/to/knowledge-base
```

Options: `--root <dir>`, `--no-watch`. Without `--root` it serves the knowledge base that governs cwd: `ragu.config.json` upwards, or in a sibling directory whose `systems` include cwd's repository, or in the monorepo that contains cwd (`RAGU_CONFIG=/path/to/ragu.config.json` overrides). That is what lets the `.mcp.json` / `mcp_config.json` written by `create-ragu install` run it with no arguments from any connected repository.

Tools — identical signatures to the remote Cloudflare worker:

- `search_docs(query, systems?, domain?, status?, topK?)`
- `get_document(path)`
- `list_documents(systems?, domain?)`

Documents with `status: outdated` carry a warning in the response.
