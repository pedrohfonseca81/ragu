// @ts-check
// Starlight plugin wrapping starlight-site-graph with a sitemap built by site-graph.mjs.
//
// Why not `starlightSiteGraph({ sitemapConfig: { sitemap } })`: in 0.5.0 the plugin deep-merges user options
// into its defaults and turns the `styleRules` Map into `{}`, so any option fails the integration's own
// validation. This wrapper does what the plugin's `config:setup` does (integration, styles, sidebar
// override) and hands the integration a complete options object instead.
import { starlightSiteGraphConfig } from "starlight-site-graph/config";
import siteGraphIntegration from "starlight-site-graph/integration";
import { buildSiteGraphSitemap } from "./site-graph.mjs";

/**
 * @param {{ docsDir: string }} options  Absolute path to the docs directory.
 * @returns {import("@astrojs/starlight/types").StarlightPlugin}
 */
export default function raguSiteGraph({ docsDir }) {
	return {
		name: "ragu-site-graph",
		hooks: {
			"config:setup"({ addIntegration, config, updateConfig, command }) {
				if (command === "preview") return;
				addIntegration(
					siteGraphIntegration({
						...starlightSiteGraphConfig,
						starlight: true,
						sitemapConfig: { ...starlightSiteGraphConfig.sitemapConfig, sitemap: buildSiteGraphSitemap(docsDir) },
						graphConfig: { ...starlightSiteGraphConfig.graphConfig, renderArrows: false },
					}),
				);
				updateConfig({
					customCss: [
						...(config.customCss ?? []),
						"starlight-site-graph/styles/layers.css",
						"starlight-site-graph/styles/common.css",
						"starlight-site-graph/styles/starlight.css",
					],
					components: { PageSidebar: "./src/components/PageSidebar.astro", ...config.components },
				});
			},
		},
	};
}
