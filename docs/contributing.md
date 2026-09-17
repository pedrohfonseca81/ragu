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

## TypeScript

`packages/create-ragu` and `packages/ragu-mcp` are TypeScript (`src/*.ts`, strict, `tsconfig.base.json`); `tsc` emits `dist/`, which the bins import and npm publishes. Tests live next to them as `test/*.test.ts` and run straight from the sources with `node --experimental-strip-types`, so imports carry the `.ts` extension (`rewriteRelativeImportExtensions` turns them into `.js` in `dist/`) and the syntax stays erasable (`erasableSyntaxOnly`: no enums, no parameter properties).

The Stop hook (`plugins/ragu/hooks`) and the template's scripts stay plain JavaScript on purpose: the harness runs the hook straight from the plugin checkout and users run `scripts/check.mjs` in their own project, neither with a build step. They carry `// @ts-check` and JSDoc types and are checked by the same `tsc` (`tsconfig.json` and `tsconfig.template.json` at the root). `npm run typecheck` covers all of it; CI runs it before the tests.

## Conventions

- Types: follow the `typescript` skill in `.claude/skills/typescript`: inference for locals, explicit return types on exported functions, `unknown` plus type guards instead of `any` or `as`, `interface` for object contracts.
- Docs and strings: no em dashes; a colon, a comma, a semicolon or parentheses instead.
- Skill frontmatter: quote `description:` when it contains a colon (Antigravity parses strict YAML).
- Nothing harness-specific goes into a user's repository. Per-user installs belong in the user's home.
- The hook's two dialects are tested end to end in `plugins/ragu/test/hook.test.mjs`; add a case when you add a harness ([hook.md](hook.md#adding-a-harness)).

## Translations

The README exists in six languages under `docs/readme/` (`README.<bcp47>.md`: `zh-CN`, `ja`, `ko`, `es`, `fr`, `pt-BR`). English is the reference; everything else (`docs/`, `AGENT-SETUP.md`, package READMEs) stays in English.

Each translation starts with `<!-- source: README.md@<hash> -->`, the first 12 hex characters of the sha256 of the `README.md` it was made from. `npm run check:i18n` lists the ones made from an older README; CI runs it as an advisory job that never blocks. When you change `README.md`:

1. `node scripts/check-readme-i18n.mjs --hash` prints the new hash.
2. Ask your agent to retranslate the stale files from the English README, keeping the same structure and these parts in English: code blocks, commands, file names, frontmatter keys, skill and tool names, the ASCII diagram, and the harness names in the table. Links to `docs/` point at the English pages (`../agents.md`), the banner and the license at `../../assets/...` and `../../LICENSE`.
3. Set the marker to the new hash and run `npm run check:i18n`.

Every translation carries a language switcher below the badges (`English` first) and a one-line notice that the English README is the reference. `pt-BR` is reviewed by a native speaker; the others say they are AI-generated.

## Roadmap

Open issues labelled [`roadmap`](https://github.com/pedrohfonseca81/ragu/issues?q=is%3Aissue+is%3Aopen+label%3Aroadmap). Contributions welcome. MIT.
