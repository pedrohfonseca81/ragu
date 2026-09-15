// Frontmatter schema shared by the Astro content collection (src/content.config.ts)
// and scripts/check.mjs. Takes the zod instance as a parameter so Astro can pass
// `astro/zod` and Node scripts can pass `zod` without mixing versions.
import { STATUSES } from "./config.mjs";

/**
 * @param {import('zod')} z
 * @param {{ systems: {id: string}[] }} config
 */
export function frontmatterFields(z, config) {
	const systemIds = config.systems.map((s) => s.id);
	const systemsSchema = systemIds.length ? z.array(z.enum(systemIds)) : z.array(z.never());
	return {
		domain: z.string().optional(),
		systems: systemsSchema.default([]),
		status: z.enum(STATUSES).default("unverified"),
		human_reviewed: z.boolean().default(false),
		sources: z.array(z.string()).default([]),
		updated_at: z.coerce.date().optional(),
	};
}
