# ragu-mcp

Local MCP server (stdio) for a [Ragu](https://github.com/pedrohfonseca/ragu) knowledge base. Lexical search with MiniSearch over your markdown docs — no cloud, no model download, indexes in under a second and re-indexes when files change.

```bash
claude mcp add knowledge-base -- npx ragu-mcp --root /path/to/knowledge-base
```

Options: `--root <dir>` (default: search upwards from cwd for `ragu.config.json`), `--no-watch`.

Tools — identical signatures to the remote Cloudflare worker:

- `search_docs(query, systems?, domain?, status?, topK?)`
- `get_document(path)`
- `list_documents(systems?, domain?)`

Documents with `status: outdated` carry a warning in the response.
