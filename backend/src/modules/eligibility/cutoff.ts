/**
 * Exact cutoff handling.
 *
 * Cutoffs are stored as the printed decimal string. Comparison avoids floating point
 * entirely: with C = 48*sqrt(r*t/4032) and cutoff k/10^d (d decimals),
 *
 *     C >= cutoff   <=>   r * t * 2304 * 10^(2d)  >=  k^2 * 4032
 *
 * evaluated with BigInt. This keeps "score exactly equals cutoff" inclusive and makes the
 * result independent of rounding.
 */
import { FORMULA_MAX_R, FORMULA_MAX_T } from '../scoring/clusterScore.service';
import type { CutoffObservation } from '../shared/types';

/**
 *  latest-specific  (DEFAULT): newest year whose value is specific to the programme/university,
 *                    i.e. not a value shared by many records. If a programme has only shared
 *                    values, the newest shared value is used and labelled as such.
 *  latest-available: newest printed value of any kind (shared values included).
 *  fixed-year:       only the given year.
 */
export type CutoffPolicy =
  | { type: 'latest-specific'; minYear?: number }
  | { type: 'latest-available'; /** Ignore observations older than this year (optional). */ minYear?: number }
  | { type: 'fixed-year'; year: number };

export const DEFAULT_CUTOFF_POLICY: CutoffPolicy = { type: 'latest-specific' };

export function describePolicy(policy: CutoffPolicy): string {
  if (policy.type === 'fixed-year') return `fixed-year-${policy.year}`;
  const base = policy.type === 'latest-specific' ? 'latest-specific-verified' : 'latest-available-verified';
  return policy.minYear ? `${base}-from-${policy.minYear}` : base;
}

export function selectCutoff(history: readonly CutoffObservation[], policy: CutoffPolicy): CutoffObservation | null {
  if (history.length === 0) return null;
  if (policy.type === 'fixed-year') return history.find((h) => h.year === policy.year) ?? null;
  const eligible = policy.minYear ? history.filter((h) => h.year >= (policy.minYear as number)) : history;
  const newestFirst = [...eligible].sort((a, b) => b.year - a.year);
  if (policy.type === 'latest-specific') return newestFirst.find((h) => !h.shared) ?? newestFirst[0] ?? null;
  return newestFirst[0] ?? null;
}

const DECIMAL = /^(\d+)(?:\.(\d+))?$/;

/** r, t are integers; cutoffRaw is the printed decimal string. */
export function meetsCutoff(r: number, t: number, cutoffRaw: string): boolean {
  const m = DECIMAL.exec(cutoffRaw.trim());
  if (!m) throw new RangeError(`Invalid cutoff value "${cutoffRaw}"`);
  if (!Number.isInteger(r) || !Number.isInteger(t)) throw new RangeError('r and t must be integers');
  const frac = m[2] ?? '';
  const d = frac.length;
  const k = BigInt(`${m[1]}${frac}`);
  // C^2 = 48^2 * r*t/(R*T)  with R*T = 48*84 = 4032 ; 48^2 = 2304
  const lhs = BigInt(r) * BigInt(t) * 2304n * 10n ** BigInt(2 * d);
  const rhs = k * k * BigInt(FORMULA_MAX_R * FORMULA_MAX_T);
  return lhs >= rhs;
}
