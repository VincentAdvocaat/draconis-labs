import {z} from 'zod';
import {contentLocaleContextSchema,localizedTextValuesSchema} from '@draconis/shared';
export const portfolioSelectionSchema = z.object({
  ref: z.object({ websiteId: z.string(), collectionId: z.literal('portfolio'), snapshotId: z.string().uuid() }).strict(),
  checksum: z.string().regex(/^[a-f0-9]{64}$/), localeContext: contentLocaleContextSchema,
}).strict();
export const portfolioLabelsSchema = z.object({ heading: localizedTextValuesSchema, empty: localizedTextValuesSchema }).strict()
    .refine((labels) => Object.values(labels).every((values) => Object.values(values).every((value) => value == null || value.length <= 500)), 'Bloktekst maximaal 500 tekens')
    ;
export const portfolioBlockSchema=portfolioSelectionSchema.extend({blockId:z.string().uuid(),type:z.literal('portfolio'),labels:portfolioLabelsSchema.default(()=>({heading:{nl:'Portfolio',en:'Portfolio'},empty:{nl:'Er zijn nog geen projecten.',en:'No projects yet.'}}))}).strict();
