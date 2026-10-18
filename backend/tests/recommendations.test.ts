import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCandidate } from '../src/modules/eligibility/eligibility.service';
import { recommendChoices } from '../src/modules/recommendations/recommendations.service';
import { GRADES, VIEW, cut, prog } from './helpers/fixtures';

const unis = ['Alpha University', 'Beta University', 'Gamma University', 'Delta University'];
function opts() {
  const list = [
    ...unis.map((u, i) => prog(`M${i}`, 'Bachelor of Science in Medicine', u, 1, '1A', [cut(2024, String(30 + i) + '.000')])),
    ...unis.slice(0, 3).map((u, i) => prog(`N${i}`, 'Bachelor of Science in Nursing', u, 1, '1A', [cut(2024, String(20 + i) + '.000')])),
    prog('L0', 'Bachelor of Laws', 'Alpha University', 1, '1A', [cut(2024, '25.000')]),
    prog('E0', 'Bachelor of Education', 'Beta University', 1, '1A', [cut(2024, '15.000')]),
    prog('E1', 'Bachelor of Arts', 'Beta University', 1, '1A', [cut(2024, '14.000')]),
  ];
  return evaluateCandidate(GRADES as never, list, VIEW).options;
}
test('1A-1C are the same programme at three different universities; 2-4 are other programmes', () => {
  const r = recommendChoices(opts());
  const [a, b, c, d, e, f] = r.rows.map((x) => x.option!);
  assert.equal(new Set([a, b, c].map((o) => o.programmeName)).size, 1);
  assert.equal(new Set([a, b, c].map((o) => o.institutionName)).size, 3);
  assert.equal(new Set([d, e, f].map((o) => o.programmeName)).size, 3);
  assert.ok(![d, e, f].some((o) => o.programmeName === a.programmeName));
});
test('highest-cutoff family with 3+ universities comes first, at its most selective universities', () => {
  const r = recommendChoices(opts());
  assert.match(r.rows[0]!.option!.programmeName, /Medicine/);
  assert.ok(r.rows[0]!.option!.cutoffValue >= r.rows[1]!.option!.cutoffValue);
});
test('stated preference ranks first', () => {
  const r = recommendChoices(opts(), ['Bachelor of Science in Nursing']);
  assert.equal(r.mode, 'preferences');
  assert.match(r.rows[0]!.option!.programmeName, /Nursing/);
});
test('no options -> six empty rows and a note, never invented choices', () => {
  const r = recommendChoices([]);
  assert.equal(r.rows.length, 6);
  assert.ok(r.rows.every((x) => x.option === null));
  assert.ok(r.notes.length > 0);
});
