/**
 * Deterministic KUCCPS application-choice suggestions (1A, 1B, 1C, 2, 3, 4).
 *
 * Only options from the verified qualifying results are ever used. Nothing is invented:
 * if three universities for one programme are not available the rows are left empty and the
 * limitation is stated.
 *
 * METHOD (documented in docs/ARCHITECTURE.md and printed in the PDF report)
 *  1. Group qualifying options into programme "families" (same normalised programme name).
 *  2. Rank families by:
 *       a. the candidate's stated preference order (when preferences were supplied);
 *       b. families offered by at least three qualifying universities first (needed for 1A-1C);
 *       c. data quality: university-specific cutoffs from the newest year first, shared generic floor values last;
 *       d. competitiveness: higher median cutoff first (the most selective programme the
 *          candidate still qualifies for);
 *       e. programme name (alphabetical) as the final deterministic tie-break.
 *  3. Choices 1A/1B/1C = the top family at its three most selective qualifying universities.
 *  4. Choices 2, 3, 4 = the next three families, each at its most selective qualifying university.
 * Without stated preferences the result is labelled "suggested", never "preferred".
 */
import { key2 } from '../import/nameMatch';
import type { QualifyingOption } from '../eligibility/eligibility.service';

export type ChoiceLabel = '1A' | '1B' | '1C' | '2' | '3' | '4';
export const CHOICE_LABELS: readonly ChoiceLabel[] = ['1A', '1B', '1C', '2', '3', '4'];

export interface ChoiceRow {
  choice: ChoiceLabel;
  option: QualifyingOption | null;
}

export interface Recommendation {
  mode: 'preferences' | 'suggested';
  rows: ChoiceRow[];
  notes: string[];
  method: string;
}

export const RECOMMENDATION_METHOD =
  'Qualifying options are grouped by programme; programmes are ranked by your stated preference order (if any), then by availability at three or more universities, then by data quality (university-specific, recent cutoffs first), then by cutoff (most selective first). 1A-1C are the same programme at three universities (names that differ only by connector words such as "in" or "of" are treated as the same programme); 2-4 are the next ranked programmes.';

interface Family {
  key: string;
  name: string;
  options: QualifyingOption[]; // sorted by cutoff desc
  prefIndex: number;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}

function matchesPreference(familyKey: string, pref: string): boolean {
  const pk = key2(pref);
  if (!pk) return false;
  if (pk === familyKey) return true;
  const ft = new Set(familyKey.split(' '));
  return pk.split(' ').every((t) => ft.has(t));
}

export function recommendChoices(options: readonly QualifyingOption[], preferences: readonly string[] = []): Recommendation {
  const prefs = preferences.map((p) => p.trim()).filter(Boolean);
  const mode: Recommendation['mode'] = prefs.length > 0 ? 'preferences' : 'suggested';
  const notes: string[] = [];
  if (options.length === 0) {
    return { mode, rows: CHOICE_LABELS.map((choice) => ({ choice, option: null })), notes: ['No qualifying options, so no application choices can be suggested.'], method: RECOMMENDATION_METHOD };
  }
  const newestYear = Math.max(...options.map((o) => o.cutoffYear));

  const map = new Map<string, Family>();
  for (const o of options) {
    const k = key2(o.programmeName);
    let f = map.get(k);
    if (!f) {
      f = { key: k, name: o.programmeName, options: [], prefIndex: Number.POSITIVE_INFINITY };
      map.set(k, f);
    }
    f.options.push(o);
  }
  for (const f of map.values()) {
    f.options.sort((a, b) => b.cutoffValue - a.cutoffValue || a.institutionName.localeCompare(b.institutionName) || a.programmeCode.localeCompare(b.programmeCode));
    const idx = prefs.findIndex((p) => matchesPreference(f.key, p));
    if (idx >= 0) f.prefIndex = idx;
  }
  const unmatchedPrefs = prefs.filter((p) => ![...map.values()].some((f) => matchesPreference(f.key, p)));
  if (unmatchedPrefs.length) notes.push(`Not among your qualifying options and therefore not recommended: ${unmatchedPrefs.join('; ')}.`);

  const families = [...map.values()].sort((a, b) => {
    if (a.prefIndex !== b.prefIndex) return a.prefIndex - b.prefIndex;
    const a3 = a.options.length >= 3 ? 0 : 1;
    const b3 = b.options.length >= 3 ? 0 : 1;
    if (a3 !== b3) return a3 - b3;
    const q = (f: Family) => (f.options.slice(0, 3).some((o) => o.cutoffIsShared) ? 2 : f.options.slice(0, 3).every((o) => o.cutoffYear === newestYear) ? 0 : 1);
    const aq = q(a);
    const bq = q(b);
    if (aq !== bq) return aq - bq;
    const am = median(a.options.map((o) => o.cutoffValue));
    const bm = median(b.options.map((o) => o.cutoffValue));
    if (am !== bm) return bm - am;
    return a.name.localeCompare(b.name);
  });

  const rows: ChoiceRow[] = [];
  const first = families[0] as Family;
  const firstThree = first.options.slice(0, 3);
  CHOICE_LABELS.slice(0, 3).forEach((choice, i) => rows.push({ choice, option: firstThree[i] ?? null }));
  if (firstThree.length < 3) {
    notes.push(`Only ${firstThree.length} qualifying university option(s) exist for "${first.name}", so choices ${CHOICE_LABELS.slice(firstThree.length, 3).join(', ')} are left empty rather than inventing options.`);
  }
  const rest = families.slice(1, 4);
  (['2', '3', '4'] as const).forEach((choice, i) => rows.push({ choice, option: rest[i]?.options[0] ?? null }));
  const missing = rows.filter((r) => r.option === null && ['2', '3', '4'].includes(r.choice)).length;
  if (missing > 0) notes.push(`Only ${families.length} distinct qualifying programme(s) were found, so ${missing} later choice(s) are empty.`);
  if (mode === 'suggested') notes.push('You did not state programme preferences, so these are suggested choices, not your preferred order.');
  return { mode, rows, notes, method: RECOMMENDATION_METHOD };
}
