# Contributing

```
ragu/
├── README.md               the landing page; depth lives in docs/
├── AGENT-SETUP.md          setup instructions written for an agent (paste the raw URL to yours)
├── docs/                   this folder
├── template/               what create-ragu copies; also the example project (dogfood)
├── packages/
│   ├── create-ragu/        the scaffolder (npx create-ragu)
│   └── ragu-mcp/           local stdio MCP server (npx ragu-mcp)
├── plugins/ragu/           agent plugin (Claude Code + Antigravity): Stop hook + skills + tests
├── .claude-plugin/         marketplace manifest (claude plugin marketplace add pedrohfonseca81/ragu)
└── schema.json             JSON Schema for ragu.config.json
```

## Develop

```bash
npm install
npm test                    # all packages + plugin hook tests
npm run build:template      # full site build of the example
```

Plugin, from this checkout:

```bash
claude plugin marketplace add "$(pwd)" && claude plugin install ragu@ragu   # Claude Code
node packages/create-ragu/bin/create-ragu.mjs install                       # Antigravity: copies to ~/.gemini/config/plugins/ragu
```

`packages/create-ragu` packs a copy of `plugins/ragu` (`prepack` runs `scripts/sync-template.mjs`); in the monorepo it uses `../../plugins/ragu` directly.

## Conventions

- Docs and strings: no em dashes; a colon, a comma, a semicolon or parentheses instead.
- Skill frontmatter: quote `description:` when it contains a colon (Antigravity parses strict YAML).
- Nothing harness-specific goes into a user's repository. Per-user installs belong in the user's home.
- The hook's two dialects are tested end to end in `plugins/ragu/test/hook.test.mjs`; add a case when you add a harness ([hook.md](hook.md#adding-a-harness)).

## Roadmap

Open issues labelled [`roadmap`](https://github.com/pedrohfonseca81/ragu/issues?q=is%3Aissue+is%3Aopen+label%3Aroadmap). Contributions welcome. MIT.
