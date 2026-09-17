// @ts-check
import { readFileSync } from 'node:fs';
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import mermaid from 'astro-mermaid';
import starlightLinksValidator from 'starlight-links-validator';
import starlightLlmsTxt from 'starlight-llms-txt';
import { unified } from '@astrojs/markdown-remark';
import remarkMdLinks from './scripts/lib/remark-md-links.mjs';
import raguSiteGraph from './scripts/lib/site-graph-plugin.mjs';

const config = JSON.parse(readFileSync(new URL('./ragu.config.json', import.meta.url), 'utf-8'));
const sections = config.sections ?? [];
const docsDir = new URL(`./${config.docsDir ?? 'src/content/docs'}/`, import.meta.url).pathname;

function siteUrl(url) {
	try {
		return new URL(url).toString();
	} catch {
		return 'http://localhost:4321/';
	}
}

export default defineConfig({
	site: siteUrl(config.remote?.url),
	markdown: {
		// Relative `.md` links (Obsidian/GitHub style) become site routes; see scripts/lib/remark-md-links.mjs.
		processor: unified({ remarkPlugins: [[remarkMdLinks, { docsDir }]] }),
	},
	vite: {
		// starlight-site-graph ships micromatch to the browser, which reads process.platform.
		define: { 'process.platform': JSON.stringify('browser') },
		resolve: {
			alias: {
				// Astro 7 pulls a wasm-backed markdown compiler that has no Workers build; the stub keeps `unified()` in charge.
				'@bruits/satteri-wasm32-wasi': new URL('./src/wasm-stub.js', import.meta.url).pathname,
			},
		},
	},
	integrations: [
		// mermaid() must come before starlight().
		mermaid({
			// One palette for both modes: light nodes with a red border read on charcoal and on off-white.
			// Only 'base' honours themeVariables, so autoTheme (which forces default/dark) is off; the text that
			// sits directly on the page (sequence messages, loop labels) is recoloured for dark mode in ragu.css.
			theme: 'base',
			autoTheme: false,
			mermaidConfig: {
				themeVariables: {
					fontFamily: 'Inter Variable, ui-sans-serif, system-ui, sans-serif',
					primaryColor: '#f3efe9',
					primaryTextColor: '#2b2826',
					primaryBorderColor: '#c0392b',
					secondaryColor: '#e8e2da',
					tertiaryColor: '#dcd5cb',
					lineColor: '#8f8b8b',
					textColor: '#2b2826',
					edgeLabelBackground: '#f3efe9',
					clusterBkg: '#e8e2da',
					clusterBorder: '#a9a49d',
					actorBkg: '#f3efe9',
					actorBorder: '#c0392b',
					actorTextColor: '#2b2826',
					actorLineColor: '#8f8b8b',
					signalColor: '#8f8b8b',
					signalTextColor: '#2b2826',
					labelBoxBkgColor: '#e8e2da',
					labelBoxBorderColor: '#c0392b',
					labelTextColor: '#2b2826',
					loopTextColor: '#2b2826',
					noteBkgColor: '#fbe3df',
					noteBorderColor: '#c0392b',
					noteTextColor: '#2b2826',
					activationBkgColor: '#e8e2da',
					activationBorderColor: '#8f8b8b',
				},
			},
		}),
		starlight({
			title: config.title,
			logo: { src: './src/assets/ragu-pot.png' },
			favicon: '/favicon.png',
			customCss: ['@fontsource-variable/inter', './src/styles/ragu.css'],
			expressiveCode: { themes: ['vitesse-dark', 'vitesse-light'] },
			plugins: [
				starlightLinksValidator(),
				starlightLlmsTxt(),
				// Obsidian-style graph of the pages: in the sidebar of every page and in full at /graph/.
				raguSiteGraph({ docsDir }),
			],
			sidebar: [
				{ label: 'Overview', link: '/' },
				...sections.map((s) => ({ label: s.label, items: [{ autogenerate: { directory: s.dir } }] })),
				{ label: 'Glossary', link: '/glossary/' },
				{ label: 'Graph', link: '/graph/' },
			],
		}),
	],
});
