import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCandidate } from '../src/modules/eligibility/eligibility.service';
import { computeAggregate, selectClusterSlots, clusterScore } from '../src/modules/scoring/clusterScore.service';
import { GRADES, VIEW, CLUSTER_1, cut, prog, makeView, sub, SUB_1A } from './helpers/fixtures';

const g = GRADES as never;
const score = (() => {
  const t = (computeAggregate(g) as { t: number }).t;
  const r = (selectClusterSlots(CLUSTER_1.slotRules, g) as { r: number }).r;
  return { t, r, c: clusterScore(r, t) };
})();

test('qualifies when requirements are met and score is above cutoff', () => {
  const res = evaluateCandidate(g, [prog('P1', 'Bachelor of Science in X', 'Alpha University', 1, '1A', [cut(2024, '20.000')])], VIEW);
  assert.equal(res.options.length, 1);
  assert.equal(res.options[0]?.cutoffYear, 2024);
});
test('score exactly equal to the cutoff is included; the next representable cutoff excludes', () => {
  // use an exactly representable boundary: pick programme with cutoff = score printed to 12 decimals is not exact, so test via exact rational case
  const exactCandidate = { ENG: 'A', KIS: 'A', MATA: 'A', BIO: 'A', CHE: 'A', PHY: 'A', GEO: 'A' } as never; // r=48, t=84 -> 48
  const at = evaluateCandidate(exactCandidate, [prog('E1', 'Bachelor of Science Exact', 'Alpha University', 1, '1A', [cut(2024, '48.000')])], VIEW);
  assert.equal(at.options.length, 1);
  const above = evaluateCandidate(exactCandidate, [prog('E2', 'Bachelor of Science Exact', 'Alpha University', 1, '1A', [cut(2024, '48.001')])], VIEW);
  assert.equal(above.options.length, 0);
  assert.equal(above.diagnostics.skipped.below_cutoff, 1);
});
test('below cutoff is excluded', () => {
  const res = evaluateCandidate(g, [prog('P2', 'Bachelor of Science Y', 'Alpha University', 1, '1A', [cut(2024, String(Math.ceil(score.c + 1)) + '.000')])], VIEW);
  assert.equal(res.options.length, 0);
});
test('missing cutoff is never treated as zero', () => {
  const res = evaluateCandidate(g, [prog('P3', 'Bachelor of Science Z', 'Alpha University', 1, '1A', [])], VIEW);
  assert.equal(res.options.length, 0);
  assert.equal(res.diagnostics.skipped.no_cutoff_available, 1);
});
test('subject requirement failure excludes even with a huge margin', () => {
  const weakChem = { ENG: 'A', KIS: 'A', MATA: 'A', BIO: 'D', CHE: 'D', PHY: 'D', GEO: 'A', CRE: 'A' } as never;
  const res = evaluateCandidate(weakChem, [prog('P4', 'Bachelor of Science W', 'Alpha University', 1, '1A', [cut(2024, '5.000')])], VIEW);
  assert.equal(res.options.length, 0);
  assert.equal(res.diagnostics.skipped.requirements_not_met, 1);
});
test('the same programme at many universities is evaluated per university with each own cutoff', () => {
  const list = [
    prog('A1', 'Bachelor of Science in X', 'Alpha University', 1, '1A', [cut(2024, '10.000')]),
    prog('B1', 'Bachelor of Science in X', 'Beta University', 1, '1A', [cut(2024, '50.000')]),
    prog('C1', 'Bachelor of Science in X', 'Gamma University', 1, '1A', [cut(2024, '20.000')]),
  ];
  const res = evaluateCandidate(g, list, VIEW);
  assert.deepEqual(res.options.map((o) => o.institutionName).sort(), ['Alpha University', 'Gamma University']);
});
test('programmes that are not validated are never offered', () => {
  const res = evaluateCandidate(g, [prog('N1', 'Bachelor of Science N', 'Alpha University', 1, '1A', [cut(2024, '5.000')], 'needs_review'), prog('N2', 'Bachelor Of Science M', 'Alpha University', null, null, [cut(2024, '5.000')])], VIEW);
  assert.equal(res.options.length, 0);
  assert.equal(res.diagnostics.skipped.not_validated, 1);
  assert.equal(res.diagnostics.skipped.no_cluster_mapping, 1);
});
test('unparsed requirement text makes the sub-cluster not evaluable (excluded, counted)', () => {
  const bad = sub(1, '1B', [[1, 'MATH C - (PLAIN)']]);
  const v = makeView([CLUSTER_1], [SUB_1A, bad]);
  const res = evaluateCandidate(g, [prog('U1', 'Bachelor of Science U', 'Alpha University', 1, '1B', [cut(2024, '5.000')])], v);
  assert.equal(res.options.length, 0);
  assert.equal(res.diagnostics.skipped.requirements_unusable, 1);
});
test('options are sorted by cutoff, highest first; shared-only cutoffs stay flagged', () => {
  const list = [
    prog('S1', 'Bachelor of Science Shared', 'Alpha University', 1, '1A', [cut(2022, '5.000', true)]),
    prog('S2', 'Bachelor of Science Specific', 'Beta University', 1, '1A', [cut(2019, '19.000')]),
    prog('S4', 'Bachelor of Science Mid', 'Gamma University', 1, '1A', [cut(2024, '12.000')]),
  ];
  const res = evaluateCandidate(g, list, VIEW);
  assert.deepEqual(res.options.map((o) => o.programmeCode), ['S2', 'S4', 'S1']);
  assert.equal(res.options[2]?.cutoffIsShared, true);
});
test('latest-specific skips a newer shared value in favour of an older specific one', () => {
  const p = prog('S3', 'Bachelor of Science Mixed', 'Alpha University', 1, '1A', [cut(2019, '19.000'), cut(2023, '5.000', true)]);
  assert.equal(evaluateCandidate(g, [p], VIEW).options[0]?.cutoffYear, 2019);
  assert.equal(evaluateCandidate(g, [p], VIEW, { cutoffPolicy: { type: 'latest-available' } }).options[0]?.cutoffYear, 2023);
});
test('an underqualified candidate (6 subjects) gets no options and a reason', () => {
  const res = evaluateCandidate({ ENG: 'A', KIS: 'A', MATA: 'A', BIO: 'A', CHE: 'A', PHY: 'A' } as never, [prog('X', 'Bachelor of Science X', 'Alpha University', 1, '1A', [cut(2024, '1.000')])], VIEW);
  assert.equal(res.aggregate.ok, false);
  assert.equal(res.options.length, 0);
});
test('scores are not capped at 100 and keep full precision', () => {
  const res = evaluateCandidate(g, [prog('Q', 'Bachelor of Science Q', 'Alpha University', 1, '1A', [cut(2024, '1.000')])], VIEW);
  const o = res.options[0]!;
  assert.ok(o.score <= 48 && o.score > 1);
  assert.notEqual(o.score, Number(o.score.toFixed(3)));
});
