/**
 * Cluster-score engine. Pure functions only: no database, HTTP or PDF code.
 *
 * FORMULA (version FORMULA_VERSION)
 * ---------------------------------
 *     C = sqrt( (r / R) * (t / T) ) * 48
 *
 *   r = sum of grade points in the FOUR cluster-subject slots of the programme's cluster
 *   R = 48  (4 subjects x 12 points)
 *   t = aggregate grade points of the candidate's seven KCSE subjects
 *   T = 84  (7 subjects x 12 points)
 *
 * VERIFICATION STATUS: SECONDARY-SOURCE.
 *   The formula and the 12-point scale are described identically by several published
 *   guides, but the supplied KUCCPS PDFs do not print them and no official KUCCPS page
 *   was reachable to confirm them. The output is therefore always an ESTIMATE.
 *   Which seven subjects make up t is also not stated in the supplied documents; the
 *   default rule (English, Kiswahili, Mathematics + best four others) follows the common
 *   description of the KCSE mean-grade subjects and is configurable.
 *
 * PRECISION / ROUNDING
 *   The score is returned at full double precision. Display rounds to three decimals.
 *   Cutoff comparison is done EXACTLY with integer arithmetic (see cutoff.ts) so that
 *   neither floating-point error nor display rounding changes an include/exclude result.
 */
import { Grade, GRADE_POINTS, GroupId, SUBJECTS, getSubject } from '../subjects/catalogue';
import { SlotRule, SubjectRef } from '../requirements/grammar';

export const FORMULA_VERSION = 'kuccps-weighted-cluster-v1';
export const FORMULA_MAX_R = 48;
export const FORMULA_MAX_T = 84;
export const FORMULA_STATUS = 'secondary-source-unverified' as const;

export type AggregateRule = 'COMPULSORY_PLUS_BEST_FOUR' | 'BEST_SEVEN';

export interface ScoringConfig {
  aggregateRule: AggregateRule;
  /**
   * How ordinal group terms ("2nd GROUP II") are read. 'strict': the slot may only be filled
   * by a group-X subject when at least k-1 earlier slots were filled by group-X subjects.
   */
  ordinalMode: 'strict';
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  aggregateRule: 'COMPULSORY_PLUS_BEST_FOUR',
  ordinalMode: 'strict',
};

/** Candidate grades keyed by catalogue subject code. */
export type GradeMap = Readonly<Record<string, Grade | undefined>>;

export interface AggregateResult {
  ok: boolean;
  t: number;
  subjects: Array<{ code: string; points: number }>;
  reason?: string;
}

const CODE_ORDER = new Map(SUBJECTS.map((s, i) => [s.code, i] as const));

function entries(grades: GradeMap): Array<{ code: string; points: number }> {
  const out: Array<{ code: string; points: number }> = [];
  for (const [code, grade] of Object.entries(grades)) {
    if (!grade) continue;
    if (!getSubject(code)) continue;
    out.push({ code, points: GRADE_POINTS[grade] });
  }
  return out.sort((a, b) => (CODE_ORDER.get(a.code) ?? 0) - (CODE_ORDER.get(b.code) ?? 0));
}

export function computeAggregate(grades: GradeMap, rule: AggregateRule = DEFAULT_SCORING_CONFIG.aggregateRule): AggregateResult {
  const all = entries(grades);
  if (all.length < 7) {
    return { ok: false, t: 0, subjects: [], reason: `At least 7 subjects are required to compute the aggregate (got ${all.length})` };
  }
  const byPointsThenOrder = (a: { code: string; points: number }, b: { code: string; points: number }) =>
    b.points - a.points || (CODE_ORDER.get(a.code) ?? 0) - (CODE_ORDER.get(b.code) ?? 0);

  if (rule === 'BEST_SEVEN') {
    const picked = [...all].sort(byPointsThenOrder).slice(0, 7);
    return { ok: true, t: picked.reduce((s, x) => s + x.points, 0), subjects: picked };
  }

  const eng = all.find((x) => x.code === 'ENG');
  const kis = all.find((x) => x.code === 'KIS');
  const maths = all.filter((x) => getSubject(x.code)?.compulsoryFamily === 'MATHEMATICS').sort(byPointsThenOrder)[0];
  if (!eng || !kis || !maths) {
    return { ok: false, t: 0, subjects: [], reason: 'English, Kiswahili and Mathematics are required for the aggregate' };
  }
  const compulsory = [eng, kis, maths];
  const used = new Set(compulsory.map((c) => c.code));
  const others = all
    .filter((x) => !used.has(x.code) && getSubject(x.code)?.compulsoryFamily !== 'MATHEMATICS')
    .sort(byPointsThenOrder)
    .slice(0, 4);
  if (others.length < 4) return { ok: false, t: 0, subjects: [], reason: 'Four further subjects are required for the aggregate' };
  const picked = [...compulsory, ...others];
  return { ok: true, t: picked.reduce((s, x) => s + x.points, 0), subjects: picked };
}

export interface SlotPick {
  slot: 1 | 2 | 3 | 4;
  subject: string;
  points: number;
  /** The printed alternative that admitted this subject, for audit. */
  via: string;
}

export interface SlotSelection {
  status: 'resolved' | 'unresolved';
  r: number;
  picks: SlotPick[];
  reason?: string;
}

function describeRef(ref: SubjectRef): string {
  return ref.kind === 'subject' ? ref.code : `${ref.ordinal > 1 ? ordinalWord(ref.ordinal) + ' ' : 'any '}GROUP ${ref.group}`;
}

function ordinalWord(n: number): string {
  return n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;
}

/**
 * Choose the four subjects that maximise r under the cluster's slot rules.
 * Subjects are never used twice; slots that cannot be filled legitimately leave the
 * selection 'unresolved' (a best-grade filler is NEVER substituted).
 */
export function selectClusterSlots(
  rules: readonly SlotRule[],
  grades: GradeMap,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): SlotSelection {
  void config;
  if (rules.length !== 4 || rules.some((r) => r.status !== 'parsed')) {
    return { status: 'unresolved', r: 0, picks: [], reason: 'Cluster slot definitions are missing or could not be interpreted' };
  }
  const have = entries(grades);
  const gradeOf = new Map(have.map((h) => [h.code, h.points] as const));

  type Choice = { code: string; via: string };
  const groupCount = (picks: SlotPick[], g: GroupId) => picks.filter((p) => getSubject(p.subject)?.group === g).length;

  const candidatesFor = (rule: SlotRule, used: Set<string>, picks: SlotPick[]): Choice[] => {
    const out: Choice[] = [];
    for (const opt of rule.options) {
      if (opt.kind === 'subject') {
        if (gradeOf.has(opt.code) && !used.has(opt.code)) out.push({ code: opt.code, via: describeRef(opt) });
      } else {
        if (groupCount(picks, opt.group) < opt.ordinal - 1) continue; // strict ordinal rule
        for (const h of have) {
          if (getSubject(h.code)?.group === opt.group && !used.has(h.code)) out.push({ code: h.code, via: describeRef(opt) });
        }
      }
    }
    // De-duplicate by code, preferring the first printed alternative.
    const seen = new Set<string>();
    return out.filter((c) => (seen.has(c.code) ? false : (seen.add(c.code), true)));
  };

  let best: { r: number; picks: SlotPick[]; key: string } | null = null;
  const rec = (i: number, used: Set<string>, picks: SlotPick[]) => {
    if (i === 4) {
      const r = picks.reduce((s, p) => s + p.points, 0);
      const key = picks.map((p) => p.subject).join(',');
      if (!best || r > best.r || (r === best.r && key < best.key)) best = { r, picks: [...picks], key };
      return;
    }
    const rule = rules[i] as SlotRule;
    for (const c of candidatesFor(rule, used, picks)) {
      used.add(c.code);
      picks.push({ slot: rule.slot, subject: c.code, points: gradeOf.get(c.code) as number, via: c.via });
      rec(i + 1, used, picks);
      picks.pop();
      used.delete(c.code);
    }
  };
  rec(0, new Set(), []);
  const found = best as { r: number; picks: SlotPick[]; key: string } | null;
  if (!found) {
    // Explain which slot has no legitimate candidate on its own.
    const empty = rules.find((rule) => candidatesFor(rule, new Set(), []).length === 0);
    return {
      status: 'unresolved',
      r: 0,
      picks: [],
      reason: empty
        ? `No submitted subject can fill cluster subject ${empty.slot} ("${empty.raw}")`
        : 'The submitted subjects cannot fill all four cluster slots without reusing a subject',
    };
  }
  return { status: 'resolved', r: found.r, picks: found.picks };
}

/** C = sqrt((r/48) * (t/84)) * 48, full double precision. */
export function clusterScore(r: number, t: number): number {
  if (!Number.isFinite(r) || !Number.isFinite(t) || r < 4 || r > FORMULA_MAX_R || t < 7 || t > FORMULA_MAX_T) {
    throw new RangeError(`Invalid formula inputs r=${r}, t=${t}`);
  }
  return Math.sqrt((r / FORMULA_MAX_R) * (t / FORMULA_MAX_T)) * 48;
}

export function formatScore(score: number): string {
  return score.toFixed(3);
}

export function meanGradeFromAggregate(t: number): string | null {
  // Mean points over 7 subjects mapped back to a letter (nearest grade point, ties round up).
  if (!Number.isFinite(t) || t < 7 || t > 84) return null;
  const mean = Math.round(t / 7 + 1e-9);
  const letters = ['E', 'D-', 'D', 'D+', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A'];
  return letters[Math.min(11, Math.max(0, mean - 1))] ?? null;
}

export const SCORING_METHODOLOGY = {
  formulaVersion: FORMULA_VERSION,
  formula: 'C = sqrt((r / 48) * (t / 84)) * 48',
  gradePoints: GRADE_POINTS,
  status: FORMULA_STATUS,
  aggregateRule: DEFAULT_SCORING_CONFIG.aggregateRule,
  notes: [
    'Formula and 12-point scale are taken from published guides; the supplied KUCCPS PDFs do not state them.',
    'Subject groups I-V are not defined in the supplied PDFs; the catalogue follows the usual KNEC convention (assumed).',
    'Ordinal group terms such as "2nd GROUP II" are applied strictly (earlier slots must already hold that many group subjects).',
    'The score is an estimate and is not an official KUCCPS cluster score.',
  ],
} as const;
