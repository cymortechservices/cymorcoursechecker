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
  SUPPORT_EMAIL: z.string().default('simion@karimique.com'),
  /** Optional one-time seed key (>= 32 chars). When set, POST /api/v1/admin/seed can import the bundled PDFs and activate them if NO dataset is active yet. Remove it afterwards. */
  SEED_KEY: z.string().min(32, 'SEED_KEY must be at least 32 characters').optional().or(z.literal('').transform(() => undefined)),
  /** Price in whole KES for unlocking results + PDF. */
  PRICE_KES: z.coerce.number().int().min(1).max(100000).default(149),
  PAYMENT_RATE_LIMIT_PER_10MIN: z.coerce.number().int().positive().default(8),
  /** Support contact shown in the PDF, emails and website. */
  SUPPORT_WHATSAPP: z.string().default('0113821327'),
  PUBLIC_SITE_URL: z.string().default('http://localhost:5173'),
  /* --- M-Pesa (Safaricom Daraja STK push). All optional: payments are disabled if any is missing. --- */
  MPESA_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  MPESA_CONSUMER_KEY: z.string().optional(),
  MPESA_CONSUMER_SECRET: z.string().optional(),
  MPESA_SHORTCODE: z.string().optional(),
  MPESA_PASSKEY: z.string().optional(),
  MPESA_TRANSACTION_TYPE: z.enum(['CustomerPayBillOnline', 'CustomerBuyGoodsOnline']).default('CustomerPayBillOnline'),
  /** Till/paybill that receives the money when it differs from the shortcode (Buy Goods). Defaults to MPESA_SHORTCODE. */
  MPESA_PARTY_B: z.string().optional(),
  /** Public https base URL of THIS API, e.g. https://cymorcoursechecker.onrender.com */
  MPESA_CALLBACK_BASE_URL: z.string().optional(),
  /** Random 24+ char string used inside the callback URL path so only Safaricom (who is given the URL) can call it. */
  MPESA_CALLBACK_SECRET: z.string().min(24, 'MPESA_CALLBACK_SECRET must be at least 24 characters').optional().or(z.literal('').transform(() => undefined)),
  /* --- Email (Brevo HTTPS API; SMTP ports are blocked on Render free tier). Optional. --- */
  BREVO_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  EMAIL_FROM_NAME: z.string().default('CYMOR CourseChecker'),
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
