import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRequirementSlot, parseSlotRule } from '../src/modules/requirements/grammar';

test('slot rule: OR of group terms with ordinals', () => {
  const r = parseSlotRule(3, 'A GROUP II or 2nd GROUP III or any GROUP IV');
  assert.equal(r.status, 'parsed');
  assert.deepEqual(r.options.map((o) => (o.kind === 'group' ? `${o.group}${o.ordinal}` : o.code)), ['II1', 'III2', 'IV1']);
});
test('slot rule: maths alternative codes', () => {
  const r = parseSlotRule(1, 'MAT ALTERNATIVE A/B');
  assert.deepEqual(r.options.map((o) => (o.kind === 'subject' ? o.code : '')), ['MATA', 'MATB']);
});
test('requirement: OR list with min grade', () => {
  const r = parseRequirementSlot(2, 'BIO/CHE/PHY - C+');
  assert.equal(r.status, 'parsed');
  assert.equal(r.alternatives.length, 3);
  assert.ok(r.alternatives.every((a) => a.minGrade === 'C+'));
});
test('requirement: (PLAIN) means the base letter', () => {
  const r = parseRequirementSlot(1, 'MAT ALTERNATIVE A/B - C (PLAIN)');
  assert.equal(r.status, 'parsed');
  assert.ok(r.alternatives.every((a) => a.minGrade === 'C'));
});
test('unrecognised text is flagged, never guessed', () => {
  const r = parseRequirementSlot(1, 'MATH C - (PLAIN)');
  assert.equal(r.status, 'unparsed');
  assert.ok(r.reason);
});
test('undefined document token SSE is not silently mapped', () => {
  const r = parseSlotRule(1, 'SSE');
  assert.equal(r.status, 'unparsed');
});
