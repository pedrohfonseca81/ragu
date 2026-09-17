/** Page statuses, in the order the schema declares them. */
export const STATUSES = ["verified", "inferred", "unverified", "outdated"] as const;
export type Status = (typeof STATUSES)[number];

/** One system entry of ragu.config.json. */
export interface SystemSpec {
	id: string;
	path: string;
}

/** The parts of ragu.config.json this server reads. */
export interface RaguConfigFile {
	name?: string;
	title?: string;
	docsDir?: string;
	systems?: SystemSpec[];
}

/** One indexed document. `kb` is set only when several knowledge bases are served together. */
export interface Doc {
	/** Unique across the index: the path, or `<kb>:<path>` when several knowledge bases are served. */
	id: string;
	kb?: string;
	path: string;
	title: string;
	domain: string | null;
	systems: string[];
	status: string;
	updated_at: string | null;
	content: string;
}

/** A loaded knowledge base, or several merged into one (then `names` and `docsDirs` are set). */
export interface KnowledgeBase {
	name: string | undefined;
	title: string | undefined;
	systems: string[];
	docs: Doc[];
	docsDir?: string;
	names?: string[];
	docsDirs?: string[];
}

export interface SearchOptions {
	query: string;
	kb?: string;
	systems?: string[];
	domain?: string;
	status?: string[];
	topK?: number;
}

export interface DocSummary {
	kb?: string;
	path: string;
	title: string;
	domain: string | null;
	systems: string[];
	status: string;
	updated_at: string | null;
}

export interface SearchResult extends DocSummary {
	score: number;
	warning?: string;
	content: string;
}

/** One entry of $XDG_CONFIG_HOME/ragu/knowledge-bases.json. */
export interface RegistryEntry {
	name: string | undefined;
	config: string;
}

export type Logger = (message: string) => void;
