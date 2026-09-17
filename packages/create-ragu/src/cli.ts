// The interactive entry point: `npx create-ragu [dir]` (wizard) and `npx create-ragu install`.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import * as p from "@clack/prompts";
import { isEmptyDir } from "./fs.ts";
import { findConfig, install } from "./install.ts";
import { installAntigravityPlugin } from "./plugin.ts";
import { registerKnowledgeBase } from "./registry.ts";
import { parseSystems, scaffold, slugify } from "./scaffold.ts";
import type { InstallResult, ScaffoldAnswers, SystemSpec } from "./types.ts";

const MARKETPLACE = "pedrohfonseca81/ragu";
const CLAUDE_PLUGIN_INSTALL = `claude plugin marketplace add ${MARKETPLACE} && claude plugin install ragu@ragu`;

const HELP = `create-ragu: scaffold a code-backed knowledge base

Usage: npx create-ragu [dir] [options]
       npx create-ragu install [system-id ...] [options]

Options:
  --name <kebab>           package/worker name (default: from dir)
  --title <text>           site title
  --systems <list>         "api:../api,web:../web" (id:path, comma separated)
  --remote | --no-remote   include the Cloudflare remote MCP worker (default: ask)
  --no-example             start with empty sections instead of the example bookshop docs
  --install | --no-install run npm install (default: ask)
  --plugin | --no-plugin   install the ragu Claude Code plugin (default: ask)
  --connect | --no-connect connect the configured systems' repositories (= install) (default: ask)
  -y, --yes                accept defaults for anything not given
  -h, --help

install: connect code repositories to the knowledge base that governs the current directory
  (or --config <ragu.config.json>). With no system ids, all configured systems. In every repository:
  AGENTS.md block, @AGENTS.md in CLAUDE.md, .mcp.json entry. On this machine: the knowledge base is
  registered in $XDG_CONFIG_HOME/ragu/knowledge-bases.json (for ragu-mcp) and, when Antigravity is
  installed, the ragu plugin goes to ~/.gemini/config/plugins/ragu. Re-run any time; it is idempotent.
  --force                  overwrite the installed Antigravity plugin even if it is not older
`;

/** Flags that take a value; every other `--x` is a boolean, and `--no-x` sets it to false. */
const VALUE_FLAGS = new Set(["name", "title", "systems", "config"]);

export interface Flags {
	help?: boolean;
	yes?: boolean;
	name?: string;
	title?: string;
	systems?: string;
	config?: string;
	remote?: boolean;
	example?: boolean;
	install?: boolean;
	plugin?: boolean;
	connect?: boolean;
	force?: boolean;
}

export interface ParsedArgs {
	flags: Flags;
	positional: string[];
}

export function parseArgs(argv: string[]): ParsedArgs {
	const flags: Record<string, string | boolean> = {};
	const positional: string[] = [];
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i] ?? "";
		if (arg === "-h" || arg === "--help") flags.help = true;
		else if (arg === "-y" || arg === "--yes") flags.yes = true;
		else if (arg.startsWith("--no-")) flags[arg.slice(5)] = false;
		else if (arg.startsWith("--")) {
			const key = arg.slice(2);
			const next = argv[i + 1];
			if (VALUE_FLAGS.has(key) && next !== undefined && !next.startsWith("--")) {
				flags[key] = next;
				i++;
			} else flags[key] = true;
		} else positional.push(arg);
	}
	return { flags: flags as Flags, positional };
}

function run(cmd: string, args: string[], cwd: string): boolean {
	return spawnSync(cmd, args, { cwd, stdio: "inherit" }).status === 0;
}

function hasCommand(cmd: string): boolean {
	return spawnSync(cmd, ["--version"], { stdio: "ignore" }).status === 0;
}

function titleCase(slug: string): string {
	return slug
		.split("-")
		.map((word) => (word ? word[0]?.toUpperCase() + word.slice(1) : word))
		.join(" ");
}

/** Exits cleanly when the user cancels a prompt. */
function bail<T>(value: T | symbol): T {
	if (typeof value === "symbol") {
		p.cancel("Cancelled.");
		process.exit(1);
	}
	return value;
}

/** A flag wins; otherwise ask when interactive; otherwise the default. */
async function decide<T>(flag: NoInfer<T> | undefined, interactive: boolean, ask: () => Promise<NoInfer<T> | symbol>, fallback: T): Promise<T> {
	if (flag !== undefined) return flag;
	return interactive ? bail(await ask()) : fallback;
}

const confirm = (message: string, initialValue: boolean) => () => p.confirm({ message, initialValue });
const text = (message: string, defaultValue: string) => () => p.text({ message, defaultValue, placeholder: defaultValue });

async function collectAnswers(flags: Flags, positional: string[], interactive: boolean): Promise<ScaffoldAnswers> {
	const dir = resolve(await decide(positional[0], interactive, text("Where should the knowledge base live?", "./knowledge-base"), "./knowledge-base"));
	if (existsSync(dir) && !isEmptyDir(dir)) {
		p.cancel(`${dir} already exists and is not empty.`);
		process.exit(1);
	}
	const defaultName = slugify(flags.name ?? basename(dir));
	const name = slugify(await decide(flags.name, interactive, text("Package name (kebab-case)", defaultName), defaultName));
	const title = await decide(flags.title, interactive, text("Site title", titleCase(name)), titleCase(name));
	const systems = parseSystems(
		await decide(
			flags.systems,
			interactive,
			() => p.text({ message: "Systems to document, as id:path relative to the knowledge base (leave empty to add later)", placeholder: "api:../api, web:../web", defaultValue: "" }),
			"",
		),
	);
	const remote = await decide(flags.remote, interactive, confirm("Include the remote MCP server on Cloudflare (semantic search, needs a Cloudflare account)?", false), false);
	const example = await decide(flags.example, interactive && systems.length === 0, confirm("Start with the example docs (a fictional bookshop with systems api/web)?", true), true);
	return { dir, name, title, systems, remote, example };
}

function describeInstall({ kb, targets, registry, antigravity }: InstallResult): string[] {
	const here = (path: string) => relative(process.cwd(), path) || ".";
	const lines = targets.map((t) =>
		t.error ? `${t.ids.join(", ")}: ${t.error}` : `${t.ids.join(", ")} → ${here(t.root ?? "")}: AGENTS.md ${t.agents}, CLAUDE.md ${t.claude}, .mcp.json ${t.mcp}`,
	);
	lines.push(`knowledge base → ${here(kb.root)}: .mcp.json ${kb.mcp}, registry ${registry}`);
	if (antigravity !== "skipped") lines.push(`Antigravity plugin (~/.gemini/config/plugins/ragu): ${antigravity}`);
	return lines;
}

async function connectRepositories(dest: string, systems: SystemSpec[]): Promise<InstallResult | null> {
	p.log.step("Connecting repositories");
	try {
		const result = await install({ configPath: join(dest, "ragu.config.json"), systemIds: systems.map((s) => s.id) });
		for (const line of describeInstall(result)) p.log.info(line);
		return result;
	} catch (e) {
		p.log.warn(`Connecting failed: ${e instanceof Error ? e.message : String(e)}. Run \`npx create-ragu install\` later.`);
		return null;
	}
}

async function wizard(flags: Flags, positional: string[]): Promise<void> {
	const interactive = p.isTTY(process.stdin) && !flags.yes;
	p.intro("create-ragu");
	const answers = await collectAnswers(flags, positional, interactive);

	const npmInstall = await decide(flags.install, interactive, confirm("Run npm install now?", true), false);
	const claudeAvailable = hasCommand("claude");
	const claudePlugin = await decide(flags.plugin, interactive && claudeAvailable, confirm("Install the ragu Claude Code plugin (Stop hook + skills)?", true), false);

	const spinner = p.spinner();
	spinner.start("Copying template");
	let result;
	try {
		result = scaffold(answers);
	} catch (e) {
		spinner.stop("Failed");
		p.cancel(e instanceof Error ? e.message : String(e));
		process.exit(1);
	}
	const { dest, systems } = result;
	spinner.stop(`Created ${relative(process.cwd(), dest) || "."}`);
	for (const note of result.notes) p.log.info(note);

	if (!existsSync(resolve(dest, "..", ".git")) && hasCommand("git")) run("git", ["init", "-q"], dest);
	if (npmInstall) {
		p.log.step("Installing dependencies");
		if (!run("npm", ["install"], dest)) p.log.warn("npm install failed; run it manually.");
	}
	if (claudePlugin) {
		if (!claudeAvailable) p.log.warn("`claude` not found on PATH; skipping plugin install.");
		else {
			p.log.step("Installing the ragu plugin");
			const ok = run("claude", ["plugin", "marketplace", "add", MARKETPLACE], dest) && run("claude", ["plugin", "install", "ragu@ragu"], dest);
			if (!ok) p.log.warn("Plugin install failed; see the README for the manual commands.");
		}
	}

	// Per user, on this machine: registry entry (for ragu-mcp) and the Antigravity plugin if present.
	registerKnowledgeBase(join(dest, "ragu.config.json"), answers.name);
	const antigravity = installAntigravityPlugin();

	const connectable = systems.filter((s) => existsSync(resolve(dest, s.path)));
	const connect = connectable.length
		? await decide(flags.connect, interactive, confirm(`Connect ${connectable.map((s) => s.id).join(", ")} now (AGENTS.md block and MCP config in each repository)?`, true), false)
		: false;
	const connected = connect ? await connectRepositories(dest, connectable) : null;

	const rel = relative(process.cwd(), dest) || ".";
	const firstSystem = systems[0];
	const next = [
		`cd ${rel}`,
		npmInstall ? null : "npm install",
		"npm run dev                       # browse the site",
		`claude mcp add ${answers.name} -- npx ragu-mcp --root ${dest}`,
		claudePlugin ? null : CLAUDE_PLUGIN_INSTALL,
		result.example
			? "replace the example docs: edit ragu.config.json → systems, delete src/content/docs/*, then /ragu-init <id>"
			: firstSystem
				? `in Claude Code: /ragu-init ${firstSystem.id}   # bootstrap docs from the code`
				: "add your systems to ragu.config.json, then /ragu-init <id>",
		systems.length && !connected ? "npx create-ragu install               # connect the code repositories (AGENTS.md, MCP)" : null,
		antigravity === "skipped" ? null : "Antigravity: restart agy / the IDE to load the ragu plugin",
		answers.remote ? "remote server: see https://github.com/pedrohfonseca81/ragu/blob/main/docs/remote-mcp.md" : null,
	].filter((line): line is string => line !== null);
	p.note(next.join("\n"), "Next steps");
	p.outro("Done. Read AGENTS.md in the new project; it is the contract every agent follows.");
}

async function installCommand(flags: Flags, ids: string[]): Promise<void> {
	p.intro("create-ragu install");
	const configPath = flags.config ? resolve(flags.config) : await findConfig(process.cwd());
	if (!configPath || !existsSync(configPath)) {
		p.cancel("No ragu.config.json governs this directory. Run from the knowledge base or one of its systems, or pass --config <path>.");
		process.exit(1);
	}
	p.log.info(`knowledge base: ${relative(process.cwd(), dirname(configPath)) || "."}`);
	let result: InstallResult;
	try {
		result = await install({ configPath, systemIds: ids, force: Boolean(flags.force) });
	} catch (e) {
		p.cancel(e instanceof Error ? e.message : String(e));
		process.exit(1);
	}
	for (const line of describeInstall(result)) p.log.info(line);
	const notes = [
		"Commit AGENTS.md, CLAUDE.md and .mcp.json in each repository so the whole team gets them.",
		`Claude Code: plugin is per user; \`${CLAUDE_PLUGIN_INSTALL}\`.`,
		result.antigravity === "installed" || result.antigravity === "updated" ? "Antigravity: restart agy / the IDE to load the ragu plugin." : null,
		result.antigravity === "skipped" ? "Antigravity not detected (~/.gemini missing); run `npx create-ragu install` again after installing it." : null,
	].filter((line): line is string => line !== null);
	p.note(notes.join("\n"), "Next steps");
	p.outro("Done.");
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
	const { flags, positional } = parseArgs(argv);
	if (flags.help) {
		console.log(HELP);
		return;
	}
	if (positional[0] === "install") return installCommand(flags, positional.slice(1));
	return wizard(flags, positional);
}
