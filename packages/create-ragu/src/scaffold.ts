// Pure scaffolding logic (no prompts): copies the template and applies the answers.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mergeMcpJson } from "./connect.ts";
import { copyDir, editJson } from "./fs.ts";
import type { ScaffoldAnswers, ScaffoldResult, SystemSpec } from "./types.ts";

const here = dirname(fileURLToPath(import.meta.url));

export const TEMPLATE_SKIP = new Set(["node_modules", "dist", ".astro", ".wrangler", "package-lock.json"]);
export const REMOTE_ONLY_FILES = ["src/worker", "wrangler.jsonc", ".github/workflows/reindex.yml", "src/wasm-stub.js"];
export const REMOTE_ONLY_DEPS = ["@cloudflare/workers-oauth-provider", "@modelcontextprotocol/server", "agents"];
export const REMOTE_ONLY_DEV_DEPS = ["wrangler", "@cloudflare/workers-types"];
export const REMOTE_ONLY_SCRIPTS = ["deploy", "predeploy"];

export const EXAMPLE_SYSTEMS: readonly SystemSpec[] = [
	{ id: "api", path: "../api" },
	{ id: "web", path: "../web" },
];

interface RaguConfigJson {
	name: string;
	title: string;
	systems: SystemSpec[];
	sections?: { dir: string; label: string }[];
	remote?: Record<string, unknown>;
}

interface PackageJson {
	name: string;
	scripts: Record<string, string>;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
}

/** Without the remote worker, the Workers-only wasm alias goes; the rest of the `vite` block stays. */
export function stripRemoteFromAstroConfig(source: string): string {
	return source.replace(/\t\tresolve: \{\n\t\t\talias: \{[\s\S]*?\n\t\t\t\},\n\t\t\},\n/, "");
}

/** The packed copy (./template) wins; in the monorepo we use ../../template. */
export function templateDir(): string {
	for (const candidate of [resolve(here, "..", "template"), resolve(here, "..", "..", "..", "template")]) {
		if (existsSync(join(candidate, "ragu.config.json"))) return candidate;
	}
	throw new Error("template directory not found");
}

export function slugify(input: string): string {
	const slug = input
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 64);
	return slug || "knowledge-base";
}

/** "api:../api, web:../web" → [{ id, path }]; a bare "api" means "../api". */
export function parseSystems(input: string | undefined): SystemSpec[] {
	if (!input) return [];
	return input
		.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean)
		.map((entry) => {
			const colon = entry.indexOf(":");
			if (colon < 0) return { id: slugify(entry), path: `../${entry}` };
			return { id: slugify(entry.slice(0, colon)), path: entry.slice(colon + 1).trim() };
		});
}

export function scaffold(input: ScaffoldAnswers): ScaffoldResult {
	const notes: string[] = [];
	const answers = { ...input };
	// The example docs describe fictional systems `api` and `web`. They only pass validation with
	// those systems configured, so real systems and the example are mutually exclusive.
	if (answers.example && answers.systems.length) {
		answers.example = false;
		notes.push("Example docs skipped: they describe fictional systems `api`/`web`, and you configured your own. See the templates/ folder and https://github.com/pedrohfonseca81/ragu/tree/main/template for the example.");
	}
	if (answers.example) answers.systems = [...EXAMPLE_SYSTEMS];

	const dest = resolve(answers.dir);
	if (existsSync(dest) && readdirSync(dest).length > 0) throw new Error(`${dest} is not empty`);
	copyDir(templateDir(), dest, {
		skip: TEMPLATE_SKIP,
		skipIf: (name) => name.endsWith(".generated.json"),
		// npm drops .gitignore from published packages, so the packed template stores it as _gitignore.
		rename: (name) => (name === "_gitignore" ? ".gitignore" : name),
	});

	editJson<RaguConfigJson>(join(dest, "ragu.config.json"), (config) => {
		config.name = answers.name;
		config.title = answers.title;
		config.systems = answers.systems;
		if (answers.remote) {
			config.remote = {
				provider: "cloudflare",
				url: `https://${answers.name}.YOUR-ACCOUNT.workers.dev`,
				embeddingModel: "@cf/baai/bge-m3",
				vectorizeIndex: `${answers.name}-docs`,
				oauth: false,
			};
		} else {
			delete config.remote;
		}
	});

	editJson<PackageJson>(join(dest, "package.json"), (pkg) => {
		pkg.name = answers.name;
		if (answers.remote) return;
		for (const dep of REMOTE_ONLY_DEPS) delete pkg.dependencies?.[dep];
		for (const dep of REMOTE_ONLY_DEV_DEPS) delete pkg.devDependencies?.[dep];
		for (const script of REMOTE_ONLY_SCRIPTS) delete pkg.scripts[script];
		pkg.scripts.prebuild = "npm run check";
	});

	if (answers.remote) {
		const wrangler = join(dest, "wrangler.jsonc");
		writeFileSync(
			wrangler,
			readFileSync(wrangler, "utf-8")
				.replace(/"name": "acme-kb"/, `"name": "${answers.name}"`)
				.replace(/"index_name": "acme-kb-docs"/, `"index_name": "${answers.name}-docs"`),
		);
	} else {
		for (const file of REMOTE_ONLY_FILES) rmSync(join(dest, file), { recursive: true, force: true });
		const astro = join(dest, "astro.config.mjs");
		writeFileSync(astro, stripRemoteFromAstroConfig(readFileSync(astro, "utf-8")));
	}

	if (!answers.example) writeEmptyDocs(dest, answers.systems);

	// The knowledge base is itself an agent workspace (ADRs, audits): give it the MCP config too.
	mergeMcpJson(dest, answers.name);
	writeFileSync(join(dest, "README.md"), projectReadme(answers));
	return { dest, notes, example: answers.example, systems: answers.systems };
}

function frontmatter(title: string): string {
	const today = new Date().toISOString().slice(0, 10);
	return `---\ntitle: ${title}\nstatus: unverified\nhuman_reviewed: false\nsources: []\nupdated_at: ${today}\n---\n`;
}

function writeEmptyDocs(dest: string, systems: SystemSpec[]): void {
	const docs = join(dest, "src", "content", "docs");
	rmSync(docs, { recursive: true, force: true });
	const config = JSON.parse(readFileSync(join(dest, "ragu.config.json"), "utf-8")) as RaguConfigJson;
	for (const section of config.sections ?? []) {
		mkdirSync(join(docs, section.dir), { recursive: true });
		writeFileSync(join(docs, section.dir, ".gitkeep"), "");
	}
	const systemsList = systems.length
		? systems.map((s) => `- \`${s.id}\`: _describe this system_`).join("\n")
		: "_No systems configured yet; add them to `ragu.config.json`._";
	writeFileSync(
		join(docs, "index.md"),
		`${frontmatter("Overview")}\nWhat this product does, which systems exist and how they talk to each other.\n\n## Systems\n\n${systemsList}\n\n\`\`\`mermaid\nflowchart LR\n    a[system a] --> b[system b]\n\`\`\`\n\nRun \`/ragu-init <system-id>\` in Claude Code to bootstrap the documentation of a system.\n`,
	);
	writeFileSync(
		join(docs, "glossary.md"),
		`${frontmatter("Glossary")}\nBusiness term → where it lives in the code. One line per term; link the page that explains it.\n\n| Business term | Code | Meaning |\n|---|---|---|\n`,
	);
	writeFileSync(join(dest, "inbox", "QUESTIONS.md"), "# Questions for a human\n\nGrouped by domain. Each question carries minimal context and the source that raised it.\n");
}

function projectReadme(a: ScaffoldAnswers): string {
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

Knowledge base for ${a.systems.map((s) => `\`${s.id}\``).join(", ") || "this project"}: business rules, flows, integrations and decisions, kept in sync with the code. Built with [Ragu](https://github.com/pedrohfonseca81/ragu).

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

Agent plugin that keeps the docs in sync with the code (Stop hook + skills \`ragu-init\`, \`ragu-sync\`, \`ragu-adr\`, \`ragu-audit\`):

\`\`\`bash
# Claude Code (per user)
claude plugin marketplace add pedrohfonseca81/ragu
claude plugin install ragu@ragu
# Antigravity (per user): installed in ~/.gemini/config/plugins/ragu by \`npx create-ragu install\`
\`\`\`

Connect the code repositories (AGENTS.md block and \`.mcp.json\` in each) and register this knowledge base on your machine; re-run whenever a system is added or the plugin is updated:

\`\`\`bash
npx create-ragu install
\`\`\`

Update the site, theme and validation scripts to the latest template (content is never touched; review the diff, then \`npm install\`):

\`\`\`bash
npx create-ragu upgrade
\`\`\`
${remote}
## Layout

- \`ragu.config.json\`: systems, sections, remote settings (single source of truth)
- \`AGENTS.md\`: rules every agent must follow
- \`src/content/docs/\`: the vault (Starlight + Obsidian)
- \`templates/\`: page templates
- \`inbox/\`: open questions and divergences (not published)
`;
}
