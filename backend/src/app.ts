import express, { Express } from 'express';
import type { Env } from './config/env';
import type { CheckerService } from './services/checker.service';
import type { PaymentService } from './services/payment.service';
import type { DashboardService } from './services/dashboard.service';
import type { ReportEmailService } from './services/reportEmail.service';
import type { AdminService } from './services/admin.service';
import type { DatasetCache } from './services/datasetCache';
import { corsPolicy, errorHandler, notFoundHandler, publicLimiter, requestLog, requestTimeout, securityHeaders } from './http/middleware/security';
import { publicRoutes } from './http/routes/public.routes';
import { adminRoutes } from './http/routes/admin.routes';

export interface AppDeps {
  env: Env;
  checker: CheckerService;
  admin: AdminService;
  payments: PaymentService;
  dashboard: DashboardService;
  emails: ReportEmailService;
  cache: DatasetCache;
  isDbReady: () => boolean;
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Render terminates TLS behind one proxy hop
  app.use(requestLog(deps.env.NODE_ENV !== 'test'));
  app.use(securityHeaders());
  app.use(corsPolicy(deps.env));
  app.use(requestTimeout(deps.env.REQUEST_TIMEOUT_MS));
  app.use(express.json({ limit: '50kb' }));
  app.get('/', (_req, res) => { res.json({ success: true, data: { service: deps.env.SITE_NAME, api: '/api/v1', health: '/api/v1/health' } }); });
  app.get('/api', (_req, res) => { res.json({ success: true, data: { api: '/api/v1' } }); });
  // Safaricom callback: secret in the path, always acknowledged, mounted before the public rate limiter.
  app.post('/api/v1/payments/mpesa/callback/:secret', async (req, res, next) => {
    try {
      await deps.payments.handleCallback(String(req.params.secret ?? ''), req.body);
      res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
    } catch (e) {
      next(e);
    }
  });
  app.use('/api/v1/admin', adminRoutes({ admin: deps.admin, dashboard: deps.dashboard, env: deps.env }));
  app.use('/api/v1', publicLimiter(deps.env), publicRoutes({ checker: deps.checker, payments: deps.payments, emails: deps.emails, cache: deps.cache, env: deps.env, isDbReady: deps.isDbReady }));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
