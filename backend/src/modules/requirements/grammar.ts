/**
 * Interpretation of the slot text printed in the KUCCPS cluster document.
 *
 * Two kinds of text exist and they MUST NOT be confused:
 *
 *  1. CLUSTER SLOT DEFINITIONS (header rows). They say which subjects may fill each of
 *     the four cluster-score slots, e.g. "A GROUP II or 2nd GROUP III or any GROUP IV".
 *     They drive the cluster-score calculation (modules/scoring).
 *
 *  2. SUB-CLUSTER MINIMUM REQUIREMENTS ("MAT ALTERNATIVE A - C+", "BIO/CHE/PHY - C
 *     (PLAIN)"). They say which subject(s) must be passed at which minimum grade for a
 *     programme and drive the eligibility check (modules/eligibility).
 *
 * Both are parsed into structured, testable objects. Anything that cannot be parsed
 * with certainty is returned with status 'unparsed' and a reason, never guessed.
 */
import { GRADES, Grade, GroupId, isGrade, resolveAlias, UNDEFINED_DOCUMENT_TOKENS } from '../subjects/catalogue';

export type SubjectRef =
  | { kind: 'subject'; code: string }
  | { kind: 'group'; group: GroupId; /** 1 for "any"/"a"; k for "kth GROUP X". */ ordinal: number };

export interface SlotRule {
  slot: 1 | 2 | 3 | 4;
  raw: string;
  status: 'parsed' | 'unparsed';
  /** OR-list of what may fill the slot. */
  options: SubjectRef[];
  warnings: string[];
  reason?: string;
}

export interface RequirementAlternative {
  subject: SubjectRef;
  minGrade: Grade;
  printedGrade: string;
}

export interface RequirementSlot {
  slot: 1 | 2 | 3 | 4;
  raw: string;
  status: 'parsed' | 'unparsed';
  /** OR-list: at least one alternative must be satisfied. */
  alternatives: RequirementAlternative[];
  warnings: string[];
  reason?: string;
}

const ROMAN: Record<string, GroupId> = { I: 'I', II: 'II', III: 'III', IV: 'IV', V: 'V', '1': 'I', '2': 'II', '3': 'III', '4': 'IV', '5': 'V' };

/** Known wrap artefacts in the printed document (a token broken across two lines). */
const WRAP_REPAIRS: Array<[RegExp, string]> = [
  [/\bC MP\b/g, 'CMP'],
  [/\bAGRI C\b/g, 'AGRIC'],
];

export function normaliseText(input: string): string {
  let t = input.replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
  for (const [re, rep] of WRAP_REPAIRS) t = t.replace(re, rep);
  t = t.replace(/\s*\/\s*/g, '/');
  t = t.replace(/^Subject\s*[1-4]\s+/i, '');
  t = t.replace(/\b([A-E])\s+\+/g, '$1+'); // "C +" -> "C+"
  return t;
}

/** Replace every printed Mathematics form by MATA / MATB so splitting on "/" is safe. */
function expandMaths(t: string): string {
  let out = t;
  out = out.replace(/\bMAT(?:H|HEMATICS)?(?: ALTERNATIVE)? ?A\/B(?![A-Z])/gi, 'MATA/MATB');
  out = out.replace(/\bMAT(?:H|HEMATICS)?(?: ALTERNATIVE)? ?A(?![A-Z])/gi, 'MATA');
  out = out.replace(/\bMAT(?:H|HEMATICS)?(?: ALTERNATIVE)? ?B(?![A-Z])/gi, 'MATB');
  // After the A/B expansion a following "/B" can remain, e.g. "MATA/MATB/B"; not expected.
  return out;
}

const GROUP_RE = /^(?:(ANY|A|\d+(?:ST|ND|RD|TH))\s+)?GROUP\s+(I{1,3}|IV|V|[1-5])$/i;

function parseSubjectToken(rawToken: string, warnings: string[]): SubjectRef | 'ignore' | null {
  const token = rawToken.trim().replace(/\s+/g, ' ');
  if (!token) return null;
  const g = GROUP_RE.exec(token);
  if (g) {
    const q = (g[1] ?? 'ANY').toUpperCase();
    const ord = /^\d+/.test(q) ? Number.parseInt(q, 10) : 1;
    const group = ROMAN[(g[2] as string).toUpperCase()];
    if (!group) return null;
    return { kind: 'group', group, ordinal: ord };
  }
  const code = resolveAlias(token);
  if (code) return { kind: 'subject', code };
  if (UNDEFINED_DOCUMENT_TOKENS.has(token.toUpperCase())) {
    warnings.push(`Token "${token}" is printed in the document but not defined; no catalogue subject can supply it (ignored)`);
    return 'ignore';
  }
  return null;
}

/**
 * Parse a cluster slot definition, e.g. "A GROUP II or 2nd GROUP III or any GROUP IV".
 * Grades printed in a header cell (e.g. "HAG - C+") are ignored here with a warning:
 * the header defines scoring membership, the sub-cluster row defines minimum grades.
 */
export function parseSlotRule(slot: 1 | 2 | 3 | 4, raw: string): SlotRule {
  const warnings: string[] = [];
  const base: SlotRule = { slot, raw, status: 'unparsed', options: [], warnings };
  if (!raw.trim()) return { ...base, reason: 'empty slot text' };
  let t = expandMaths(normaliseText(raw));
  const gradeTail = /\s*-\s*[A-E][+-]?(?:\s*\(?\s*PLAIN\s*\)?)?$/i.exec(t);
  if (gradeTail) {
    warnings.push(`Grade "${gradeTail[0].trim()}" printed in a cluster-definition cell was ignored`);
    t = t.slice(0, gradeTail.index);
  }
  const pieces = t.split(/\s+or\s+|\//i).map((p) => p.trim()).filter(Boolean);
  const options: SubjectRef[] = [];
  for (const p of pieces) {
    const r = parseSubjectToken(p, warnings);
    if (r === 'ignore') continue;
    if (!r) return { ...base, reason: `unrecognised term "${p}"` };
    options.push(r);
  }
  if (options.length === 0) return { ...base, reason: 'no recognisable subjects' };
  return { slot, raw, status: 'parsed', options, warnings };
}

const GRADE_TAIL = /(?:\s*-\s*|\s+)([A-E])\s?([+-])?(?:\s*\(\s*PLAIN\s*\)|\s+PLAIN)?\s*$/i;

function parseGradeFromTail(piece: string): { subjectText: string; grade: Grade; printed: string } | null {
  const m = GRADE_TAIL.exec(piece);
  if (!m) return null;
  const letter = (m[1] as string).toUpperCase();
  const sign = m[2] ?? '';
  const candidate = `${letter}${sign}`;
  if (!isGrade(candidate) || !(GRADES as readonly string[]).includes(candidate)) return null;
  return { subjectText: piece.slice(0, m.index).trim(), grade: candidate as Grade, printed: m[0].trim().replace(/^-\s*/, '') };
}

/**
 * Parse a sub-cluster minimum-requirement cell, e.g.
 *   "MAT ALTERNATIVE A/B - C (PLAIN)"                  -> MATA or MATB at >= C
 *   "BIO - C (PLAIN)/AGRIC - C+/BST - C+"              -> each alternative has its own grade
 *   "BIO/CHE/PHY - C (PLAIN)"                          -> one trailing grade applies to all
 * "(PLAIN)" simply states that the base letter (no plus/minus) is the minimum.
 */
export function parseRequirementSlot(slot: 1 | 2 | 3 | 4, raw: string): RequirementSlot {
  const warnings: string[] = [];
  const base: RequirementSlot = { slot, raw, status: 'unparsed', alternatives: [], warnings };
  if (!raw.trim()) return { ...base, reason: 'empty requirement text' };
  const t = expandMaths(normaliseText(raw));
  if (/\b(WITH|WITHOUT)\b/i.test(t)) return { ...base, reason: 'conditional "With/Without" variants require manual review' };
  const pieces = t.split('/').map((p) => p.trim()).filter(Boolean);
  const parsed: Array<{ subject: SubjectRef; grade?: Grade; printed?: string }> = [];
  for (const piece of pieces) {
    const g = parseGradeFromTail(piece);
    const subjectText = g ? g.subjectText : piece;
    const ref = parseSubjectToken(subjectText, warnings);
    if (ref === 'ignore') {
      continue;
    }
    if (!ref) return { ...base, reason: `unrecognised subject text "${subjectText}"` };
    parsed.push({ subject: ref, grade: g?.grade, printed: g?.printed });
  }
  // A grade printed after the last alternative applies to every earlier alternative without its own.
  let carry: { grade: Grade; printed: string } | null = null;
  const alts: RequirementAlternative[] = [];
  for (let i = parsed.length - 1; i >= 0; i--) {
    const p = parsed[i] as { subject: SubjectRef; grade?: Grade; printed?: string };
    if (p.grade) carry = { grade: p.grade, printed: p.printed ?? p.grade };
    if (!carry) return { ...base, reason: `no minimum grade found for "${raw}"` };
    alts.unshift({ subject: p.subject, minGrade: carry.grade, printedGrade: carry.printed });
  }
  if (alts.length === 0) return { ...base, reason: 'no recognisable alternatives' };
  return { slot, raw, status: 'parsed', alternatives: alts, warnings };
}
