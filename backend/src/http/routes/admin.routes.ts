import { Router } from 'express';
import multer from 'multer';
import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import { asyncH, requireAuth } from '../middleware/auth';
import { noStore, adminLimiter } from '../middleware/security';
import { auditQuery, correctionBody, couponActiveBody, couponBody, couponCodeParam, orderListQuery, reportIdParam, importQuery, loginBody, pagingQuery, versionParam } from '../validators';
import { ok } from '../../utils/response';
import crypto from 'node:crypto';
import { badRequest, notFound, unauthorized } from '../../utils/errors';
import type { AdminService } from '../../services/admin.service';
import type { DashboardService } from '../../services/dashboard.service';
import type { Env } from '../../config/env';

export function adminRoutes(deps: { admin: AdminService; dashboard: DashboardService; env: Env }): Router {
  const r = Router();
  r.use(adminLimiter(deps.env), noStore);

  // Uploads go to the OS temp dir (never a public/static directory) and are deleted after processing.
  const upload = multer({
    dest: path.join(os.tmpdir(), 'cymor-uploads'),
    limits: { fileSize: deps.env.UPLOAD_MAX_MB * 1024 * 1024, files: 2, fields: 5 },
    fileFilter: (_req, file, cb) => cb(null, file.mimetype === 'application/pdf'),
  });

  r.post('/login', asyncH(async (req, res) => {
    const b = loginBody.parse(req.body);
    res.json(ok(await deps.admin.login(b.email, b.password)));
  }));

  // One-time seed endpoint (no shell on Render free tier). Disabled unless SEED_KEY is set.
  // Key travels in the X-Seed-Key header only; works only while no dataset is active.
  r.post('/seed', asyncH(async (req, res) => {
    const key = deps.env.SEED_KEY;
    if (!key) throw notFound('Route not found');
    const h = (v: string) => crypto.createHash('sha256').update(v).digest();
    const given = req.header('x-seed-key') ?? '';
    if (!crypto.timingSafeEqual(h(given), h(key))) throw unauthorized('Invalid seed key');
    const out = await deps.admin.seedFromBundled(path.resolve(process.cwd(), 'data', 'source'));
    res.status(201).json(ok(out));
  }));

  const auth = requireAuth(deps.admin);
  r.use(auth);

  r.post('/import', upload.fields([{ name: 'clusterPdf', maxCount: 1 }, { name: 'cutoffPdf', maxCount: 1 }]), asyncH(async (req, res) => {
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const c = files?.clusterPdf?.[0];
    const k = files?.cutoffPdf?.[0];
    try {
      if (!c || !k) throw badRequest('Both clusterPdf and cutoffPdf must be uploaded as PDF files');
      const { dryRun } = importQuery.parse(req.query);
      const [cb, kb] = await Promise.all([fs.readFile(c.path), fs.readFile(k.path)]);
      const out = await deps.admin.importPdfs(req.principal!, { clusterPdf: cb, clusterFilename: c.originalname, cutoffPdf: kb, cutoffFilename: k.originalname }, { dryRun });
      res.status(dryRun ? 200 : 201).json(ok(out));
    } finally {
      await Promise.allSettled([c && fs.rm(c.path, { force: true }), k && fs.rm(k.path, { force: true })]);
    }
  }));

  r.get('/datasets', asyncH(async (_req, res) => void res.json(ok(await deps.admin.listDatasets()))));
  r.get('/datasets/:version', asyncH(async (req, res) => {
    const { version } = versionParam.parse(req.params);
    res.json(ok(await deps.admin.getDataset(version)));
  }));
  r.get('/datasets/:version/review', asyncH(async (req, res) => {
    const { version } = versionParam.parse(req.params);
    const q = pagingQuery.parse(req.query);
    res.json(ok(await deps.admin.reviewQueue(version, q.limit, q.skip)));
  }));
  r.post('/datasets/:version/corrections', asyncH(async (req, res) => {
    const { version } = versionParam.parse(req.params);
    res.json(ok(await deps.admin.correct(req.principal!, version, correctionBody.parse(req.body))));
  }));
  r.post('/datasets/:version/activate', asyncH(async (req, res) => {
    const { version } = versionParam.parse(req.params);
    res.json(ok(await deps.admin.activate(req.principal!, version)));
  }));
  r.post('/rollback', asyncH(async (req, res) => void res.json(ok(await deps.admin.rollback(req.principal!)))));
  r.get('/audit', asyncH(async (req, res) => {
    const q = auditQuery.parse(req.query);
    res.json(ok(await deps.admin.audit(q.limit)));
  }));

  // --- Business dashboard: reports, revenue, coupons ---
  r.get('/stats', asyncH(async (_req, res) => void res.json(ok(await deps.dashboard.stats()))));
  r.get('/orders', asyncH(async (req, res) => {
    const q = orderListQuery.parse(req.query);
    res.json(ok(await deps.dashboard.listOrders({ status: q.status, q: q.q, limit: q.limit, skip: q.skip })));
  }));
  r.get('/orders.csv', asyncH(async (_req, res) => {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="orders.csv"');
    res.end(await deps.dashboard.ordersCsv());
  }));
  r.post('/orders/:reportId/resend', asyncH(async (req, res) => {
    const { reportId } = reportIdParam.parse(req.params);
    res.json(ok(await deps.dashboard.resendEmail(req.principal!, reportId)));
  }));
  r.get('/coupons', asyncH(async (_req, res) => void res.json(ok(await deps.dashboard.listCoupons()))));
  r.post('/coupons', asyncH(async (req, res) => {
    const b = couponBody.parse(req.body);
    const c = await deps.dashboard.createCoupon(req.principal!, { code: b.code, percentOff: b.percentOff, maxUses: b.maxUses, expiresAt: b.expiresAt ? new Date(b.expiresAt) : undefined, note: b.note });
    res.status(201).json(ok(c));
  }));
  r.post('/coupons/:code/active', asyncH(async (req, res) => {
    const { code } = couponCodeParam.parse(req.params);
    const b = couponActiveBody.parse(req.body);
    res.json(ok(await deps.dashboard.setCouponActive(req.principal!, code, b.active)));
  }));
  return r;
}
