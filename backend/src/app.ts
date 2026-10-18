import express, { Express } from 'express';
import type { Env } from './config/env';
import type { CheckerService } from './services/checker.service';
import type { AdminService } from './services/admin.service';
import type { DatasetCache } from './services/datasetCache';
import { corsPolicy, errorHandler, notFoundHandler, publicLimiter, requestLog, requestTimeout, securityHeaders } from './http/middleware/security';
import { publicRoutes } from './http/routes/public.routes';
import { adminRoutes } from './http/routes/admin.routes';

export interface AppDeps {
  env: Env;
  checker: CheckerService;
  admin: AdminService;
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
  app.use('/api/v1/admin', adminRoutes({ admin: deps.admin, env: deps.env }));
  app.use('/api/v1', publicLimiter(deps.env), publicRoutes({ checker: deps.checker, cache: deps.cache, env: deps.env, isDbReady: deps.isDbReady }));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
