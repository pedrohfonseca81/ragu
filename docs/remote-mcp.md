# Remote MCP on Cloudflare

Use this when the knowledge base should be reachable by people and agents that don't have the repo checked out, or when you want semantic search. One Cloudflare Worker serves the static site, the MCP endpoint and the reindex hook; embeddings come from Workers AI (`@cf/baai/bge-m3`) and live in Vectorize. The tools are the same three as the local server, so agents don't notice which one they talk to.

Scaffold with `--remote` (or answer yes in the wizard). Then, once:

```bash
npx wrangler login

# 1. vector index (bge-m3 = 1024 dimensions)
npx wrangler vectorize create <name>-docs --dimensions=1024 --metric=cosine

# 2. secrets
npx wrangler secret put MCP_TOKENS        # alice:<random>,bob:<random>, one per person/client, revocable individually
npx wrangler secret put REINDEX_SECRET    # any random string

# 3. first deploy + first index
npm run deploy                            # builds the site, bundles docs, deploys the worker
curl -X POST https://<worker-url>/admin/reindex -H "Authorization: Bearer <REINDEX_SECRET>"
```

Put the worker URL in `ragu.config.json → remote.url` (it is also the site's canonical URL).

## Keep the index fresh

`.github/workflows/reindex.yml` runs on every push to `main`: it waits until `GET /admin/version` reports the pushed commit (the docs bundle embeds the git SHA), then calls `POST /admin/reindex`. Configure in GitHub → Settings → Secrets and variables → Actions:

- variable `KB_URL` = the worker URL
- secret `REINDEX_SECRET` = the same value as the wrangler secret

Deploy itself is whatever you prefer: `npm run deploy` by hand, or the Cloudflare Workers Git integration on `main`.

## Connect clients

With a token from `MCP_TOKENS`:

```bash
claude mcp add --transport http knowledge-base https://<worker-url>/mcp \
  --header "Authorization: Bearer <token>"
```

Rotate or revoke one person by editing the `MCP_TOKENS` secret; nobody else is affected.

## OAuth + Cloudflare Access (for claude.ai on the web)

The claude.ai web app can't send a static bearer header; it needs an OAuth flow. Ragu ships one behind a flag:

1. Set `remote.oauth: true` in `ragu.config.json`.
2. Create a KV namespace and add the binding to `wrangler.jsonc`:
   ```bash
   npx wrangler kv namespace create OAUTH_KV
   ```
   ```jsonc
   "kv_namespaces": [{ "binding": "OAUTH_KV", "id": "<id>" }]
   ```
3. In the Cloudflare dashboard, put the worker behind **Cloudflare Access** (Zero Trust → Access → Applications) with an email OTP or SSO policy, and add a bypass rule for `/mcp*`, `/oauth/*`, `/admin/*` and `/.well-known/*`. `/authorize` must **not** be bypassed: the worker trusts the `Cf-Access-Authenticated-User-Email` header Access sets after login.
4. Deploy. Static tokens keep working alongside OAuth.
