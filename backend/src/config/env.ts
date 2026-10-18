/**
 * Environment configuration. Secrets only come from the environment; nothing is hardcoded.
 */
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  MONGODB_DB_NAME: z.string().default('cymor_coursechecker'),
  /** Comma separated list of allowed browser origins (your Vercel URL). */
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('2h'),
  REPORT_TTL_DAYS: z.coerce.number().int().positive().max(365).default(30),
  PUBLIC_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(30),
  PDF_RATE_LIMIT_PER_10MIN: z.coerce.number().int().positive().default(10),
  ADMIN_RATE_LIMIT_PER_15MIN: z.coerce.number().int().positive().default(20),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
  UPLOAD_MAX_MB: z.coerce.number().int().positive().max(50).default(25),
  /** Contact details shown in the footer / PDF. Optional and never invented. */
  SUPPORT_EMAIL: z.string().optional(),
  SITE_NAME: z.string().default('CYMOR KUCCPS CourseChecker'),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached && source === process.env) return cached;
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${msg}`);
  }
  if (source === process.env) cached = parsed.data;
  return parsed.data;
}
