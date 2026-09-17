import { defineCollection } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';
import { z } from 'astro/zod';
import config from '../ragu.config.json';
// @ts-ignore: plain ESM module shared with Node scripts
import { frontmatterFields } from '../scripts/lib/frontmatter.mjs';

export const collections = {
	docs: defineCollection({
		loader: docsLoader(),
		schema: docsSchema({
			extend: z.object(frontmatterFields(z, config)),
		}),
	}),
};
