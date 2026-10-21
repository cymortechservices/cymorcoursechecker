import type { Coupon } from '../../repositories/types';

export const COUPON_CODE = /^[A-Z0-9_-]{3,20}$/;

export function normaliseCouponCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export type CouponCheck = { ok: true; coupon: Coupon } | { ok: false; reason: string };

/** A coupon is usable only when active, not expired and not used up. Uses a generic reason for unknown codes. */
export function checkCoupon(coupon: Coupon | null, now: Date): CouponCheck {
  if (!coupon || !coupon.active) return { ok: false, reason: 'This coupon code is not valid.' };
  if (coupon.expiresAt && coupon.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: 'This coupon has expired.' };
  if (coupon.maxUses !== undefined && coupon.usedCount >= coupon.maxUses) return { ok: false, reason: 'This coupon has already been fully used.' };
  return { ok: true, coupon };
}

/**
 * Whole-shilling price after a percentage discount. M-Pesa cannot charge less than KES 1, so any
 * discount below 100% rounds UP to at least 1; exactly 100% is free.
 */
export function priceAfterDiscount(listPrice: number, percentOff: number): number {
  if (percentOff >= 100) return 0;
  return Math.max(1, Math.round((listPrice * (100 - percentOff)) / 100));
}
