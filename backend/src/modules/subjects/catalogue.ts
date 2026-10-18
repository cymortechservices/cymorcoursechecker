/**
 * KCSE subject catalogue, subject groups and grade-point scale.
 *
 * VERIFICATION STATUS
 * -------------------
 * - Grade points (A=12 ... E=1): consistent across several published guides; the
 *   supplied KUCCPS PDFs do not print the scale. Status: SECONDARY-SOURCE.
 * - Subject groups (I-V): the supplied KUCCPS PDFs REFER to "GROUP II", "GROUP III",
 *   "GROUP IV", "GROUP V" but never define their membership. The table below follows
 *   the usual KNEC/KUCCPS convention and is therefore ASSUMED. It is isolated in this
 *   file (versioned) so it can be corrected without touching the scoring engine.
 *   Status: ASSUMED - confirm against an official KNEC/KUCCPS document.
 * - Mathematics Alternative A / B are treated as two distinct subjects. A candidate
 *   normally sat one of them. "MAT ALTERNATIVE A/B" in the PDFs means "either".
 */

export const SUBJECT_CATALOGUE_VERSION = 'subjects-v1.0.0';

export type GroupId = 'I' | 'II' | 'III' | 'IV' | 'V';

export const GRADES = ['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'E'] as const;
export type Grade = (typeof GRADES)[number];

export const GRADE_POINTS: Readonly<Record<Grade, number>> = {
  A: 12,
  'A-': 11,
  'B+': 10,
  B: 9,
  'B-': 8,
  'C+': 7,
  C: 6,
  'C-': 5,
  'D+': 4,
  D: 3,
  'D-': 2,
  E: 1,
};

export function isGrade(value: unknown): value is Grade {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(GRADE_POINTS, value);
}

export interface SubjectDef {
  /** Stable internal code used by the API and the rules. */
  code: string;
  name: string;
  group: GroupId;
  /** Alternative abbreviations printed in the KUCCPS documents. */
  aliases: string[];
  /** Compulsory subject for the aggregate rule (English, Kiswahili, Mathematics). */
  compulsory?: boolean;
  /** Which compulsory "slot" the subject fills (a candidate takes exactly one maths). */
  compulsoryFamily?: 'ENGLISH' | 'KISWAHILI' | 'MATHEMATICS';
}

export const SUBJECTS: readonly SubjectDef[] = [
  { code: 'ENG', name: 'English', group: 'I', aliases: ['ENG', 'ENGLISH'], compulsory: true, compulsoryFamily: 'ENGLISH' },
  { code: 'KIS', name: 'Kiswahili', group: 'I', aliases: ['KIS', 'KISWAHILI'], compulsory: true, compulsoryFamily: 'KISWAHILI' },
  { code: 'MATA', name: 'Mathematics Alternative A', group: 'I', aliases: ['MAT ALTERNATIVE A', 'MATH A', 'MAT A', 'MATHEMATICS ALTERNATIVE A'], compulsory: true, compulsoryFamily: 'MATHEMATICS' },
  { code: 'MATB', name: 'Mathematics Alternative B', group: 'I', aliases: ['MAT ALTERNATIVE B', 'MAT B', 'MATHEMATICS ALTERNATIVE B'], compulsory: true, compulsoryFamily: 'MATHEMATICS' },

  { code: 'BIO', name: 'Biology', group: 'II', aliases: ['BIO', 'BIOLOGY'] },
  { code: 'PHY', name: 'Physics', group: 'II', aliases: ['PHY', 'PHYSICS'] },
  { code: 'CHE', name: 'Chemistry', group: 'II', aliases: ['CHE', 'CHEMISTRY'] },
  { code: 'GSC', name: 'General Science', group: 'II', aliases: ['GSC', 'GENERAL SCIENCE'] },

  { code: 'HAG', name: 'History and Government', group: 'III', aliases: ['HAG', 'HISTORY'] },
  { code: 'GEO', name: 'Geography', group: 'III', aliases: ['GEO', 'GEOGRAPHY'] },
  { code: 'CRE', name: 'Christian Religious Education', group: 'III', aliases: ['CRE'] },
  { code: 'IRE', name: 'Islamic Religious Education', group: 'III', aliases: ['IRE'] },
  { code: 'HRE', name: 'Hindu Religious Education', group: 'III', aliases: ['HRE'] },

  { code: 'HSC', name: 'Home Science', group: 'IV', aliases: ['HSC', 'HOME SCIENCE'] },
  { code: 'ARD', name: 'Art and Design', group: 'IV', aliases: ['ARD', 'ART AND DESIGN'] },
  { code: 'AGR', name: 'Agriculture', group: 'IV', aliases: ['AGR', 'AGRIC', 'AGRICULTURE'] },
  { code: 'CMP', name: 'Computer Studies', group: 'IV', aliases: ['CMP', 'COMP', 'COMPUTER', 'COMPUTER STUDIES'] },
  { code: 'WWK', name: 'Woodwork', group: 'IV', aliases: ['WWK', 'WOODWORK'] },
  { code: 'MTW', name: 'Metalwork', group: 'IV', aliases: ['MTW', 'METALWORK'] },
  { code: 'BCN', name: 'Building Construction', group: 'IV', aliases: ['BCN', 'BUILDING CONSTRUCTION'] },
  { code: 'PWM', name: 'Power Mechanics', group: 'IV', aliases: ['PWM', 'POWER MECHANICS'] },
  { code: 'ELC', name: 'Electricity', group: 'IV', aliases: ['ELC', 'ELECTRICITY'] },
  { code: 'DAD', name: 'Drawing and Design', group: 'IV', aliases: ['DAD', 'DRAWING AND DESIGN'] },
  { code: 'AVT', name: 'Aviation Technology', group: 'IV', aliases: ['AVT', 'AVIATION'] },

  { code: 'FRE', name: 'French', group: 'V', aliases: ['FRE', 'FRENCH'] },
  { code: 'GER', name: 'German', group: 'V', aliases: ['GER', 'GERMAN'] },
  { code: 'ARB', name: 'Arabic', group: 'V', aliases: ['ARB', 'ARABIC'] },
  { code: 'MUS', name: 'Music', group: 'V', aliases: ['MUS', 'MUSIC'] },
  { code: 'BST', name: 'Business Studies', group: 'V', aliases: ['BST', 'BUSINESS STUDIES'] },
];

const BY_CODE = new Map(SUBJECTS.map((s) => [s.code, s] as const));

/** Tokens that appear in the KUCCPS cluster PDF but are not in the catalogue above. */
export const UNDEFINED_DOCUMENT_TOKENS: ReadonlySet<string> = new Set(['SSE']);

export function getSubject(code: string): SubjectDef | undefined {
  return BY_CODE.get(code);
}

export function isSubjectCode(code: string): boolean {
  return BY_CODE.has(code);
}

export function subjectsInGroup(group: GroupId): SubjectDef[] {
  return SUBJECTS.filter((s) => s.group === group);
}

export function gradePoints(grade: Grade): number {
  return GRADE_POINTS[grade];
}

export function gradeAtLeast(actual: Grade, minimum: Grade): boolean {
  return GRADE_POINTS[actual] >= GRADE_POINTS[minimum];
}

/** Map a printed abbreviation (e.g. "AGRIC", "COMP") to a catalogue code, if known. */
export function resolveAlias(token: string): string | undefined {
  const t = token.trim().toUpperCase().replace(/\s+/g, ' ');
  for (const s of SUBJECTS) {
    if (s.code === t || s.aliases.includes(t)) return s.code;
  }
  return undefined;
}

/** Public shape returned by GET /subjects. */
export interface PublicSubject {
  code: string;
  name: string;
  group: GroupId;
  compulsory: boolean;
}

export function publicSubjects(): PublicSubject[] {
  return SUBJECTS.map((s) => ({ code: s.code, name: s.name, group: s.group, compulsory: Boolean(s.compulsory) }));
}
