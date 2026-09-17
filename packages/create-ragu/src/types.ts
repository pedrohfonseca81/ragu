/** One system entry of ragu.config.json: an id and a path relative to the knowledge base. */
export interface SystemSpec {
	id: string;
	path: string;
}

/** What the wizard (or flags) decided; `scaffold()` needs nothing else. */
export interface ScaffoldAnswers {
	dir: string;
	name: string;
	title: string;
	systems: SystemSpec[];
	remote: boolean;
	example: boolean;
}

export interface ScaffoldResult {
	dest: string;
	notes: string[];
	example: boolean;
	systems: SystemSpec[];
}

/** What happened to one file or record on disk. */
export type FileOutcome = "created" | "updated" | "kept";
export type PluginOutcome = "installed" | "updated" | "kept" | "skipped";
export type RegistryOutcome = "registered" | "updated" | "kept";

/** ragu.config.json as the plugin's loader returns it: absolute paths, defaults applied. */
export interface LoadedConfig {
	root: string;
	name: string;
	docsDir: string;
	systems: SystemSpec[];
}

/** One repository `install` connected (or could not). */
export interface ConnectedRepo {
	ids: string[];
	root: string | null;
	error?: string;
	agents?: FileOutcome;
	claude?: FileOutcome;
	mcp?: FileOutcome;
}

export interface InstallResult {
	kb: { root: string; mcp: FileOutcome };
	targets: ConnectedRepo[];
	registry: RegistryOutcome;
	antigravity: PluginOutcome;
}

/** Where per-user files go; overridable for tests. */
export interface UserEnv {
	home?: string;
	env?: NodeJS.ProcessEnv;
}
