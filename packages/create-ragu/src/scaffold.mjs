// Pure scaffolding logic (no prompts): copies the template and applies the answers.
// Exported separately so it can be tested without a TTY.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

const SKIP = new Set(["node_modules", "dist", ".astro", ".wrangler", "package-lock.json"]);
const REMOTE_ONLY_FILES = ["src/worker", "wrangler.jsonc", ".github/workflows/reindex.yml"];
const REMOTE_ONLY_DEPS = ["@cloudflare/workers-oauth-provider", "@modelcontextprotocol/server", "agents"];
const REMOTE_ONLY_DEV_DEPS = ["wrangler", "@cloudflare/workers-types"];
const REMOTE_ONLY_SCRIPTS = ["deploy", "predeploy"];

/** The packed copy (packages/create-ragu/template) wins; in the monorepo we use ../../template. */
export function templateDir() {
	const packed = resolve(here, "..", "template");
	if (existsSync(join(packed, "ragu.config.json"))) return packed;
	const mono = resolve(here, "..", "..", "..", "template");
	if (existsSync(join(mono, "ragu.config.json"))) return mono;
	throw new Error("template directory not found");
}

export function slugify(input) {
	return String(input)
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 64) || "knowledge-base";
}

/** "api:../api, web:../web" → [{id, path}] */
export function parseSystems(input) {
	if (!input) return [];
	return String(input)
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean)
		.map((entry) => {
			const idx = entry.indexOf(":");
			if (idx < 0) return { id: slugify(entry), path: `../${entry}` };
			return { id: slugify(entry.slice(0, idx)), path: entry.slice(idx + 1).trim() };
		});
}

function copyDir(src, dest) {
	mkdirSync(dest, { recursive: true });
	for (const entry of readdirSync(src)) {
		if (SKIP.has(entry) || entry.endsWith(".generated.json")) continue;
		const from = join(src, entry);
		// npm drops .gitignore from published packages, so the packed template stores it as _gitignore.
		const to = join(dest, entry === "_gitignore" ? ".gitignore" : entry);
		if (statSync(from).isDirectory()) copyDir(from, to);
		else cpSync(from, to);
	}
}

function editJson(file, fn) {
	const data = JSON.parse(readFileSync(file, "utf-8"));
	fn(data);
	writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

/**
 * @param {{
 *   dir: string, name: string, title: string,
 *   systems: {id: string, path: string}[],
 *   remote: boolean, example: boolean,
 * }} answers
 */
export const EXAMPLE_SYSTEMS = [
	{ id: "api", path: "../api" },
	{ id: "web", path: "../web" },
];

export function scaffold(input) {
	const notes = [];
	const answers = { ...input };
	// The example docs describe fictional systems `api` and `web`. They can only pass validation
	// when those are the configured systems, so real systems and the example are mutually exclusive.
	if (answers.example && answers.systems.length) {
		answers.example = false;
		notes.push("Example docs skipped: they describe fictional systems `api`/`web`, and you configured your own. See the templates/ folder and https://github.com/pedrohfonseca/ragu/tree/main/template for the example.");
	}
	if (answers.example) answers.systems = EXAMPLE_SYSTEMS;

	const dest = resolve(answers.dir);
	if (existsSync(dest) && readdirSync(dest).length > 0) {
		throw new Error(`${dest} is not empty`);
	}
	copyDir(templateDir(), dest);

	editJson(join(dest, "ragu.config.json"), (c) => {
		c.name = answers.name;
		c.title = answers.title;
		c.systems = answers.systems;
		if (answers.remote) {
			c.remote = {
				provider: "cloudflare",
				url: `https://${answers.name}.YOUR-ACCOUNT.workers.dev`,
				embeddingModel: "@cf/baai/bge-m3",
				vectorizeIndex: `${answers.name}-docs`,
				oauth: false,
			};
		} else {
			delete c.remote;
		}
	});

	editJson(join(dest, "package.json"), (p) => {
		p.name = answers.name;
		if (!answers.remote) {
			for (const d of REMOTE_ONLY_DEPS) delete p.dependencies?.[d];
			for (const d of REMOTE_ONLY_DEV_DEPS) delete p.devDependencies?.[d];
			for (const s of REMOTE_ONLY_SCRIPTS) delete p.scripts?.[s];
			p.scripts.prebuild = "npm run check";
		}
	});

	if (answers.remote) {
		const wr = join(dest, "wrangler.jsonc");
		writeFileSync(
			wr,
			readFileSync(wr, "utf-8")
				.replace(/"name": "acme-kb"/, `"name": "${answers.name}"`)
				.replace(/"index_name": "acme-kb-docs"/, `"index_name": "${answers.name}-docs"`),
		);
	} else {
		for (const f of REMOTE_ONLY_FILES) rmSync(join(dest, f), { recursive: true, force: true });
		rmSync(join(dest, "src", "wasm-stub.js"), { force: true });
		const astro = join(dest, "astro.config.mjs");
		// The wasm stub only matters for the Workers build.
		writeFileSync(
			astro,
			readFileSync(astro, "utf-8").replace(/\tvite: \{[\s\S]*?\n\t\},\n/, ""),
		);
	}

	if (!answers.example) writeEmptyDocs(dest, answers);

	writeFileSync(join(dest, "README.md"), projectReadme(answers));
	return { dest, notes, example: answers.example, systems: answers.systems };
}

function writeEmptyDocs(dest, answers) {
	const docs = join(dest, "src", "content", "docs");
	rmSync(docs, { recursive: true, force: true });
	const config = JSON.parse(readFileSync(join(dest, "ragu.config.json"), "utf-8"));
	for (const s of config.sections ?? []) {
		mkdirSync(join(docs, s.dir), { recursive: true });
		writeFileSync(join(docs, s.dir, ".gitkeep"), "");
	}
	const today = new Date().toISOString().slice(0, 10);
	const systemsList = answers.systems.length
		? answers.systems.map((s) => `- \`${s.id}\` — _describe this system_`).join("\n")
		: "_No systems configured yet — add them to `ragu.config.json`._";
	writeFileSync(
		join(docs, "index.md"),
		`---\ntitle: Overview\nstatus: unverified\nhuman_reviewed: false\nsources: []\nupdated_at: ${today}\n---\n\nWhat this product does, which systems exist and how they talk to each other.\n\n## Systems\n\n${systemsList}\n\n\`\`\`mermaid\nflowchart LR\n    a[system a] --> b[system b]\n\`\`\`\n\nRun \`/ragu-init <system-id>\` in Claude Code to bootstrap the documentation of a system.\n`,
	);
	writeFileSync(
		join(docs, "glossary.md"),
		`---\ntitle: Glossary\nstatus: unverified\nhuman_reviewed: false\nsources: []\nupdated_at: ${today}\n---\n\nBusiness term → where it lives in the code. One line per term; link the page that explains it.\n\n| Business term | Code | Meaning |\n|---|---|---|\n`,
	);
	writeFileSync(join(dest, "inbox", "QUESTIONS.md"), "# Questions for a human\n\nGrouped by domain. Each question carries minimal context and the source that raised it.\n");
}

function projectReadme(a) {
	const remote = a.remote
		? `
## Remote MCP (Cloudflare)

One-time setup (needs \`npx wrangler login\`):

\`\`\`bash
npx wrangler vectorize create ${a.name}-docs --dimensions=1024 --metric=cosine
npx wrangler secret put MCP_TOKENS        # e.g. alice:<random>,bob:<random>
npx wrangler secret put REINDEX_SECRET
npm run deploy
curl -X POST https://<your-worker-url>/admin/reindex -H "Authorization: Bearer <REINDEX_SECRET>"
\`\`\`

Then set \`remote.url\` in \`ragu.config.json\`, and in GitHub → Settings → Secrets and variables → Actions add the variable \`KB_URL\` and the secret \`REINDEX_SECRET\` so \`.github/workflows/reindex.yml\` re-embeds the docs after each deploy.

Connect an agent:

\`\`\`bash
claude mcp add --transport http ${a.name} https://<your-worker-url>/mcp --header "Authorization: Bearer <token>"
\`\`\`
`
		: "";
	return `# ${a.title}

Knowledge base for ${a.systems.map((s) => `\`${s.id}\``).join(", ") || "this project"} — business rules, flows, integrations and decisions, kept in sync with the code. Built with [Ragu](https://github.com/pedrohfonseca/ragu).

## Use

\`\`\`bash
npm install
npm run dev        # site at http://localhost:4321
npm run check      # fast validation: frontmatter, links, sources
npm run build      # full validation + static site
\`\`\`

Obsidian: open \`src/content/docs/\` as a vault.

## Agents

Local MCP server (no cloud):

\`\`\`bash
claude mcp add ${a.name} -- npx ragu-mcp --root ${"$(pwd)"}
\`\`\`

Claude Code plugin that keeps the docs in sync with the code:

\`\`\`bash
claude plugin marketplace add pedrohfonseca/ragu
claude plugin install ragu@ragu
\`\`\`

Skills: \`/ragu-init <system>\`, \`/ragu-sync\`, \`/ragu-adr <title>\`, \`/ragu-audit\`.
${remote}
## Layout

- \`ragu.config.json\` — systems, sections, remote settings (single source of truth)
- \`AGENTS.md\` — rules every agent must follow
- \`src/content/docs/\` — the vault (Starlight + Obsidian)
- \`templates/\` — page templates
- \`inbox/\` — open questions and divergences (not published)
`;
}
