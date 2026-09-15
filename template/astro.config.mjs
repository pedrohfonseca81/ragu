// @ts-check
import { readFileSync } from 'node:fs';
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import mermaid from 'astro-mermaid';
import starlightLinksValidator from 'starlight-links-validator';
import starlightLlmsTxt from 'starlight-llms-txt';
import { unified } from '@astrojs/markdown-remark';
import remarkMdLinks from './scripts/lib/remark-md-links.mjs';

const config = JSON.parse(readFileSync(new URL('./ragu.config.json', import.meta.url), 'utf-8'));
const sections = config.sections ?? [];
const docsDir = new URL(`./${config.docsDir ?? 'src/content/docs'}/`, import.meta.url).pathname;

export default defineConfig({
	site: config.remote?.url ?? 'http://localhost:4321/',
	markdown: {
		processor: unified(),
		// Relative `.md` links (Obsidian/GitHub style) become site routes; see scripts/lib/remark-md-links.mjs.
		remarkPlugins: [[remarkMdLinks, { docsDir }]],
	},
	vite: {
		resolve: {
			alias: {
				// Astro 7 pulls a wasm-backed markdown compiler that has no Workers build; the stub keeps `unified()` in charge.
				'@bruits/satteri-wasm32-wasi': new URL('./src/wasm-stub.js', import.meta.url).pathname,
			},
		},
	},
	integrations: [
		// mermaid() must come before starlight().
		mermaid({ theme: 'forest', autoTheme: true }),
		starlight({
			title: config.title,
			plugins: [starlightLinksValidator(), starlightLlmsTxt()],
			sidebar: [
				{ label: 'Overview', link: '/' },
				...sections.map((s) => ({ label: s.label, items: [{ autogenerate: { directory: s.dir } }] })),
				{ label: 'Glossary', link: '/glossary/' },
			],
		}),
	],
});
