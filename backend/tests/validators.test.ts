import test from 'node:test';
import assert from 'node:assert/strict';
import { checkBody, couponBody, payBody, loginBody, correctionBody, reportIdParam, resultsQuerySchema } from '../src/http/validators';

test('check body accepts a sane payload', () => assert.ok(checkBody.safeParse({ email: 'a@b.co', grades: [{ subject: 'ENG', grade: 'B+' }] }).success));
test('email is required and must be valid', () => {
  const g = [{ subject: 'ENG', grade: 'B+' }];
  assert.equal(checkBody.safeParse({ grades: g }).success, false);
  assert.equal(checkBody.safeParse({ email: 'not-an-email', grades: g }).success, false);
  assert.equal(checkBody.parse({ email: ' A@B.CO ', grades: g }).email, 'a@b.co');
});
test('coupon body: percent 1-100 integers only; pay body rejects unknown keys', () => {
  assert.ok(couponBody.safeParse({ code: 'SAVE20', percentOff: 20 }).success);
  for (const p of [0, 101, 12.5]) assert.equal(couponBody.safeParse({ code: 'SAVE20', percentOff: p }).success, false);
  assert.equal(payBody.safeParse({ phone: '0712345678', amount: 1 }).success, false);
});
test('unknown keys are rejected', () => assert.equal(checkBody.safeParse({ email: 'a@b.co', grades: [{ subject: 'ENG', grade: 'B+' }], isAdmin: true }).success, false));
test('invalid grade rejected', () => assert.equal(checkBody.safeParse({ email: 'a@b.co', grades: [{ subject: 'ENG', grade: 'Z' }] }).success, false));
test('more than 12 subjects rejected', () => assert.equal(checkBody.safeParse({ email: 'a@b.co', grades: Array.from({ length: 13 }, () => ({ subject: 'ENG', grade: 'A' })) }).success, false));
test('page size is bounded', () => { assert.equal(resultsQuerySchema.safeParse({ pageSize: '100000' }).success, false); assert.equal(resultsQuerySchema.parse({}).sort, 'cutoff'); });
test('report ids must look like unguessable ids', () => { assert.equal(reportIdParam.safeParse({ reportId: '1' }).success, false); assert.ok(reportIdParam.safeParse({ reportId: 'AbCdEfGhIjKlMnOpQrStUv' }).success); });
test('login body normalises email', () => assert.equal(loginBody.parse({ email: ' A@B.COM ', password: 'x' }).email, 'a@b.com'));
test('correction body is a closed union', () => { assert.equal(correctionBody.safeParse({ type: 'drop_database' }).success, false); assert.ok(correctionBody.safeParse({ type: 'map_programme', programmeCode: '1234567', subClusterId: '2A' }).success); });
