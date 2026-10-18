import test from 'node:test';
import assert from 'node:assert/strict';
import { meetsCutoff, selectCutoff } from '../src/modules/eligibility/cutoff';
import { clusterScore } from '../src/modules/scoring/clusterScore.service';
import { cut } from './helpers/fixtures';

test('exact equality is included (r=48,t=84 -> 48.000)', () => assert.equal(meetsCutoff(48, 84, '48.000'), true));
test('one hair above is excluded', () => assert.equal(meetsCutoff(48, 84, '48.001'), false));
test('exact boundary where C is rational: r=36,t=63 -> 36', () => {
  assert.equal(meetsCutoff(36, 63, '36'), true);
  assert.equal(meetsCutoff(36, 63, '36.000'), true);
  assert.equal(meetsCutoff(36, 63, '36.0001'), false);
});
test('agrees with floating point away from boundaries across the whole input space', () => {
  let checked = 0;
  for (let r = 4; r <= 48; r += 1) for (let t = 7; t <= 84; t += 7) {
    const s = clusterScore(r, t);
    for (const delta of [-0.5, 0.5]) {
      const raw = (s + delta).toFixed(3);
      assert.equal(meetsCutoff(r, t, raw), s >= Number(raw), `r=${r} t=${t} cutoff=${raw}`);
      checked++;
    }
  }
  assert.ok(checked > 500);
});
test('invalid cutoff text throws instead of passing', () => {
  assert.throws(() => meetsCutoff(40, 70, 'abc'));
  assert.throws(() => meetsCutoff(40, 70, ''));
  assert.throws(() => meetsCutoff(40, 70, '-'));
});
test('policy latest-specific prefers newest NON-shared value', () => {
  const h = [cut(2018, '30.000'), cut(2019, '31.000'), cut(2022, '16.791', true), cut(2023, '16.791', true)];
  assert.equal(selectCutoff(h, { type: 'latest-specific' })?.year, 2019);
  assert.equal(selectCutoff(h, { type: 'latest-available' })?.year, 2023);
});
test('policy latest-specific falls back to shared value, which stays flagged', () => {
  const h = [cut(2022, '16.791', true)];
  const c = selectCutoff(h, { type: 'latest-specific' });
  assert.equal(c?.shared, true);
});
test('policy fixed-year returns null when that year is missing (never zero)', () => {
  assert.equal(selectCutoff([cut(2019, '30')], { type: 'fixed-year', year: 2024 }), null);
  assert.equal(selectCutoff([], { type: 'latest-specific' }), null);
});
test('minYear filters out older observations', () => {
  assert.equal(selectCutoff([cut(2018, '30')], { type: 'latest-available', minYear: 2020 }), null);
});
