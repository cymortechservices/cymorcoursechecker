import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { fail } from '../../utils/response';
import { AppError } from '../../utils/errors';
import type { Env } from '../../config/env';

export const securityHeaders = (): RequestHandler =>
  helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'no-referrer' },
  });

export function corsPolicy(env: Env): RequestHandler {
  const allowed = new Set(env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean));
  return cors({
    origin(origin, cb) {
      // Non-browser clients send no Origin; browsers must be on the allow-list.
      if (!origin || allowed.has(origin)) return cb(null, true);
      return cb(null, false);
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Report-Token'],
    exposedHeaders: ['Content-Disposition'],
    maxAge: 600,
  });
}

const limited = (windowMs: number, max: number): RequestHandler =>
  rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json(fail('RATE_LIMITED', 'Too many requests. Please wait a moment and try again.'));
    },
  });

export const publicLimiter = (env: Env) => limited(60_000, env.PUBLIC_RATE_LIMIT_PER_MIN);
export const pdfLimiter = (env: Env) => limited(10 * 60_000, env.PDF_RATE_LIMIT_PER_10MIN);
export const paymentLimiter = (env: Env) => limited(10 * 60_000, env.PAYMENT_RATE_LIMIT_PER_10MIN * 6);
export const adminLimiter = (env: Env) => limited(15 * 60_000, env.ADMIN_RATE_LIMIT_PER_15MIN);

export const requestTimeout = (ms: number): RequestHandler => (req, res, next) => {
  res.setTimeout(ms, () => {
    if (!res.headersSent) res.status(503).json(fail('TIMEOUT', 'The request took too long.'));
  });
  next();
};

/** Minimal request log: method, path (no query string, so no tokens/PII), status, duration. Never bodies or headers. */
export const requestLog = (enabled: boolean): RequestHandler => (req, res, next) => {
  if (!enabled) return next();
  const start = Date.now();
  res.on('finish', () => {
    console.log(JSON.stringify({ t: new Date().toISOString(), m: req.method, p: req.path.replace(/[A-Za-z0-9_-]{22,}/g, ':id'), s: res.statusCode, ms: Date.now() - start }));
  });
  next();
};

export const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json(fail('NOT_FOUND', 'Route not found'));
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.status).json(fail(err.code, err.message, err.details));
    return;
  }
  const e = err as { type?: string; name?: string; code?: string };
  if (e?.type === 'entity.too.large') return void res.status(413).json(fail('PAYLOAD_TOO_LARGE', 'Request body is too large'));
  if (e?.type === 'entity.parse.failed') return void res.status(400).json(fail('BAD_JSON', 'Request body is not valid JSON'));
  if (e?.code === 'LIMIT_FILE_SIZE') return void res.status(413).json(fail('FILE_TOO_LARGE', 'Uploaded file is too large'));
  if (e?.name === 'ZodError') return void res.status(400).json(fail('VALIDATION_ERROR', 'Request validation failed', (err as { issues: unknown }).issues));
  // Unknown errors: log type only (no stack to clients, no request data in logs).
  console.error('Unhandled error:', e?.name ?? 'Error', (err as Error)?.message?.slice(0, 200));
  res.status(500).json(fail('INTERNAL_ERROR', 'Something went wrong. Please try again.'));
}
