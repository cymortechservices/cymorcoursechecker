/** Request validation schemas (zod). Unknown keys are rejected; sizes are bounded. */
import { z } from 'zod';
import { GRADES } from '../modules/subjects/catalogue';

const text = (max: number) => z.string().trim().max(max);

export const gradeEntrySchema = z.object({ subject: z.string().trim().min(2).max(10), grade: z.enum(GRADES) }).strict();

export const cutoffPolicySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('latest-specific'), minYear: z.number().int().min(2000).max(2100).optional() }).strict(),
  z.object({ type: z.literal('latest-available'), minYear: z.number().int().min(2000).max(2100).optional() }).strict(),
  z.object({ type: z.literal('fixed-year'), year: z.number().int().min(2000).max(2100) }).strict(),
]);

export const validateBody = z.object({ grades: z.array(gradeEntrySchema).max(12) }).strict();

export const checkBody = z
  .object({
    candidate: z.object({ name: text(80).optional(), reference: text(40).optional() }).strict().default({}),
    email: z.string().trim().toLowerCase().email().max(200),
    grades: z.array(gradeEntrySchema).min(1).max(12),
    preferences: z.array(text(120)).max(10).optional(),
    cutoffPolicy: cutoffPolicySchema.optional(),
  })
  .strict();

export const payBody = z.object({ phone: z.string().trim().max(20).optional(), couponCode: z.string().trim().max(30).optional() }).strict();
export const quoteBody = z.object({ couponCode: z.string().trim().max(30).optional() }).strict();
export const orderListQuery = z.object({
  status: z.enum(['unpaid', 'pending', 'paid', 'failed', 'cancelled']).optional(),
  q: text(80).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  skip: z.coerce.number().int().min(0).max(100_000).default(0),
});
export const couponBody = z.object({
  code: z.string().trim().min(3).max(20),
  percentOff: z.number().int().min(1).max(100),
  maxUses: z.number().int().min(1).max(1_000_000).optional(),
  expiresAt: z.string().datetime().optional(),
  note: text(120).optional(),
}).strict();
export const couponActiveBody = z.object({ active: z.boolean() }).strict();
export const couponCodeParam = z.object({ code: z.string().trim().min(3).max(20) });
export const nameSuggestQuery = z.object({ q: text(60).default(''), limit: z.coerce.number().int().min(1).max(20).default(10) });

export const resultsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(25),
  q: text(80).optional(),
  institution: z.string().trim().max(20).optional(),
  competitiveness: z.enum(['safe', 'balanced', 'competitive']).optional(),
  sort: z.enum(['margin', 'score', 'cutoff', 'programme', 'institution']).default('cutoff'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export const reportIdParam = z.object({ reportId: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/) });
export const versionParam = z.object({ version: z.string().regex(/^[A-Za-z0-9._-]{3,64}$/) });

export const loginBody = z.object({ email: z.string().trim().toLowerCase().email().max(200), password: z.string().min(1).max(200) }).strict();

export const correctionBody = z.discriminatedUnion('type', [
  z.object({ type: z.literal('map_programme'), programmeCode: z.string().trim().min(3).max(30), subClusterId: z.string().trim().regex(/^\d{1,2}[A-Z]$/) }).strict(),
  z.object({ type: z.literal('reject_programme'), programmeCode: z.string().trim().min(3).max(30), reason: text(300).min(3) }).strict(),
  z.object({ type: z.literal('override_requirement_slot'), subClusterId: z.string().trim().regex(/^\d{1,2}[A-Z]$/), slot: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]), text: text(200).min(1) }).strict(),
]);

export const pagingQuery = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50), skip: z.coerce.number().int().min(0).max(100_000).default(0) });
export const auditQuery = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) });
export const importQuery = z.object({ dryRun: z.enum(['true', 'false']).default('true').transform((v) => v === 'true') });
export const programmeSearchQuery = z.object({ q: text(80).optional(), institution: z.string().trim().max(20).optional(), limit: z.coerce.number().int().min(1).max(100).default(25), skip: z.coerce.number().int().min(0).max(100_000).default(0) });
