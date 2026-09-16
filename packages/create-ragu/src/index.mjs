import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import * as p from "@clack/prompts";
import { parseSystems, scaffold, slugify } from "./scaffold.mjs";
import { findConfig, install, registerAntigravity } from "./install.mjs";

const HELP = `create-ragu — scaffold a code-backed knowledge base

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
  --no-register            don't register the Antigravity plugin in ~/.gemini/config/plugins.json
  -y, --yes                accept defaults for anything not given
  -h, --help

install — connect code repositories to the knowledge base that governs the current directory
  (or --config <ragu.config.json>). With no system ids, all configured systems. In every repository:
  AGENTS.md block, @AGENTS.md in CLAUDE.md, .mcp.json entry, .agents/plugins/ragu (Antigravity),
  plus registration in ~/.gemini/config/plugins.json. Re-run any time; it is idempotent.
  --force                  overwrite an installed plugin even if it is not older
  --no-register            don't touch ~/.gemini/config/plugins.json
`;

function parseArgs(argv) {
	const args = { flags: {}, positional: [] };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "-h" || a === "--help") args.flags.help = true;
		else if (a === "-y" || a === "--yes") args.flags.yes = true;
		else if (a.startsWith("--no-")) args.flags[a.slice(5)] = false;
		else if (a.startsWith("--")) {
			const key = a.slice(2);
			const next = argv[i + 1];
			if (next !== undefined && !next.startsWith("--") && ["name", "title", "systems", "config"].includes(key)) {
				args.flags[key] = next;
				i++;
			} else args.flags[key] = true;
		} else args.positional.push(a);
	}
	return args;
}

function run(cmd, args, cwd) {
	const r = spawnSync(cmd, args, { cwd, stdio: "inherit" });
	return r.status === 0;
}

function hasCommand(cmd) {
	return spawnSync(cmd, ["--version"], { stdio: "ignore" }).status === 0;
}

export async function main(argv = process.argv.slice(2)) {
	const { flags, positional } = parseArgs(argv);
	if (flags.help) {
		console.log(HELP);
		return;
	}
	if (positional[0] === "install") return installMain(flags, positional.slice(1));
	const interactive = p.isTTY(process.stdin) && !flags.yes;
	const bail = (v) => {
		if (p.isCancel(v)) {
			p.cancel("Cancelled.");
			process.exit(1);
		}
		return v;
	};

	p.intro("create-ragu");

	let dir = positional[0];
	if (!dir) {
		dir = interactive
			? bail(await p.text({ message: "Where should the knowledge base live?", placeholder: "./knowledge-base", defaultValue: "./knowledge-base" }))
			: "./knowledge-base";
	}
	dir = resolve(dir);
	if (existsSync(dir) && !isEmptyDir(dir)) {
		p.cancel(`${dir} already exists and is not empty.`);
		process.exit(1);
	}

	const defaultName = slugify(flags.name ?? basename(dir));
	const name = flags.name
		? slugify(flags.name)
		: interactive
			? slugify(bail(await p.text({ message: "Package name (kebab-case)", defaultValue: defaultName, placeholder: defaultName })))
			: defaultName;

	const defaultTitle = flags.title ?? `${titleCase(name)}`;
	const title = flags.title ?? (interactive ? bail(await p.text({ message: "Site title", defaultValue: defaultTitle, placeholder: defaultTitle })) : defaultTitle);

	let systems = parseSystems(flags.systems);
	if (flags.systems === undefined && interactive) {
		const raw = bail(
			await p.text({
				message: "Systems to document, as id:path relative to the knowledge base (leave empty to add later)",
				placeholder: "api:../api, web:../web",
				defaultValue: "",
			}),
		);
		systems = parseSystems(raw);
	}

	const remote =
		flags.remote !== undefined
			? Boolean(flags.remote)
			: interactive
				? bail(await p.confirm({ message: "Include the remote MCP server on Cloudflare (semantic search, needs a Cloudflare account)?", initialValue: false }))
				: false;

	let example = flags.example !== false;
	if (flags.example === undefined && interactive && systems.length === 0) {
		example = bail(await p.confirm({ message: "Start with the example docs (a fictional bookshop with systems api/web)?", initialValue: true }));
	}

	const install =
		flags.install !== undefined
			? Boolean(flags.install)
			: interactive
				? bail(await p.confirm({ message: "Run npm install now?", initialValue: true }))
				: false;

	const claudeAvailable = hasCommand("claude");
	const plugin =
		flags.plugin !== undefined
			? Boolean(flags.plugin)
			: interactive && claudeAvailable
				? bail(await p.confirm({ message: "Install the ragu Claude Code plugin (Stop hook + skills)?", initialValue: true }))
				: false;

	const s = p.spinner();
	s.start("Copying template");
	let result;
	try {
		result = scaffold({ dir, name, title, systems, remote, example });
	} catch (e) {
		s.stop("Failed");
		p.cancel(e.message);
		process.exit(1);
	}
	const { dest } = result;
	s.stop(`Created ${relative(process.cwd(), dest) || "."}`);
	for (const n of result.notes) p.log.info(n);
	systems = result.systems;

	if (!existsSync(resolve(dest, "..", ".git")) && hasCommand("git")) {
		run("git", ["init", "-q"], dest);
	}

	if (install) {
		p.log.step("Installing dependencies");
		if (!run("npm", ["install"], dest)) p.log.warn("npm install failed — run it manually.");
	}

	if (plugin) {
		if (!claudeAvailable) p.log.warn("`claude` not found on PATH; skipping plugin install.");
		else {
			p.log.step("Installing the ragu plugin");
			const ok = run("claude", ["plugin", "marketplace", "add", "useperfit/ragu"], dest) && run("claude", ["plugin", "install", "ragu@ragu"], dest);
			if (!ok) p.log.warn("Plugin install failed — see the README for the manual commands.");
		}
	}

	// The knowledge base itself carries the Antigravity plugin; register it on this machine.
	const kbRegistered = flags.register === false ? "skipped" : registerAntigravity(dest);

	const connectable = systems.filter((s) => existsSync(resolve(dest, s.path)));
	let connected = null;
	const connect =
		flags.connect !== undefined
			? Boolean(flags.connect)
			: connectable.length && interactive
				? bail(await p.confirm({ message: `Connect ${connectable.map((s) => s.id).join(", ")} now (AGENTS.md block, MCP config and agent plugin in each repository)?`, initialValue: true }))
				: false;
	if (connect && connectable.length) {
		p.log.step("Connecting repositories");
		try {
			connected = await install({ configPath: join(dest, "ragu.config.json"), systemIds: connectable.map((s) => s.id), register: flags.register !== false });
			for (const line of describeInstall(connected)) p.log.info(line);
		} catch (e) {
			p.log.warn(`Connecting failed: ${e.message} — run \`npx create-ragu install\` later.`);
		}
	}

	const rel = relative(process.cwd(), dest) || ".";
	const next = [
		`cd ${rel}`,
		install ? null : "npm install",
		"npm run dev                       # browse the site",
		`claude mcp add ${name} -- npx ragu-mcp --root ${dest}`,
		plugin ? null : "claude plugin marketplace add useperfit/ragu && claude plugin install ragu@ragu",
		result.example
			? "replace the example docs: edit ragu.config.json → systems, delete src/content/docs/*, then /ragu-init <id>"
			: systems.length
				? `in Claude Code: /ragu-init ${systems[0].id}   # bootstrap docs from the code`
				: "add your systems to ragu.config.json, then /ragu-init <id>",
		systems.length && !connected ? "npx create-ragu install               # connect the code repositories (AGENTS.md, MCP, agent plugin)" : null,
		kbRegistered === "skipped" ? null : "Antigravity: restart agy / the IDE to load the plugin",
		remote ? "see README.md → Remote MCP (Cloudflare) for wrangler setup" : null,
	].filter(Boolean);
	p.note(next.join("\n"), "Next steps");
	p.outro("Done. Read AGENTS.md in the new project — it is the contract every agent follows.");
}

function describeInstall({ kb, targets }) {
	const fmt = (t) => `${t.agents ? `AGENTS.md ${t.agents}` : ""}${t.claude ? `, CLAUDE.md ${t.claude}` : ""}, .mcp.json ${t.mcp}, plugin ${t.plugin}, antigravity ${t.antigravity}`.replace(/^, /, "");
	const lines = [];
	for (const t of targets) {
		if (t.error) lines.push(`${t.ids.join(", ")}: ${t.error}`);
		else lines.push(`${t.ids.join(", ")} → ${relative(process.cwd(), t.root) || "."}: ${fmt(t)}`);
	}
	lines.push(`knowledge base → ${relative(process.cwd(), kb.root) || "."}: ${fmt(kb)}`);
	return lines;
}

async function installMain(flags, ids) {
	p.intro("create-ragu install");
	const configPath = flags.config ? resolve(flags.config) : await findConfig(process.cwd());
	if (!configPath || !existsSync(configPath)) {
		p.cancel("No ragu.config.json governs this directory. Run from the knowledge base or one of its systems, or pass --config <path>.");
		process.exit(1);
	}
	p.log.info(`knowledge base: ${relative(process.cwd(), dirname(configPath)) || "."}`);
	let result;
	try {
		result = await install({ configPath, systemIds: ids, force: Boolean(flags.force), register: flags.register !== false });
	} catch (e) {
		p.cancel(e.message);
		process.exit(1);
	}
	for (const line of describeInstall(result)) p.log.info(line);
	const notes = [
		"Commit AGENTS.md, CLAUDE.md, .mcp.json and .agents/ in each repository so the whole team gets them.",
		result.targets.some((t) => t.antigravity === "registered") || result.kb.antigravity === "registered" ? "Antigravity: restart agy / the IDE to load the plugin." : null,
		result.kb.antigravity === "skipped" && flags.register !== false ? "Antigravity not detected (~/.gemini missing); run again after installing it to register the plugin." : null,
		"Claude Code: plugin is per user — `claude plugin marketplace add useperfit/ragu && claude plugin install ragu@ragu`.",
	].filter(Boolean);
	p.note(notes.join("\n"), "Next steps");
	p.outro("Done.");
}

function isEmptyDir(dir) {
	try {
		return readdirSync(dir).length === 0;
	} catch {
		return false;
	}
}

function titleCase(slug) {
	return slug
		.split("-")
		.map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
		.join(" ");
}
