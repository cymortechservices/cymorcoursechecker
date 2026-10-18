import { z } from 'zod';
export const GRADE_LIST = ['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'E'] as const;

export const detailsSchema = z.object({
  name: z.string().trim().max(80, 'Keep the name under 80 characters').optional(),
  reference: z.string().trim().max(40, 'Keep the reference under 40 characters').optional(),
});
export type Details = z.infer<typeof detailsSchema>;

export const preferencesSchema = z.object({
  prefs: z.array(z.object({ value: z.string().trim().max(120, 'Too long') })).max(6),
});
export type Prefs = z.infer<typeof preferencesSchema>;

export const gradesSchema = z.array(z.object({ subject: z.string().min(2), grade: z.enum(GRADE_LIST) })).min(7, 'Enter at least 7 subjects').max(12, 'Enter at most 12 subjects');
