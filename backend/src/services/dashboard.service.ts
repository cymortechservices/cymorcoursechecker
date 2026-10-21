/** Admin dashboard use cases: revenue/report statistics, order listing, coupons, email resend. */
import type { AdminPrincipal } from './admin.service';
import type { Coupon, CouponRepository, DatasetRepository, Order, OrderListFilter, OrderRepository } from '../repositories/types';
import type { ReportEmailService } from './reportEmail.service';
import { COUPON_CODE, normaliseCouponCode } from '../modules/payments/pricing';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors';

export interface NewCoupon {
  code: string;
  percentOff: number;
  maxUses?: number;
  expiresAt?: Date;
  note?: string;
}

export interface DashboardDeps {
  orders: OrderRepository;
  coupons: CouponRepository;
  datasets: Pick<DatasetRepository, 'audit'>;
  emails: Pick<ReportEmailService, 'deliver'>;
  now?: () => Date;
}

export function toOrderRow(o: Order) {
  return {
    reportId: o.reportId,
    createdAt: o.createdAt,
    email: o.email,
    candidateName: o.candidateName ?? null,
    qualifyingCount: o.qualifyingCount,
    status: o.status,
    listPrice: o.listPrice,
    amountDue: o.amountDue,
    couponCode: o.couponCode ?? null,
    discountPercent: o.discountPercent ?? null,
    phone: o.phoneMasked ?? null,
    mpesaReceipt: o.mpesaReceipt ?? null,
    paidAt: o.paidAt ?? null,
    emailStatus: o.emailStatus,
  };
}

const csvCell = (v: unknown) => {
  let s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v);
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

export class DashboardService {
  constructor(private readonly d: DashboardDeps) {}
  private now() {
    return this.d.now ? this.d.now() : new Date();
  }

  stats() {
    return this.d.orders.stats(this.now());
  }

  async listOrders(filter: OrderListFilter) {
    const r = await this.d.orders.list(filter);
    return { total: r.total, items: r.items.map(toOrderRow) };
  }

  async ordersCsv(): Promise<string> {
    const all = await this.d.orders.list({ limit: 5000, skip: 0 });
    const head = ['reportId', 'createdAt', 'email', 'name', 'qualifying', 'status', 'listPriceKES', 'amountKES', 'coupon', 'discountPercent', 'phone', 'mpesaReceipt', 'paidAt', 'emailStatus'];
    const rows = all.items.map((o) => {
      const r = toOrderRow(o);
      return [r.reportId, r.createdAt, r.email, r.candidateName, r.qualifyingCount, r.status, r.listPrice, r.amountDue, r.couponCode, r.discountPercent, r.phone, r.mpesaReceipt, r.paidAt, r.emailStatus].map(csvCell).join(',');
    });
    return [head.map(csvCell).join(','), ...rows].join('\n');
  }

  listCoupons() {
    return this.d.coupons.list();
  }

  async createCoupon(actor: AdminPrincipal, input: NewCoupon): Promise<Coupon> {
    if (actor.role !== 'admin') throw forbidden('Administrator role required');
    const code = normaliseCouponCode(input.code);
    if (!COUPON_CODE.test(code)) throw badRequest('Coupon codes use 3-20 letters, numbers, - or _.');
    if (!Number.isInteger(input.percentOff) || input.percentOff < 1 || input.percentOff > 100) throw badRequest('Discount must be a whole number from 1 to 100.');
    if (input.expiresAt && input.expiresAt.getTime() <= this.now().getTime()) throw badRequest('The expiry date must be in the future.');
    if (await this.d.coupons.get(code)) throw conflict('A coupon with this code already exists.');
    const coupon: Coupon = { code, percentOff: input.percentOff, active: true, maxUses: input.maxUses, expiresAt: input.expiresAt, usedCount: 0, note: input.note?.trim() || undefined, createdAt: this.now(), createdBy: actor.email };
    await this.d.coupons.create(coupon);
    await this.d.datasets.audit({ at: this.now(), actor: actor.email, action: 'coupon_created', details: { code, percentOff: coupon.percentOff, maxUses: coupon.maxUses ?? null } });
    return coupon;
  }

  async setCouponActive(actor: AdminPrincipal, codeRaw: string, active: boolean): Promise<Coupon> {
    if (actor.role !== 'admin') throw forbidden('Administrator role required');
    const c = await this.d.coupons.setActive(normaliseCouponCode(codeRaw), active);
    if (!c) throw notFound('Coupon not found');
    await this.d.datasets.audit({ at: this.now(), actor: actor.email, action: 'coupon_updated', details: { code: c.code, active } });
    return c;
  }

  async resendEmail(actor: AdminPrincipal, reportId: string) {
    if (actor.role !== 'admin') throw forbidden('Administrator role required');
    const o = await this.d.orders.get(reportId);
    if (!o) throw notFound('Order not found');
    if (o.status !== 'paid') throw conflict('Only paid reports can be emailed.');
    return { result: await this.d.emails.deliver(reportId) };
  }
}
