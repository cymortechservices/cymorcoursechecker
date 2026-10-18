import test from 'node:test';
import assert from 'node:assert/strict';
import { clusterScore, computeAggregate, selectClusterSlots, meanGradeFromAggregate } from '../src/modules/scoring/clusterScore.service';
import { CLUSTER_1, cluster } from './helpers/fixtures';

test('formula: perfect candidate scores 48', () => assert.equal(clusterScore(48, 84), 48));
test('formula: documented example sqrt((36/48)*(63/84))*48', () => assert.ok(Math.abs(clusterScore(36, 63) - 36) < 1e-9));
test('formula rejects impossible inputs', () => {
  assert.throws(() => clusterScore(49, 80));
  assert.throws(() => clusterScore(40, 90));
  assert.throws(() => clusterScore(Number.NaN, 50));
});
test('score is never capped at 100 or rounded', () => {
  const s = clusterScore(41, 70);
  assert.notEqual(s, Math.round(s));
  assert.ok(s <= 48);
});
test('aggregate: compulsory + best four others (Maths A/B counts once)', () => {
  const a = computeAggregate({ ENG: 'B', KIS: 'B', MATA: 'A', BIO: 'A', CHE: 'A-', PHY: 'B+', GEO: 'C', CRE: 'D' });
  assert.equal(a.ok, true);
  // ENG 8 + KIS 8 + MATA 12 + BIO 12 + CHE 11 + PHY 9 + GEO 5
  assert.equal(a.t, 9 + 9 + 12 + 12 + 11 + 10 + 6);
});
test('aggregate: fewer than 7 subjects is refused, not padded', () => {
  const a = computeAggregate({ ENG: 'A', KIS: 'A', MATA: 'A', BIO: 'A', CHE: 'A', PHY: 'A' });
  assert.equal(a.ok, false);
  assert.equal(a.t, 0);
});
test('aggregate: missing a compulsory subject is refused', () => {
  const a = computeAggregate({ ENG: 'A', MATA: 'A', BIO: 'A', CHE: 'A', PHY: 'A', GEO: 'A', CRE: 'A' });
  assert.equal(a.ok, false);
});
test('slots: picks the highest grades that satisfy each rule without reuse', () => {
  const sel = selectClusterSlots(CLUSTER_1.slotRules, { ENG: 'B', KIS: 'A', MATA: 'A-', BIO: 'B+', CHE: 'A', GEO: 'B', CRE: 'C', BST: 'D' });
  assert.equal(sel.status, 'resolved');
  // MATA 11, ENG/KIS best = KIS 12, group II best = CHE 12, group III or V best = GEO 9
  assert.equal(sel.r, 11 + 12 + 12 + 9);
  assert.equal(new Set(sel.picks.map((p) => p.subject)).size, 4);
});
test('slots: unresolved (never filled with a substitute) when no subject fits', () => {
  const sel = selectClusterSlots(CLUSTER_1.slotRules, { ENG: 'B', KIS: 'B', MATA: 'B', GEO: 'B', CRE: 'B', BST: 'B', AGR: 'B' });
  assert.equal(sel.status, 'unresolved');
  assert.match(sel.reason ?? '', /cluster subject 3/);
});
test('slots: strict ordinal - "2nd GROUP II" needs an earlier group II pick', () => {
  const c = cluster(9, ['MAT ALTERNATIVE A', 'ENG/KIS', 'Any GROUP II', '2nd GROUP II']);
  const one = selectClusterSlots(c.slotRules, { ENG: 'A', KIS: 'A', MATA: 'A', BIO: 'A' });
  assert.equal(one.status, 'unresolved');
  const two = selectClusterSlots(c.slotRules, { ENG: 'A', KIS: 'A', MATA: 'A', BIO: 'A', CHE: 'B' });
  assert.equal(two.status, 'resolved');
});
test('mean grade mapping', () => {
  assert.equal(meanGradeFromAggregate(84), 'A');
  assert.equal(meanGradeFromAggregate(7), 'E');
  assert.equal(meanGradeFromAggregate(0), null);
});
