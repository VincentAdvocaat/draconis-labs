import { z } from 'zod';

const reserved = /^(index|en|api|sites|media|assets|con|prn|aux|nul|com[1-9]|lpt[1-9])$/;
export const documentSlugSchema = z.string().trim().toLowerCase().min(1).max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).refine((slug) => !reserved.test(slug), 'Deze slug is gereserveerd');
