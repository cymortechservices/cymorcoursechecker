import test from 'node:test';
import assert from 'node:assert/strict';
import { checkBody, loginBody, correctionBody, reportIdParam, resultsQuerySchema } from '../src/http/validators';

test('check body accepts a sane payload', () => assert.ok(checkBody.safeParse({ grades: [{ subject: 'ENG', grade: 'B+' }] }).success));
test('unknown keys are rejected', () => assert.equal(checkBody.safeParse({ grades: [{ subject: 'ENG', grade: 'B+' }], isAdmin: true }).success, false));
test('invalid grade rejected', () => assert.equal(checkBody.safeParse({ grades: [{ subject: 'ENG', grade: 'Z' }] }).success, false));
test('more than 12 subjects rejected', () => assert.equal(checkBody.safeParse({ grades: Array.from({ length: 13 }, () => ({ subject: 'ENG', grade: 'A' })) }).success, false));
test('page size is bounded', () => { assert.equal(resultsQuerySchema.safeParse({ pageSize: '100000' }).success, false); assert.equal(resultsQuerySchema.parse({}).sort, 'cutoff'); });
test('report ids must look like unguessable ids', () => { assert.equal(reportIdParam.safeParse({ reportId: '1' }).success, false); assert.ok(reportIdParam.safeParse({ reportId: 'AbCdEfGhIjKlMnOpQrStUv' }).success); });
test('login body normalises email', () => assert.equal(loginBody.parse({ email: ' A@B.COM ', password: 'x' }).email, 'a@b.com'));
test('correction body is a closed union', () => { assert.equal(correctionBody.safeParse({ type: 'drop_database' }).success, false); assert.ok(correctionBody.safeParse({ type: 'map_programme', programmeCode: '1234567', subClusterId: '2A' }).success); });
