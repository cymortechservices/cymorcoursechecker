import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryCouponRepository, MemoryDatasetRepository, MemoryOrderRepository } from './helpers/memoryRepo';
import { PaymentService } from '../src/services/payment.service';
import { DashboardService } from '../src/services/dashboard.service';
import { ReportEmailService } from '../src/services/reportEmail.service';
import { buildReportEmail, type EmailMessage, type EmailSender } from '../src/services/email.service';
import { DarajaClient, darajaPassword, darajaTimestamp, DisabledMpesaClient, type MpesaClient, type StkQueryResult } from '../src/modules/payments/mpesa.client';
import { maskPhone, normaliseKenyanPhone } from '../src/modules/payments/phone';
import { checkCoupon, priceAfterDiscount } from '../src/modules/payments/pricing';
import { computeOrderStats } from '../src/modules/payments/stats';
import type { Order, StoredReport } from '../src/repositories/types';

const SECRET = 's'.repeat(32);
const T0 = new Date('2026-10-21T10:00:00Z');

class FakeMpesa implements MpesaClient {
  configured = true;
  pushes: Array<{ phone: string; amount: number }> = [];
  query: StkQueryResult = { state: 'pending' };
  fail = false;
  async stkPush(i: { phone: string; amount: number }) {
    if (this.fail) throw new (await import('../src/modules/payments/mpesa.client')).MpesaRequestError('boom');
    this.pushes.push({ phone: i.phone, amount: i.amount });
    return { checkoutRequestId: `ws_CO_${this.pushes.length}`, merchantRequestId: 'm1', customerMessage: 'Check your phone' };
  }
  async stkQuery() { return this.query; }
}

function order(id = 'r'.repeat(22), over: Partial<Order> = {}): Order {
  return { reportId: id, createdAt: T0, email: 'a@b.co', datasetVersion: 'v1', qualifyingCount: 3, status: 'unpaid', listPrice: 149, amountDue: 149, emailStatus: 'none', ...over };
}
const reportOf = (id: string) => ({ reportId: id }) as StoredReport;

async function setup(over: { mpesa?: MpesaClient; secret?: string | undefined } = {}) {
  const orders = new MemoryOrderRepository();
  const coupons = new MemoryCouponRepository();
  const mpesa = (over.mpesa ?? new FakeMpesa()) as FakeMpesa;
  const paidHook: string[] = [];
  let clock = T0;
  const payments = new PaymentService({ orders, coupons, mpesa, priceKes: 149, callbackSecret: 'secret' in over ? over.secret : SECRET, onPaid: async (id) => void paidHook.push(id), now: () => clock });
  const o = order();
  await orders.create(o);
  return { orders, coupons, mpesa, payments, o, paidHook, advance: (ms: number) => { clock = new Date(clock.getTime() + ms); } };
}
const cb = (checkoutId: string, code: number, amount = 149) => ({ Body: { stkCallback: { CheckoutRequestID: checkoutId, ResultCode: code, ResultDesc: code === 0 ? 'ok' : 'Request cancelled by user', ...(code === 0 ? { CallbackMetadata: { Item: [{ Name: 'Amount', Value: amount }, { Name: 'MpesaReceiptNumber', Value: 'RKT123ABC' }] } } : {}) } } });

test('phone normalisation accepts Kenyan formats and rejects junk', () => {
  for (const v of ['0712345678', '+254712345678', '254712345678', '712345678', '0112345678', '0712 345 678']) assert.match(normaliseKenyanPhone(v) ?? '', /^254[17]\d{8}$/, v);
  for (const v of ['', '12345', '0212345678', '+1555123456', '07123456789', 'abc']) assert.equal(normaliseKenyanPhone(v), null, v);
  assert.equal(maskPhone('254712345678'), '2547******78');
});

test('price after discount: rounding, minimum KES 1, 100% is free', () => {
  assert.equal(priceAfterDiscount(149, 10), 134);
  assert.equal(priceAfterDiscount(149, 50), 75);
  assert.equal(priceAfterDiscount(149, 99), 1);
  assert.equal(priceAfterDiscount(149, 100), 0);
});

test('coupon validity: inactive, expired, used-up and unknown are refused', () => {
  const base = { code: 'X', percentOff: 10, active: true, usedCount: 0, createdAt: T0, createdBy: 'a' };
  assert.equal(checkCoupon(base, T0).ok, true);
  assert.equal(checkCoupon(null, T0).ok, false);
  assert.equal(checkCoupon({ ...base, active: false }, T0).ok, false);
  assert.equal(checkCoupon({ ...base, expiresAt: new Date(T0.getTime() - 1) }, T0).ok, false);
  assert.equal(checkCoupon({ ...base, maxUses: 2, usedCount: 2 }, T0).ok, false);
});

test('Daraja password and EAT timestamp', () => {
  assert.equal(darajaTimestamp(new Date('2026-10-21T10:00:05Z')), '20261021130005'); // UTC+3
  assert.equal(darajaPassword('174379', 'pk', '20261021130005'), Buffer.from('174379pk20261021130005').toString('base64'));
});

test('DarajaClient sends the expected STK request (fake fetch)', async () => {
  const calls: Array<{ url: string; body?: Record<string, unknown> }> = [];
  const fakeFetch = (async (url: string, init?: { body?: string }) => {
    calls.push({ url, body: init?.body ? JSON.parse(init.body) : undefined });
    const json = url.includes('oauth') ? { access_token: 'tok', expires_in: '3599' } : { ResponseCode: '0', CheckoutRequestID: 'ws_1', MerchantRequestID: 'm', CustomerMessage: 'ok' };
    return { ok: true, status: 200, json: async () => json };
  }) as unknown as typeof fetch;
  const c = new DarajaClient({ env: 'sandbox', consumerKey: 'k', consumerSecret: 's', shortcode: '174379', passkey: 'pk', transactionType: 'CustomerPayBillOnline', partyB: '174379', callbackUrl: 'https://api.test/cb' }, fakeFetch);
  const r = await c.stkPush({ phone: '254712345678', amount: 149, accountReference: 'CYMOR', description: 'Course report' });
  assert.equal(r.checkoutRequestId, 'ws_1');
  const push = calls.find((x) => x.url.includes('stkpush'));
  assert.ok(push?.url.startsWith('https://sandbox.safaricom.co.ke'));
  assert.equal(push?.body?.Amount, 149);
  assert.equal(push?.body?.PartyA, '254712345678');
  assert.equal(push?.body?.CallBackURL, 'https://api.test/cb');
});

test('initiate: sends STK push, stores masked phone and pending state', async () => {
  const { payments, orders, mpesa, o } = await setup();
  const v = await payments.initiate(reportOf(o.reportId), { phone: '0712345678' });
  assert.equal(v.status, 'pending');
  assert.deepEqual((mpesa as FakeMpesa).pushes, [{ phone: '254712345678', amount: 149 }]);
  const stored = await orders.get(o.reportId);
  assert.equal(stored?.phoneMasked, '2547******78');
  assert.ok(!JSON.stringify(stored).includes('254712345678'));
});

test('initiate rejects a bad phone and does not push', async () => {
  const { payments, mpesa, o } = await setup();
  await assert.rejects(payments.initiate(reportOf(o.reportId), { phone: '123' }), /valid Safaricom/);
  assert.equal((mpesa as FakeMpesa).pushes.length, 0);
});

test('initiate is rate-limited per order (no prompt spam within 45s)', async () => {
  const { payments, mpesa, o, advance } = await setup();
  await payments.initiate(reportOf(o.reportId), { phone: '0712345678' });
  await payments.initiate(reportOf(o.reportId), { phone: '0712345678' });
  assert.equal((mpesa as FakeMpesa).pushes.length, 1);
  advance(60_000);
  await payments.initiate(reportOf(o.reportId), { phone: '0712345678' });
  assert.equal((mpesa as FakeMpesa).pushes.length, 2);
});

test('payments unavailable when M-Pesa is not configured (never silently free)', async () => {
  const { payments, o, orders } = await setup({ mpesa: new DisabledMpesaClient() });
  await assert.rejects(payments.initiate(reportOf(o.reportId), { phone: '0712345678' }), (e: { status?: number }) => e.status === 503);
  assert.equal((await orders.get(o.reportId))?.status, 'unpaid');
});

test('callback: wrong secret is refused; success marks paid once, records receipt, fires onPaid once', async () => {
  const { payments, orders, o, paidHook } = await setup();
  await payments.initiate(reportOf(o.reportId), { phone: '0712345678' });
  await assert.rejects(payments.handleCallback('x'.repeat(32), cb('ws_CO_1', 0)), /not found/i);
  assert.equal((await orders.get(o.reportId))?.status, 'pending');
  await payments.handleCallback(SECRET, cb('ws_CO_1', 0));
  await payments.handleCallback(SECRET, cb('ws_CO_1', 0)); // Safaricom retries
  const s = await orders.get(o.reportId);
  assert.equal(s?.status, 'paid');
  assert.equal(s?.mpesaReceipt, 'RKT123ABC');
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(paidHook, [o.reportId]);
});

test('callback: cancelled, failed and underpaid never unlock', async () => {
  const a = await setup();
  await a.payments.initiate(reportOf(a.o.reportId), { phone: '0712345678' });
  await a.payments.handleCallback(SECRET, cb('ws_CO_1', 1032));
  assert.equal((await a.orders.get(a.o.reportId))?.status, 'cancelled');
  const b = await setup();
  await b.payments.initiate(reportOf(b.o.reportId), { phone: '0712345678' });
  await b.payments.handleCallback(SECRET, cb('ws_CO_1', 0, 10)); // paid KES 10 instead of 149
  assert.equal((await b.orders.get(b.o.reportId))?.status, 'failed');
});

test('callback for an unknown checkout id or malformed body is ignored', async () => {
  const { payments } = await setup();
  await payments.handleCallback(SECRET, cb('nope', 0));
  await payments.handleCallback(SECRET, { garbage: true });
  await payments.handleCallback(SECRET, null);
});

test('status falls back to an STK query when the callback never arrives', async () => {
  const { payments, mpesa, o, advance, orders } = await setup();
  await payments.initiate(reportOf(o.reportId), { phone: '0712345678' });
  assert.equal((await payments.status(reportOf(o.reportId))).status, 'pending'); // too early to query
  advance(20_000);
  (mpesa as FakeMpesa).query = { state: 'paid' };
  assert.equal((await payments.status(reportOf(o.reportId))).paid, true);
  assert.equal((await orders.get(o.reportId))?.status, 'paid');
});

test('coupons: percentage applies to the amount pushed; usage is counted only when paid', async () => {
  const { payments, coupons, mpesa, o, orders } = await setup();
  await coupons.create({ code: 'SAVE20', percentOff: 20, active: true, usedCount: 0, maxUses: 5, createdAt: T0, createdBy: 'a' });
  const q = await payments.quote('save20');
  assert.deepEqual([q.couponCode, q.percentOff, q.amountDue], ['SAVE20', 20, 119]);
  await payments.initiate(reportOf(o.reportId), { phone: '0712345678', couponCode: 'save20' });
  assert.equal((mpesa as FakeMpesa).pushes[0]?.amount, 119);
  assert.equal((await coupons.get('SAVE20'))?.usedCount, 0);
  await payments.handleCallback(SECRET, cb('ws_CO_1', 0, 119));
  assert.equal((await coupons.get('SAVE20'))?.usedCount, 1);
  assert.equal((await orders.get(o.reportId))?.discountPercent, 20);
  await assert.rejects(payments.quote('NOPE'), /not valid/);
});

test('100% coupon unlocks immediately without M-Pesa and counts as a free unlock', async () => {
  const { payments, coupons, o, orders, mpesa } = await setup({ mpesa: new DisabledMpesaClient() });
  await coupons.create({ code: 'FREE100', percentOff: 100, active: true, usedCount: 0, createdAt: T0, createdBy: 'a' });
  const v = await payments.initiate(reportOf(o.reportId), { couponCode: 'FREE100' });
  assert.equal(v.paid, true);
  assert.equal((await orders.get(o.reportId))?.mpesaReceipt, 'COUPON-100');
  assert.equal((await coupons.get('FREE100'))?.usedCount, 1);
  void mpesa;
});

test('stats: revenue counts only paid orders; conversion and coupons', () => {
  const mk = (status: Order['status'], amountDue: number, couponCode?: string, daysAgo = 0): Order => order(`id${Math.random()}`.padEnd(22, 'x'), { status, amountDue, couponCode, createdAt: new Date(T0.getTime() - daysAgo * 86_400_000), paidAt: status === 'paid' ? new Date(T0.getTime() - daysAgo * 86_400_000) : undefined });
  const s = computeOrderStats([mk('paid', 149), mk('paid', 119, 'SAVE20'), mk('paid', 0, 'FREE100', 2), mk('unpaid', 149), mk('pending', 149), mk('failed', 149, undefined, 40)], T0);
  assert.equal(s.reportsGenerated, 6);
  assert.equal(s.paidCount, 3);
  assert.equal(s.revenue, 268);
  assert.equal(s.freeUnlocks, 1);
  assert.equal(s.pendingCount, 1);
  assert.equal(s.today.revenue, 268 - 0);
  assert.equal(s.daily.length, 14);
  assert.ok(s.topCoupons.some((c) => c.code === 'SAVE20'));
});

test('dashboard: only admins create coupons; validation; duplicate refused; CSV neutralises formulas', async () => {
  const orders = new MemoryOrderRepository();
  const coupons = new MemoryCouponRepository();
  const datasets = new MemoryDatasetRepository();
  const dash = new DashboardService({ orders, coupons, datasets, emails: { deliver: async () => 'sent' }, now: () => T0 });
  const admin = { email: 'a@x.test', role: 'admin' as const };
  await assert.rejects(dash.createCoupon({ email: 'r@x.test', role: 'reviewer' }, { code: 'ABC', percentOff: 10 }), /Administrator/);
  await assert.rejects(dash.createCoupon(admin, { code: 'a b', percentOff: 10 }), /Coupon codes/);
  await assert.rejects(dash.createCoupon(admin, { code: 'ABC', percentOff: 0 }), /1 to 100/);
  await assert.rejects(dash.createCoupon(admin, { code: 'ABC', percentOff: 101 }), /1 to 100/);
  await assert.rejects(dash.createCoupon(admin, { code: 'ABC', percentOff: 10, expiresAt: new Date(T0.getTime() - 1000) }), /future/);
  const c = await dash.createCoupon(admin, { code: ' abc ', percentOff: 10 });
  assert.equal(c.code, 'ABC');
  await assert.rejects(dash.createCoupon(admin, { code: 'ABC', percentOff: 20 }), /already exists/);
  assert.ok(datasets.auditLog.some((a) => a.action === 'coupon_created'));
  await assert.rejects(dash.setCouponActive({ email: 'r@x.test', role: 'reviewer' }, 'ABC', false), /Administrator/);
  assert.equal((await dash.setCouponActive(admin, 'abc', false)).active, false);

  await orders.create(order('c'.repeat(22), { email: '=HYPERLINK("http://evil")@x.co', status: 'paid', paidAt: T0 }));
  const csv = await dash.ordersCsv();
  assert.ok(csv.includes(`"'=HYPERLINK`));
  assert.ok(!csv.includes('2547')); // no full phone numbers
});

test('dashboard resend: only for paid orders and admins', async () => {
  const orders = new MemoryOrderRepository();
  const dash = new DashboardService({ orders, coupons: new MemoryCouponRepository(), datasets: new MemoryDatasetRepository(), emails: { deliver: async () => 'sent' }, now: () => T0 });
  await orders.create(order('d'.repeat(22)));
  const admin = { email: 'a@x.test', role: 'admin' as const };
  await assert.rejects(dash.resendEmail(admin, 'd'.repeat(22)), /paid/);
  await assert.rejects(dash.resendEmail({ email: 'r@x.test', role: 'reviewer' }, 'd'.repeat(22)), /Administrator/);
  await orders.markPaidOnce('d'.repeat(22), {});
  assert.deepEqual(await dash.resendEmail(admin, 'd'.repeat(22)), { result: 'sent' });
});

test('report email: sent with PDF attachment, failed on sender error, skipped when disabled', async () => {
  const sentMsgs: EmailMessage[] = [];
  const mkSender = (enabled: boolean, fail = false): EmailSender => ({ enabled, send: async (m) => { if (fail) throw new Error('x'); sentMsgs.push(m); } });
  const checker = { renderPdfForPaidReport: async () => ({ bytes: new Uint8Array([37, 80, 68, 70]), filename: 'r.pdf', qualifyingCount: 4 }) };
  const run = async (sender: EmailSender) => {
    const orders = new MemoryOrderRepository();
    await orders.create(order('e'.repeat(22), { email: 'kid@x.co', status: 'paid' }));
    const svc = new ReportEmailService({ orders, checker, sender, siteName: 'CYMOR', supportEmail: 'simion@karimique.com', supportWhatsapp: '0113821327' });
    return { result: await svc.deliver('e'.repeat(22)), status: (await orders.get('e'.repeat(22)))?.emailStatus };
  };
  assert.deepEqual(await run(mkSender(true)), { result: 'sent', status: 'sent' });
  assert.equal(sentMsgs[0]?.to, 'kid@x.co');
  assert.equal(sentMsgs[0]?.attachments?.[0]?.filename, 'r.pdf');
  assert.deepEqual(await run(mkSender(true, true)), { result: 'failed', status: 'failed' });
  assert.deepEqual(await run(mkSender(false)), { result: 'skipped', status: 'skipped' });
});

test('report email body is signed by Legendary Smiley Cymor and shows support contacts', () => {
  const m = buildReportEmail({ siteName: 'CYMOR', candidateName: 'Amina <b>', supportEmail: 'simion@karimique.com', supportWhatsapp: '0113821327', qualifyingCount: 12 });
  assert.match(m.text, /Legendary Smiley Cymor/);
  assert.match(m.text, /simion@karimique\.com/);
  assert.match(m.html, /wa\.me\/254113821327/);
  assert.ok(!m.html.includes('<b>')); // name is escaped
});
