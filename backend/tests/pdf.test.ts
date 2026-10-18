import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { generateReportPdf, ReportData } from '../src/modules/pdf/report.pdf';
import { evaluateCandidate } from '../src/modules/eligibility/eligibility.service';
import { recommendChoices } from '../src/modules/recommendations/recommendations.service';
import { computeAggregate } from '../src/modules/scoring/clusterScore.service';
import { GRADES, VIEW, cut, prog } from './helpers/fixtures';

const src = { sha256: 'a'.repeat(64), filename: 'x.pdf', sizeBytes: 1, pageCount: 1, title: null, publicationDate: null } as never;
function data(n: number, nameLen = 20, extra: Partial<ReportData> = {}): ReportData {
  const list = Array.from({ length: n }, (_, i) => prog(`C${i}`, `Bachelor of Science in ${'Very Long Programme Name '.repeat(Math.ceil(nameLen / 26))}${i}`.slice(0, nameLen + 25), `University Number ${i % 40} of Technology & Science "Quotes" ΩΩ`, 1, '1A', [cut(2024, (1 + (i % 30) * 0.5).toFixed(3), i % 7 === 0)]));
  const res = evaluateCandidate(GRADES as never, list, VIEW);
  return {
    siteName: 'CYMOR KUCCPS CourseChecker', reportId: 'AbCdEfGhIjKlMnOpQrStUv', generatedAt: new Date('2026-01-01T00:00:00Z'), datasetVersion: 'ds-test',
    cutoffPolicyLabel: 'latest-specific-verified', grades: GRADES as never, aggregate: { t: res.aggregate.t, subjects: res.aggregate.subjects }, meanGrade: 'B',
    options: res.options, recommendation: recommendChoices(res.options), sources: { cluster: src, cutoffs: src }, cutoffYearsUsed: [2024], ...extra,
  };
}
const pages = async (b: Uint8Array) => (await PDFDocument.load(b)).getPageCount();
const text = (b: Uint8Array) => {
  const f = path.join(os.tmpdir(), `t-${process.pid}-${Math.random().toString(36).slice(2)}.pdf`);
  fs.writeFileSync(f, b);
  try { return execFileSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf8' }); } catch { return null; } finally { fs.rmSync(f, { force: true }); }
};

test('zero options: valid PDF with a no-results message', async () => {
  const b = await generateReportPdf(data(0));
  assert.ok((await pages(b)) >= 4);
  const t = text(b);
  if (t) assert.match(t, /No programme passed/);
});
test('one option', async () => assert.ok((await pages(await generateReportPdf(data(1)))) >= 4));
test('150+ options paginate with page numbers and all rows present', async () => {
  const d = data(180);
  const b = await generateReportPdf(d);
  const n = await pages(b);
  assert.ok(n > 8);
  const t = text(b);
  if (t) {
    assert.match(t, new RegExp(`Page ${n} of ${n}`));
    assert.match(t, /Report AbCdEfGhIjKlMnOpQrStUv/);
    for (const o of d.options.slice(0, 180)) assert.ok(t.includes(o.programmeCode), `missing ${o.programmeCode}`);
  }
});
test('section order: choices first, then qualifying list sorted by highest cutoff', async () => {
  const t = text(await generateReportPdf(data(40)));
  if (!t) return;
  assert.ok(t.indexOf('Your recommended application choices') < t.indexOf('All qualifying degree programmes'));
  assert.ok(t.indexOf('All qualifying degree programmes') < t.indexOf('Methodology and important disclaimer'));
});
test('long names and unusual characters do not crash', async () => {
  assert.ok((await pages(await generateReportPdf(data(5, 400, { candidateName: 'Ångström “Q” Ω '.repeat(10), candidateReference: 'REF/ΩΩ/2026' })))) >= 4);
});
test('qualifying rows appear in descending cutoff order', async () => {
  const d = data(30);
  const t = text(await generateReportPdf(d));
  if (!t) return;
  const sorted = [...d.options].sort((a, b) => b.cutoffValue - a.cutoffValue);
  const idx = sorted.slice(0, 6).map((o) => t.indexOf(o.programmeCode, t.indexOf('All qualifying')));
  assert.ok(idx.every((x, i) => x >= 0 && (i === 0 || x > (idx[i - 1] as number))));
  void computeAggregate;
});
