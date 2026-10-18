import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { MemoryAdminRepository, MemoryDatasetRepository, MemoryReportRepository } from './helpers/memoryRepo';
import { DatasetCache } from '../src/services/datasetCache';
import { CheckerService } from '../src/services/checker.service';
import { AdminService } from '../src/services/admin.service';
import { CLUSTER_1, SUB_1A, cut, prog } from './helpers/fixtures';
import type { BuiltDataset } from '../src/modules/import/dataset.builder';

const src = { sha256: 'a'.repeat(64), filename: 'x.pdf', sizeBytes: 1, pageCount: 1, title: null, publicationDate: null } as never;
const sources = { cluster: src, cutoffs: src };
const built = (): BuiltDataset => ({
  clusters: [CLUSTER_1], subClusters: [SUB_1A], reviewQueue: [], matchTiers: {},
  programmes: [prog('P1', 'Bachelor of Science in X', 'Alpha University', 1, '1A', [cut(2024, '20.000')]), prog('P2', 'Bachelor of Science in X', 'Beta University', 1, '1A', [cut(2024, '30.000')])],
  quality: { programmeRecords: 2, eligibleForActivation: 2, awaitingReview: 0, clusterDefinitions: 1, clusterDefinitionsUsable: 1, subClusters: 1, subClustersUsable: 1, recordsWithNoCutoffAtAll: 0, duplicateOrConflicting: { duplicateCodes: 0, possibleDuplicateNames: 0, institutionPrefixConflicts: 0 }, parseDiagnostics: { unrecognisedCutoffLines: 0, malformedCutoffRows: 0, clusterDocDiagnostics: [], strayClusterText: 0 } } as never,
});
const grades = Object.entries({ ENG: 'B+', KIS: 'B', MATA: 'A-', BIO: 'B+', CHE: 'B+', PHY: 'B', GEO: 'B' }).map(([subject, grade]) => ({ subject, grade })) as never;

async function setup() {
  const datasets = new MemoryDatasetRepository();
  const reports = new MemoryReportRepository();
  const admins = new MemoryAdminRepository();
  await admins.create({ email: 'a@x.test', passwordHash: await bcrypt.hash('correct horse battery', 4), role: 'admin' });
  const cache = new DatasetCache(datasets);
  await datasets.createDraft('v1', 'c1', built(), sources, 'test');
  await datasets.activate('v1', 'test');
  const checker = new CheckerService({ datasets: cache, reports, reportTtlDays: 1, siteName: 'T' });
  const admin = new AdminService({ datasets, admins, cache, jwtSecret: 'x'.repeat(40), jwtExpiresIn: '1h' });
  return { datasets, reports, admins, cache, checker, admin };
}
const q = { page: 1, pageSize: 25, sort: 'cutoff', order: 'desc' } as const;

test('checker run returns a report id + token; results need the token', async () => {
  const { checker } = await setup();
  const out = await checker.run({ candidate: {}, grades }, q);
  assert.ok(out.reportId.length >= 22 && out.accessToken.length >= 30);
  assert.equal(out.results.total, 2);
  assert.equal(out.results.items[0]?.programmeCode, 'P2'); // highest cutoff first
  await assert.rejects(checker.getResults(out.reportId, undefined, q), /token/i);
  await assert.rejects(checker.getResults(out.reportId, 'wrong-token', q), /Invalid/);
  assert.equal((await checker.getResults(out.reportId, out.accessToken, q)).results.total, 2);
});
test('token is stored only as a hash; report ids are unique and unguessable', async () => {
  const { checker, reports } = await setup();
  const a = await checker.run({ candidate: {}, grades }, q);
  const b = await checker.run({ candidate: {}, grades }, q);
  assert.notEqual(a.reportId, b.reportId);
  const stored = await reports.get(a.reportId);
  assert.ok(stored && stored.tokenHash !== a.accessToken && !JSON.stringify(stored).includes(a.accessToken));
});
test('invalid grades are rejected with details', async () => {
  const { checker } = await setup();
  await assert.rejects(checker.run({ candidate: {}, grades: [{ subject: 'ENG', grade: 'A' }] as never }, q));
});
test('PDF needs a valid token and returns a PDF', async () => {
  const { checker } = await setup();
  const out = await checker.run({ candidate: { name: 'Test' }, grades }, q);
  await assert.rejects(checker.buildPdf(out.reportId, 'nope'));
  const pdf = await checker.buildPdf(out.reportId, out.accessToken);
  assert.equal(Buffer.from(pdf.bytes.slice(0, 4)).toString(), '%PDF');
});
test('admin login: wrong password, unknown user and lockout all give the same error', async () => {
  const { admin } = await setup();
  const msgs = new Set<string>();
  for (const [e, p] of [['a@x.test', 'bad'], ['nobody@x.test', 'bad']] as const) await admin.login(e, p).catch((x: Error) => msgs.add(x.message));
  assert.equal(msgs.size, 1);
  for (let i = 0; i < 5; i++) await admin.login('a@x.test', 'bad').catch(() => undefined);
  await assert.rejects(admin.login('a@x.test', 'correct horse battery'), /Invalid credentials/); // locked
});
test('admin login succeeds and token verifies; garbage token fails', async () => {
  const { admin } = await setup();
  const { token } = await admin.login('a@x.test', 'correct horse battery');
  assert.equal(admin.verifyToken(token).email, 'a@x.test');
  assert.throws(() => admin.verifyToken(token + 'x'));
});
test('activation gate blocks a dataset with too few validated programmes; rollback restores previous', async () => {
  const { datasets, admin } = await setup();
  const weak = built();
  weak.programmes = weak.programmes.map((p) => ({ ...p, verificationStatus: 'needs_review' as const, issues: ['x'] }));
  await datasets.createDraft('v2', 'c2', weak, sources, 'test');
  const p = { email: 'a@x.test', role: 'admin' as const };
  await assert.rejects(admin.activate(p, 'v2'), /activation checks/);
  assert.equal(await datasets.getActiveVersion(), 'v1');
  await datasets.createDraft('v3', 'c3', built(), sources, 'test');
  await admin.activate(p, 'v3');
  assert.equal(await datasets.getActiveVersion(), 'v3');
  await admin.rollback(p);
  assert.equal(await datasets.getActiveVersion(), 'v1');
});
test('failed import leaves the active dataset untouched', async () => {
  const { datasets } = await setup();
  datasets.failNextCreate = true;
  await assert.rejects(datasets.createDraft('v9', 'c9', built(), sources, 't'));
  assert.equal(await datasets.getActiveVersion(), 'v1');
  assert.equal((await datasets.listVersions()).some((v) => v.version === 'v9'), false);
});
test('reviewers cannot activate', async () => {
  const { admin } = await setup();
  await assert.rejects(admin.activate({ email: 'r@x.test', role: 'reviewer' }, 'v1'), /Administrator/);
});
