/**
 * Evaluation of sub-cluster MINIMUM SUBJECT REQUIREMENTS against a candidate's grades.
 *
 * Every printed requirement cell is an OR-list of (subject, minimum grade) alternatives.
 * All requirement cells of the sub-cluster must be satisfied simultaneously by DIFFERENT
 * candidate subjects (e.g. "BIO/CHE/PHY - C" in both slot 2 and slot 3 needs two of them).
 * A bipartite assignment search finds such an assignment if one exists.
 */
import { GRADE_POINTS, getSubject } from '../subjects/catalogue';
import type { RequirementSlot, RequirementAlternative } from '../requirements/grammar';
import type { GradeMap } from '../scoring/clusterScore.service';

export interface RequirementMatch {
  slot: number;
  subject: string;
  grade: string;
  required: string;
}

export interface RequirementOutcome {
  status: 'met' | 'not_met' | 'not_evaluable';
  matches: RequirementMatch[];
  /** Human-readable failures (first unmet slot), for diagnostics and the UI. */
  failures: string[];
}

function altMatches(alt: RequirementAlternative, code: string, grades: GradeMap): boolean {
  const grade = grades[code];
  if (!grade) return false;
  if (GRADE_POINTS[grade] < GRADE_POINTS[alt.minGrade]) return false;
  if (alt.subject.kind === 'subject') return alt.subject.code === code;
  return getSubject(code)?.group === alt.subject.group;
}

export function describeAlternatives(slot: RequirementSlot): string {
  return slot.alternatives
    .map((a) => `${a.subject.kind === 'subject' ? a.subject.code : `any GROUP ${a.subject.group}`} ≥ ${a.minGrade}`)
    .join(' or ');
}

export function evaluateRequirements(slots: readonly RequirementSlot[], grades: GradeMap): RequirementOutcome {
  if (slots.some((s) => s.status !== 'parsed')) {
    return { status: 'not_evaluable', matches: [], failures: ['Requirement text could not be interpreted'] };
  }
  if (slots.length === 0) return { status: 'met', matches: [], failures: [] };

  const submitted = Object.keys(grades).filter((c) => grades[c] && getSubject(c));
  const options = slots.map((s) => submitted.filter((code) => s.alternatives.some((a) => altMatches(a, code, grades))));

  // Fail fast with a precise message when a single slot has no candidate at all.
  for (let i = 0; i < slots.length; i++) {
    if ((options[i] as string[]).length === 0) {
      return { status: 'not_met', matches: [], failures: [`Requires ${describeAlternatives(slots[i] as RequirementSlot)}`] };
    }
  }

  const assigned: string[] = new Array(slots.length).fill('');
  const used = new Set<string>();
  const solve = (i: number): boolean => {
    if (i === slots.length) return true;
    for (const code of options[i] as string[]) {
      if (used.has(code)) continue;
      used.add(code);
      assigned[i] = code;
      if (solve(i + 1)) return true;
      used.delete(code);
    }
    return false;
  };

  if (!solve(0)) {
    return {
      status: 'not_met',
      matches: [],
      failures: ['The required subjects cannot all be met with different subjects'],
    };
  }
  return {
    status: 'met',
    failures: [],
    matches: slots.map((s, i) => ({
      slot: s.slot,
      subject: assigned[i] as string,
      grade: grades[assigned[i] as string] as string,
      required: describeAlternatives(s),
    })),
  };
}
