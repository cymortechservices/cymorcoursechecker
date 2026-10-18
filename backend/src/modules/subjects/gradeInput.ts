/**
 * Validation of candidate KCSE input. Pure; shared by the API validators and the tests.
 * Grades are never inferred: anything missing stays missing.
 */
import { Grade, getSubject, isGrade } from './catalogue';

export interface GradeEntry {
  subject: string;
  grade: string;
}

export interface GradeValidation {
  ok: boolean;
  grades: Record<string, Grade>;
  errors: Array<{ field: string; message: string }>;
  warnings: string[];
}

export const MIN_SUBJECTS = 7;
export const MAX_SUBJECTS = 12;

export function validateCandidateGrades(entries: readonly GradeEntry[]): GradeValidation {
  const errors: GradeValidation['errors'] = [];
  const warnings: string[] = [];
  const grades: Record<string, Grade> = {};

  for (const e of entries) {
    const code = String(e.subject ?? '').trim().toUpperCase();
    const grade = String(e.grade ?? '').trim().toUpperCase();
    if (!getSubject(code)) {
      errors.push({ field: `grades.${code || '?'}`, message: `Unknown subject "${e.subject}"` });
      continue;
    }
    if (!isGrade(grade)) {
      errors.push({ field: `grades.${code}`, message: `"${e.grade}" is not a valid KCSE grade for ${code}` });
      continue;
    }
    if (grades[code]) {
      errors.push({ field: `grades.${code}`, message: `${code} was entered more than once` });
      continue;
    }
    grades[code] = grade;
  }

  for (const required of ['ENG', 'KIS']) {
    if (!grades[required]) errors.push({ field: `grades.${required}`, message: `${getSubject(required)?.name} is required` });
  }
  const maths = ['MATA', 'MATB'].filter((c) => grades[c]);
  if (maths.length === 0) errors.push({ field: 'grades.MATH', message: 'Mathematics (Alternative A or B) is required' });
  if (maths.length > 1) errors.push({ field: 'grades.MATH', message: 'Enter either Mathematics Alternative A or B, not both' });

  const count = Object.keys(grades).length;
  if (count < MIN_SUBJECTS) errors.push({ field: 'grades', message: `At least ${MIN_SUBJECTS} subjects are required (you entered ${count})` });
  if (count > MAX_SUBJECTS) errors.push({ field: 'grades', message: `At most ${MAX_SUBJECTS} subjects can be entered` });
  if (count > 9) warnings.push('Most candidates sit 7 to 9 subjects; please double-check the list.');

  return { ok: errors.length === 0, grades, errors, warnings };
}
