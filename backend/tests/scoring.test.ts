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
test('aggregate: maths + better language + best five of the rest (weaker language competes)', () => {
  // ENG B 9, KIS A- 11 -> KIS is the language; ENG competes with the others.
  const a = computeAggregate({ ENG: 'B', KIS: 'A-', MATA: 'A', BIO: 'A', CHE: 'A-', PHY: 'B+', GEO: 'C', CRE: 'D' });
  assert.equal(a.ok, true);
  // MATA 12 + KIS 11 + best five of {BIO 12, CHE 11, PHY 10, ENG 9, GEO 6, CRE 3} = 12+11+10+9+6
  assert.equal(a.t, 12 + 11 + 12 + 11 + 10 + 9 + 6);
  assert.equal(a.subjects.length, 7);
});
test('aggregate: the weaker language is dropped when it is outside the best five', () => {
  const a = computeAggregate({ ENG: 'E', KIS: 'A', MATA: 'A', BIO: 'A', CHE: 'A', PHY: 'A', GEO: 'A', CRE: 'A' });
  assert.equal(a.ok, true);
  assert.ok(!a.subjects.some((s) => s.code === 'ENG'));
  assert.equal(a.t, 12 * 7);
});
test('aggregate: exactly seven subjects uses all of them', () => {
  const a = computeAggregate({ ENG: 'B', KIS: 'C', MATA: 'A', BIO: 'B', CHE: 'B', PHY: 'C', GEO: 'D' });
  assert.equal(a.t, 9 + 6 + 12 + 9 + 9 + 6 + 3);
});
test('aggregate: Mathematics is compulsory', () => {
  assert.equal(computeAggregate({ ENG: 'A', KIS: 'A', BIO: 'A', CHE: 'A', PHY: 'A', GEO: 'A', CRE: 'A', BST: 'A' }).ok, false);
});
test('aggregate: legacy rule still available', () => {
  const a = computeAggregate({ ENG: 'B', KIS: 'B', MATA: 'A', BIO: 'A', CHE: 'A-', PHY: 'B+', GEO: 'C', CRE: 'D' }, 'COMPULSORY_PLUS_BEST_FOUR');
  assert.equal(a.t, 9 + 9 + 12 + 12 + 11 + 10 + 6);
});
test('aggregate: fewer than 7 subjects is refused, not padded', () => {
  const a = computeAggregate({ ENG: 'A', KIS: 'A', MATA: 'A', BIO: 'A', CHE: 'A', PHY: 'A' });
  assert.equal(a.ok, false);
  assert.equal(a.t, 0);
});
test('aggregate: refused when neither English nor Kiswahili is present', () => {
  const a = computeAggregate({ MATA: 'A', BIO: 'A', CHE: 'A', PHY: 'A', GEO: 'A', CRE: 'A', BST: 'A' });
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
