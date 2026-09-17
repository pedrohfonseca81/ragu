// Minimal typing for the starlight-site-graph entry used by site-graph-plugin.mjs. The package ships
// TypeScript sources, which the root typecheck would otherwise follow into node_modules (see tsconfig.template.json).
export const starlightSiteGraphConfig: {
	sitemapConfig: Record<string, unknown>;
	graphConfig: Record<string, unknown>;
	[key: string]: unknown;
};
