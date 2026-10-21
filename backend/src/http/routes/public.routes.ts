import { Router } from 'express';
import { asyncH } from '../middleware/auth';
import { noStore, paymentLimiter, pdfLimiter } from '../middleware/security';
import { checkBody, nameSuggestQuery, payBody, programmeSearchQuery, quoteBody, reportIdParam, resultsQuerySchema, validateBody } from '../validators';
import { ok } from '../../utils/response';
import { publicSubjects, GRADES, GRADE_POINTS, SUBJECT_CATALOGUE_VERSION } from '../../modules/subjects/catalogue';
import { SCORING_METHODOLOGY } from '../../modules/scoring/clusterScore.service';
import type { CheckerService } from '../../services/checker.service';
import type { PaymentService } from '../../services/payment.service';
import type { ReportEmailService } from '../../services/reportEmail.service';
import type { DatasetCache } from '../../services/datasetCache';
import type { Env } from '../../config/env';
import { notFound } from '../../utils/errors';

export function publicRoutes(deps: { checker: CheckerService; payments: PaymentService; emails: ReportEmailService; cache: DatasetCache; env: Env; isDbReady: () => boolean }): Router {
  const r = Router();
  const token = (req: Parameters<Parameters<typeof asyncH>[0]>[0]) => req.header('x-report-token') ?? undefined;

  // Friendly index so opening the API address in a browser shows that it is running and which routes exist.
  r.get('/', (_req, res) => {
    res.json(ok({ service: deps.env.SITE_NAME, status: 'running', version: 'v1', routes: ['/health', '/subjects', '/metadata', '/checker/validate', '/checker/results', '/results/:reportId/summary', '/results/:reportId', '/results/:reportId/choices', '/payments/:reportId/quote', '/payments/:reportId/pay', '/payments/:reportId/status', '/reports/:reportId/pdf', '/institutions', '/cutoff-years', '/programmes'] }));
  });

  r.get('/health', (_req, res) => {
    res.status(deps.isDbReady() ? 200 : 503).json(ok({ status: deps.isDbReady() ? 'ok' : 'degraded' }));
  });

  r.get('/subjects', (_req, res) => {
    res.json(ok({ catalogueVersion: SUBJECT_CATALOGUE_VERSION, grades: GRADES.map((g) => ({ grade: g, points: GRADE_POINTS[g] })), subjects: publicSubjects(), groupsAreAssumed: true }));
  });

  r.get('/metadata', asyncH(async (_req, res) => {
    const ds = await deps.cache.active();
    const m = ds.loaded.meta;
    res.json(ok({
      siteName: deps.env.SITE_NAME,
      datasetVersion: m.version,
      activatedAt: m.activatedAt ?? null,
      sources: { cluster: pick(m.sources.cluster), cutoffs: pick(m.sources.cutoffs) },
      cutoffYears: [...new Set(ds.loaded.programmes.flatMap((p) => p.cutoffs.map((c) => c.year)))].sort(),
      methodology: SCORING_METHODOLOGY,
      reportRetentionDays: deps.env.REPORT_TTL_DAYS,
    }));
  }));

  r.post('/checker/validate', (req, res) => {
    const body = validateBody.parse(req.body);
    const v = deps.checker.validate({ grades: body.grades });
    res.json(ok({ valid: v.ok, errors: v.errors, warnings: v.warnings }));
  });

  r.post('/checker/results', noStore, asyncH(async (req, res) => {
    const b = checkBody.parse(req.body);
    const out = await deps.checker.run({ candidate: b.candidate, email: b.email, grades: b.grades, preferences: b.preferences, cutoffPolicy: b.cutoffPolicy });
    res.status(201).json(ok(out));
  }));

  // Teaser (counts only) + payment state; allowed before payment.
  r.get('/results/:reportId/summary', noStore, asyncH(async (req, res) => {
    const { reportId } = reportIdParam.parse(req.params);
    res.json(ok(await deps.checker.getSummary(reportId, token(req))));
  }));

  r.get('/pricing', (_req, res) => {
    res.json(ok({ currency: 'KES', priceKes: deps.env.PRICE_KES, paymentsAvailable: deps.payments.paymentsAvailable, support: { email: deps.env.SUPPORT_EMAIL, whatsapp: deps.env.SUPPORT_WHATSAPP } }));
  });

  r.post('/payments/:reportId/quote', paymentLimiter(deps.env), noStore, asyncH(async (req, res) => {
    const { reportId } = reportIdParam.parse(req.params);
    await deps.checker.authorise(reportId, token(req));
    const b = quoteBody.parse(req.body ?? {});
    res.json(ok(await deps.payments.quote(b.couponCode)));
  }));

  r.post('/payments/:reportId/pay', paymentLimiter(deps.env), noStore, asyncH(async (req, res) => {
    const { reportId } = reportIdParam.parse(req.params);
    const report = await deps.checker.authorise(reportId, token(req));
    const b = payBody.parse(req.body ?? {});
    res.json(ok(await deps.payments.initiate(report, b)));
  }));

  r.get('/payments/:reportId/status', noStore, asyncH(async (req, res) => {
    const { reportId } = reportIdParam.parse(req.params);
    const report = await deps.checker.authorise(reportId, token(req));
    res.json(ok(await deps.payments.status(report)));
  }));

  // User-triggered re-send of the report email (paid reports only).
  r.post('/reports/:reportId/email', paymentLimiter(deps.env), noStore, asyncH(async (req, res) => {
    const { reportId } = reportIdParam.parse(req.params);
    await deps.checker.authorise(reportId, token(req));
    await deps.checker.getRecommendations(reportId, token(req)); // 402 unless paid
    res.json(ok({ result: await deps.emails.deliver(reportId) }));
  }));

  // Distinct programme names for the optional preference picker.
  r.get('/programme-names', asyncH(async (req, res) => {
    const q = nameSuggestQuery.parse(req.query);
    const ds = await deps.cache.active();
    const needle = q.q.toLowerCase();
    const names = new Set<string>();
    for (const p of ds.loaded.programmes) {
      if (p.verificationStatus !== 'validated') continue;
      if (!needle || p.programmeName.toLowerCase().includes(needle)) names.add(p.programmeName);
      if (names.size >= 400) break;
    }
    res.json(ok([...names].sort((a, b) => a.localeCompare(b)).slice(0, q.limit)));
  }));

  // Token travels in the X-Report-Token header (never in the URL).
  r.get('/results/:reportId', noStore, asyncH(async (req, res) => {
    const { reportId } = reportIdParam.parse(req.params);
    const q = resultsQuerySchema.parse(req.query);
    res.json(ok(await deps.checker.getResults(reportId, token(req), q)));
  }));

  r.get('/results/:reportId/choices', noStore, asyncH(async (req, res) => {
    const { reportId } = reportIdParam.parse(req.params);
    res.json(ok(await deps.checker.getRecommendations(reportId, token(req))));
  }));

  r.post('/reports/:reportId/pdf', pdfLimiter(deps.env), noStore, asyncH(async (req, res) => {
    const { reportId } = reportIdParam.parse(req.params);
    const { bytes, filename } = await deps.checker.buildPdf(reportId, token(req));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(bytes.length));
    res.end(Buffer.from(bytes));
  }));

  r.get('/institutions', asyncH(async (_req, res) => {
    const ds = await deps.cache.active();
    const map = new Map<string, string>();
    for (const p of ds.loaded.programmes) if (p.verificationStatus === 'validated') map.set(p.institutionCode, p.institutionName);
    res.json(ok([...map].map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name))));
  }));

  r.get('/cutoff-years', asyncH(async (_req, res) => {
    const ds = await deps.cache.active();
    const years = new Map<number, number>();
    for (const p of ds.loaded.programmes) for (const c of p.cutoffs) years.set(c.year, (years.get(c.year) ?? 0) + 1);
    res.json(ok([...years].map(([year, observations]) => ({ year, observations })).sort((a, b) => a.year - b.year)));
  }));

  r.get('/programmes', asyncH(async (req, res) => {
    const q = programmeSearchQuery.parse(req.query);
    const ds = await deps.cache.active();
    const needle = q.q?.toLowerCase();
    const list = ds.loaded.programmes.filter((p) => p.verificationStatus === 'validated' && (!q.institution || p.institutionCode === q.institution) && (!needle || `${p.programmeName} ${p.institutionName} ${p.programmeCode}`.toLowerCase().includes(needle)));
    res.json(ok({ total: list.length, items: list.slice(q.skip, q.skip + q.limit).map((p) => ({ programmeCode: p.programmeCode, programmeName: p.programmeName, institutionCode: p.institutionCode, institutionName: p.institutionName, cutoffs: p.cutoffs.map((c) => ({ year: c.year, cutoff: c.raw, basis: c.shared ? 'shared-minimum' : 'programme-specific' })) })) }));
  }));

  r.get('/programmes/:code', asyncH(async (req, res) => {
    const code = String(req.params.code ?? '').slice(0, 30);
    const ds = await deps.cache.active();
    const p = ds.loaded.programmes.find((x) => x.programmeCode === code && x.verificationStatus === 'validated');
    if (!p) throw notFound('Programme not found');
    res.json(ok({ programmeCode: p.programmeCode, programmeName: p.programmeName, institutionCode: p.institutionCode, institutionName: p.institutionName, subClusterId: p.subClusterId, cutoffs: p.cutoffs.map((c) => ({ year: c.year, cutoff: c.raw, basis: c.shared ? 'shared-minimum' : 'programme-specific' })) }));
  }));

  return r;
}

function pick(s: { filename?: string; sha256: string; pageCount?: number; publicationDate?: string | null; title?: string | null }) {
  return { title: s.title ?? null, publicationDate: s.publicationDate ?? null, pageCount: s.pageCount ?? null, sha256: s.sha256 };
}
