import type { Order, OrderStats, PeriodStats } from '../../repositories/types';

const EAT_MS = 3 * 3600_000;
const dayKey = (d: Date) => new Date(d.getTime() + EAT_MS).toISOString().slice(0, 10);

/** Pure statistics over orders (days are East Africa Time). Revenue counts only real money (amount > 0). */
export function computeOrderStats(orders: readonly Pick<Order, 'createdAt' | 'status' | 'amountDue' | 'paidAt' | 'couponCode'>[], now: Date): OrderStats {
  const startOfToday = new Date(`${dayKey(now)}T00:00:00+03:00`).getTime();
  const from = (days: number) => startOfToday - (days - 1) * 86_400_000;
  const period = (fromMs: number): PeriodStats => {
    const reports = orders.filter((o) => o.createdAt.getTime() >= fromMs).length;
    const paidOrders = orders.filter((o) => o.status === 'paid' && (o.paidAt ?? o.createdAt).getTime() >= fromMs);
    return { reports, paid: paidOrders.length, revenue: paidOrders.reduce((s, o) => s + o.amountDue, 0) };
  };

  const paid = orders.filter((o) => o.status === 'paid');
  const daily: OrderStats['daily'] = [];
  for (let i = 13; i >= 0; i--) {
    const dayStart = startOfToday - i * 86_400_000;
    const dayEnd = dayStart + 86_400_000;
    const inDay = (d: Date) => d.getTime() >= dayStart && d.getTime() < dayEnd;
    const paidToday = paid.filter((o) => inDay(o.paidAt ?? o.createdAt));
    daily.push({
      date: dayKey(new Date(dayStart + 1)),
      reports: orders.filter((o) => inDay(o.createdAt)).length,
      paid: paidToday.length,
      revenue: paidToday.reduce((s, o) => s + o.amountDue, 0),
    });
  }

  const couponCounts = new Map<string, number>();
  for (const o of paid) if (o.couponCode) couponCounts.set(o.couponCode, (couponCounts.get(o.couponCode) ?? 0) + 1);

  return {
    reportsGenerated: orders.length,
    paidCount: paid.length,
    pendingCount: orders.filter((o) => o.status === 'pending').length,
    revenue: paid.reduce((s, o) => s + o.amountDue, 0),
    conversionRate: orders.length ? Math.round((paid.length / orders.length) * 1000) / 10 : 0,
    freeUnlocks: paid.filter((o) => o.amountDue === 0).length,
    today: period(startOfToday),
    last7Days: period(from(7)),
    last30Days: period(from(30)),
    daily,
    topCoupons: [...couponCounts].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([code, uses]) => ({ code, uses })),
  };
}
