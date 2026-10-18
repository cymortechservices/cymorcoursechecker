import type { RequestHandler } from 'express';
import type { AdminService, AdminPrincipal } from '../../services/admin.service';
import { unauthorized } from '../../utils/errors';

declare module 'express-serve-static-core' {
  interface Request {
    principal?: AdminPrincipal;
  }
}

/** Bearer token from the Authorization header only. Tokens in URLs/queries are never read. */
export const requireAuth = (admin: AdminService): RequestHandler => (req, _res, next) => {
  const h = req.header('authorization') ?? '';
  const m = /^Bearer ([A-Za-z0-9._-]+)$/.exec(h);
  if (!m) return next(unauthorized());
  try {
    req.principal = admin.verifyToken(m[1] as string);
    next();
  } catch (e) {
    next(e);
  }
};

export const asyncH = (fn: (req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]) => Promise<void>): RequestHandler => (req, res, next) => {
  fn(req, res).catch(next);
};
