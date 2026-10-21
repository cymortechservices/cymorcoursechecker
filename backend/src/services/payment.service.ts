/**
 * Payments: price quote (with coupon), M-Pesa STK push, Safaricom callback, status polling with an STK-query
 * fallback (free-tier servers can sleep and miss a callback), and coupon redemption.
 *
 * Money rules: an order is marked paid ONLY by (a) a callback with ResultCode 0 whose amount matches the
 * amount due, (b) an STK query that confirms success, or (c) a 100% coupon. Marking is atomic and happens once.
 */
import crypto from 'node:crypto';
import type { CouponRepository, Order, OrderRepository, StoredReport } from '../repositories/types';
import { MpesaClient, MpesaRequestError, PaymentUnavailableError } from '../modules/payments/mpesa.client';
import { maskPhone, normaliseKenyanPhone } from '../modules/payments/phone';
import { checkCoupon, COUPON_CODE, normaliseCouponCode, priceAfterDiscount } from '../modules/payments/pricing';
import { AppError, badRequest, notFound } from '../utils/errors';

export interface PaymentDeps {
  orders: OrderRepository;
  coupons: CouponRepository;
  mpesa: MpesaClient;
  priceKes: number;
  callbackSecret?: string;
  /** Called (fire and forget) after an order becomes paid. */
  onPaid?: (reportId: string) => Promise<unknown>;
  now?: () => Date;
}

export interface Quote {
  listPrice: number;
  couponCode: string | null;
  percentOff: number;
  amountDue: number;
}

const sha = (v: string) => crypto.createHash('sha256').update(v).digest();

export class PaymentService {
  private lastQuery = new Map<string, number>();
  constructor(private readonly d: PaymentDeps) {}
  private now() {
    return this.d.now ? this.d.now() : new Date();
  }

  get paymentsAvailable(): boolean {
    return this.d.mpesa.configured && Boolean(this.d.callbackSecret);
  }

  async quote(couponCodeRaw?: string): Promise<Quote> {
    const listPrice = this.d.priceKes;
    const raw = couponCodeRaw?.trim();
    if (!raw) return { listPrice, couponCode: null, percentOff: 0, amountDue: listPrice };
    const code = normaliseCouponCode(raw);
    if (!COUPON_CODE.test(code)) throw badRequest('This coupon code is not valid.');
    const check = checkCoupon(await this.d.coupons.get(code), this.now());
    if (!check.ok) throw badRequest(check.reason);
    return { listPrice, couponCode: code, percentOff: check.coupon.percentOff, amountDue: priceAfterDiscount(listPrice, check.coupon.percentOff) };
  }

  private async requireOrder(report: StoredReport): Promise<Order> {
    const order = await this.d.orders.get(report.reportId);
    if (!order) throw notFound('Order not found for this report');
    return order;
  }

  /** Starts payment (STK push), or unlocks immediately for a 100% coupon. */
  async initiate(report: StoredReport, input: { phone?: string; couponCode?: string }) {
    const order = await this.requireOrder(report);
    if (order.status === 'paid') return this.view(order);

    const quote = await this.quote(input.couponCode);
    const base: Partial<Order> = { amountDue: quote.amountDue, couponCode: quote.couponCode ?? undefined, discountPercent: quote.percentOff || undefined };

    if (quote.amountDue === 0) {
      const paid = await this.d.orders.markPaidOnce(order.reportId, { ...base, mpesaReceipt: 'COUPON-100', paidAt: this.now() });
      if (paid) await this.afterPaid(paid);
      return this.view((await this.d.orders.get(order.reportId)) as Order);
    }

    if (!this.paymentsAvailable) throw new AppError(503, 'PAYMENTS_UNAVAILABLE', 'Payments are not available right now. Please try again later or contact support.');
    const phone = input.phone ? normaliseKenyanPhone(input.phone) : null;
    if (!phone) throw badRequest('Enter a valid Safaricom number, for example 0712345678.');

    // Do not spam the customer's phone: one prompt per 45 seconds.
    if (order.status === 'pending' && order.lastStkAt && this.now().getTime() - order.lastStkAt.getTime() < 45_000) {
      return this.view(order, 'A payment prompt was already sent. Check your phone and enter your M-Pesa PIN.');
    }

    try {
      const stk = await this.d.mpesa.stkPush({ phone, amount: quote.amountDue, accountReference: 'CYMOR', description: 'Course report' });
      const updated = await this.d.orders.update(order.reportId, {
        ...base,
        status: 'pending',
        checkoutRequestId: stk.checkoutRequestId,
        merchantRequestId: stk.merchantRequestId,
        phoneMasked: maskPhone(phone),
        lastStkAt: this.now(),
        failureReason: undefined,
      });
      return this.view(updated as Order, stk.customerMessage);
    } catch (e) {
      if (e instanceof PaymentUnavailableError) throw new AppError(503, 'PAYMENTS_UNAVAILABLE', 'Payments are not available right now.');
      if (e instanceof MpesaRequestError) throw new AppError(502, 'MPESA_ERROR', 'M-Pesa could not start the payment. Check the number and try again.');
      throw e;
    }
  }

  /** Safaricom callback. Always acknowledged; only a verified success can mark an order paid. */
  async handleCallback(secret: string, body: unknown): Promise<void> {
    if (!this.d.callbackSecret || !crypto.timingSafeEqual(sha(secret), sha(this.d.callbackSecret))) throw new AppError(404, 'NOT_FOUND', 'Route not found');
    const cb = (body as { Body?: { stkCallback?: Record<string, unknown> } } | null)?.Body?.stkCallback;
    if (!cb || typeof cb.CheckoutRequestID !== 'string') return;
    const order = await this.d.orders.getByCheckoutRequestId(cb.CheckoutRequestID);
    if (!order || order.status === 'paid') return;

    const code = Number(cb.ResultCode);
    if (code !== 0) {
      await this.d.orders.update(order.reportId, { status: code === 1032 ? 'cancelled' : 'failed', failureReason: String(cb.ResultDesc ?? 'Payment not completed').slice(0, 200) });
      return;
    }
    const items = ((cb.CallbackMetadata as { Item?: Array<{ Name: string; Value?: string | number }> } | undefined)?.Item ?? []);
    const get = (n: string) => items.find((i) => i.Name === n)?.Value;
    const amount = Number(get('Amount'));
    if (!Number.isFinite(amount) || amount < order.amountDue) {
      await this.d.orders.update(order.reportId, { status: 'failed', failureReason: 'Amount paid did not match the amount due' });
      return;
    }
    const paid = await this.d.orders.markPaidOnce(order.reportId, { mpesaReceipt: String(get('MpesaReceiptNumber') ?? '').slice(0, 30) || undefined, paidAt: this.now() });
    if (paid) await this.afterPaid(paid);
  }

  /** Status for the browser to poll. Falls back to an STK query when the callback has not arrived. */
  async status(report: StoredReport) {
    let order = await this.requireOrder(report);
    if (order.status === 'pending' && order.checkoutRequestId && this.paymentsAvailable) {
      const last = this.lastQuery.get(order.reportId) ?? 0;
      const age = order.lastStkAt ? this.now().getTime() - order.lastStkAt.getTime() : 0;
      if (age > 15_000 && Date.now() - last > 8_000) {
        this.lastQuery.set(order.reportId, Date.now());
        try {
          const q = await this.d.mpesa.stkQuery(order.checkoutRequestId);
          if (q.state === 'paid') {
            const paid = await this.d.orders.markPaidOnce(order.reportId, { paidAt: this.now() });
            if (paid) await this.afterPaid(paid);
          } else if (q.state === 'failed') {
            await this.d.orders.update(order.reportId, { status: q.code === '1032' ? 'cancelled' : 'failed', failureReason: q.reason.slice(0, 200) });
          }
        } catch {
          /* keep pending; the next poll retries */
        }
        order = (await this.d.orders.get(order.reportId)) as Order;
      }
    }
    return this.view(order);
  }

  private async afterPaid(order: Order): Promise<void> {
    if (order.couponCode) await this.d.coupons.incrementUsed(order.couponCode);
    if (this.d.onPaid) void this.d.onPaid(order.reportId).catch(() => undefined);
  }

  private view(order: Order, message?: string) {
    return {
      status: order.status,
      paid: order.status === 'paid',
      listPrice: order.listPrice,
      amountDue: order.amountDue,
      couponCode: order.couponCode ?? null,
      failureReason: order.status === 'failed' || order.status === 'cancelled' ? order.failureReason ?? null : null,
      message: message ?? null,
    };
  }
}

