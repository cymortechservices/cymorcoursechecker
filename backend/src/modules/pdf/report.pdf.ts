/**
 * Server-side PDF report ("KCSE Degree Eligibility Report").
 *
 * Built with pdf-lib: precise page control, no browser, no native dependencies.
 * Text uses the built-in Helvetica / Courier families (WinAnsi). Characters outside that set
 * are replaced with a safe equivalent or '?' so an unusual name can never break generation.
 *
 * Design goals: high contrast (dark ink on white, white on navy), generous sizes (body 10 pt,
 * tables 9-9.5 pt), one accent system (violet/cyan), status colours that are never the only
 * carrier of meaning (every coloured value also has a text label).
 *
 * The report consumes the SAME eligibility result objects as the API: it never recomputes
 * scores, so every table value equals the JSON the website received.
 */
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import type { QualifyingOption } from '../eligibility/eligibility.service';
import type { Recommendation } from '../recommendations/recommendations.service';
import { GRADE_POINTS, getSubject } from '../subjects/catalogue';
import type { SourceDocumentInfo } from '../import/import.service';
import { SCORING_METHODOLOGY } from '../scoring/clusterScore.service';

export interface ReportData {
  siteName: string;
  supportEmail?: string;
  reportId: string;
  generatedAt: Date;
  datasetVersion: string;
  cutoffPolicyLabel: string;
  candidateName?: string;
  candidateReference?: string;
  grades: Record<string, string>;
  aggregate: { t: number; subjects: Array<{ code: string; points: number }> };
  meanGrade: string | null;
  options: readonly QualifyingOption[];
  recommendation: Recommendation;
  sources: { cluster: SourceDocumentInfo; cutoffs: SourceDocumentInfo };
  /** Cutoff years actually used by the listed options (for the cover page). */
  cutoffYearsUsed: number[];
}

type Color = ReturnType<typeof rgb>;

const A4: [number, number] = [595.28, 841.89];
const M = 48; // page margin
const CW = A4[0] - 2 * M; // content width

const C = {
  navy: rgb(0.043, 0.075, 0.169), // #0B132B
  navy2: rgb(0.086, 0.133, 0.263),
  ink: rgb(0.059, 0.09, 0.165), // #0F172A
  body: rgb(0.118, 0.161, 0.231), // #1E293B
  muted: rgb(0.278, 0.333, 0.411), // #475569 (AA on white)
  line: rgb(0.796, 0.835, 0.882), // #CBD5E1
  surface: rgb(0.945, 0.961, 0.976), // #F1F5F9
  zebra: rgb(0.973, 0.98, 0.99),
  violet: rgb(0.427, 0.157, 0.851), // #6D28D9
  violetSoft: rgb(0.929, 0.914, 0.996),
  cyan: rgb(0.031, 0.569, 0.698), // #0891B2
  cyanBright: rgb(0.133, 0.827, 0.933),
  white: rgb(1, 1, 1),
  green: rgb(0.016, 0.471, 0.341), // #047857
  greenSoft: rgb(0.82, 0.98, 0.9),
  amber: rgb(0.706, 0.325, 0.035), // #B45309
  amberSoft: rgb(0.996, 0.953, 0.78),
  indigo: rgb(0.263, 0.22, 0.792), // #4338CA
  indigoSoft: rgb(0.878, 0.906, 1),
};

export function sanitizeForPdf(text: string, font: PDFFont): string {
  const supported = new Set(font.getCharacterSet());
  const replacements: Record<string, string> = { '≥': '>=', '≤': '<=', '→': '->', '“': '"', '”': '"', '‘': "'", '’': "'", '…': '...', ' ': ' ', '\t': ' ' };
  let out = '';
  for (const ch of text.normalize('NFC')) {
    const cp = ch.codePointAt(0) as number;
    if (cp < 32) {
      out += ' ';
      continue;
    }
    if (supported.has(cp)) out += ch;
    else out += replacements[ch] ?? '?';
  }
  return out;
}

export function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const clean = sanitizeForPdf(text, font).replace(/\s+/g, ' ').trim();
  if (!clean) return [''];
  const lines: string[] = [];
  let cur = '';
  const push = () => {
    if (cur) lines.push(cur);
    cur = '';
  };
  for (const w of clean.split(' ')) {
    let word = w;
    while (font.widthOfTextAtSize(word, size) > maxWidth) {
      let cut = word.length - 1;
      while (cut > 1 && font.widthOfTextAtSize(word.slice(0, cut), size) > maxWidth) cut--;
      push();
      lines.push(word.slice(0, cut));
      word = word.slice(cut);
    }
    const trial = cur ? `${cur} ${word}` : word;
    if (font.widthOfTextAtSize(trial, size) <= maxWidth) cur = trial;
    else {
      push();
      cur = word;
    }
  }
  push();
  return lines;
}

/** Title-case an UPPER CASE programme/university name for readability. */
export function readable(name: string): string {
  const small = new Set(['of', 'and', 'in', 'with', 'for', 'the', 'to', 'at', 'a', 'an', 'on']);
  const keepUpper = new Set(['IT', 'ICT', 'LL.B.', 'BSC', 'BA', 'II', 'III', 'IV', 'KCA', 'JKUAT', 'TVET', 'HIV/AIDS', 'DNA', 'GIS', 'UK', 'USA']);
  const letters = name.replace(/[^A-Za-z]/g, '');
  if (letters.length && letters !== letters.toUpperCase()) return name; // already mixed case
  return name
    .toLowerCase()
    .split(' ')
    .map((w, i) => {
      const up = w.toUpperCase();
      if (keepUpper.has(up)) return up;
      if (i > 0 && small.has(w)) return w;
      // keep punctuation prefixes such as "(" intact
      return w.replace(/^([("'&-]*)([a-z])/, (_m, p: string, c: string) => p + c.toUpperCase());
    })
    .join(' ');
}

type Level = 'safe' | 'balanced' | 'competitive';
function levelOf(margin: number): Level {
  return margin >= 3 ? 'safe' : margin >= 1 ? 'balanced' : 'competitive';
}
const LEVEL_STYLE: Record<Level, { label: string; ink: Color; soft: Color }> = {
  safe: { label: 'Safe', ink: C.green, soft: C.greenSoft },
  balanced: { label: 'Balanced', ink: C.amber, soft: C.amberSoft },
  competitive: { label: 'Competitive', ink: C.indigo, soft: C.indigoSoft },
};

class Writer {
  pdf!: PDFDocument;
  regular!: PDFFont;
  bold!: PDFFont;
  italic!: PDFFont;
  mono!: PDFFont;
  page!: PDFPage;
  y = 0;

  static async create(): Promise<Writer> {
    const w = new Writer();
    w.pdf = await PDFDocument.create();
    w.regular = await w.pdf.embedFont(StandardFonts.Helvetica);
    w.bold = await w.pdf.embedFont(StandardFonts.HelveticaBold);
    w.italic = await w.pdf.embedFont(StandardFonts.HelveticaOblique);
    w.mono = await w.pdf.embedFont(StandardFonts.CourierBold);
    return w;
  }

  addPage(): PDFPage {
    this.page = this.pdf.addPage(A4);
    return this.page;
  }

  /** Rounded rectangle via an SVG path (pdf-lib has no native radius). y is the TOP edge. */
  roundRect(x: number, yTop: number, w: number, h: number, r: number, color: Color, opts: { border?: Color; borderWidth?: number; opacity?: number } = {}): void {
    const rr = Math.min(r, w / 2, h / 2);
    const path = `M ${rr} 0 H ${w - rr} Q ${w} 0 ${w} ${rr} V ${h - rr} Q ${w} ${h} ${w - rr} ${h} H ${rr} Q 0 ${h} 0 ${h - rr} V ${rr} Q 0 0 ${rr} 0 Z`;
    this.page.drawSvgPath(path, { x, y: yTop, color, opacity: opts.opacity, borderColor: opts.border, borderWidth: opts.border ? (opts.borderWidth ?? 1) : undefined });
  }

  newContentPage(section: string): void {
    this.addPage();
    const [w, h] = A4;
    this.page.drawRectangle({ x: 0, y: h - 40, width: w, height: 40, color: C.navy });
    this.page.drawRectangle({ x: 0, y: h - 43, width: w * 0.4, height: 3, color: C.cyanBright });
    this.page.drawRectangle({ x: w * 0.4, y: h - 43, width: w * 0.6, height: 3, color: C.violet });
    this.page.drawText('CYMOR', { x: M, y: h - 26, size: 11, font: this.bold, color: C.cyanBright });
    this.page.drawText('CourseChecker', { x: M + 46, y: h - 26, size: 11, font: this.regular, color: C.white });
    const t = sanitizeForPdf(section, this.regular);
    this.page.drawText(t, { x: w - M - this.regular.widthOfTextAtSize(t, 10), y: h - 25.5, size: 10, font: this.regular, color: rgb(0.78, 0.84, 0.94) });
    this.y = h - 84;
  }

  ensure(height: number, section: string): void {
    if (this.y - height < 64) this.newContentPage(section);
  }

  heading(txt: string, kicker: string, section: string): void {
    this.ensure(80, section);
    this.page.drawText(sanitizeForPdf(kicker.toUpperCase(), this.bold), { x: M, y: this.y, size: 9, font: this.bold, color: C.violet });
    this.y -= 24;
    this.page.drawText(sanitizeForPdf(txt, this.bold), { x: M, y: this.y, size: 22, font: this.bold, color: C.ink });
    this.y -= 12;
    this.page.drawRectangle({ x: M, y: this.y - 6, width: 44, height: 3.5, color: C.violet });
    this.y -= 26;
  }

  sub(txt: string, section: string): void {
    this.ensure(44, section);
    this.page.drawText(sanitizeForPdf(txt, this.bold), { x: M, y: this.y - 12, size: 13, font: this.bold, color: C.ink });
    this.y -= 28;
  }

  paragraph(txt: string, section: string, opts: { size?: number; color?: Color; font?: PDFFont; gap?: number } = {}): void {
    const size = opts.size ?? 10;
    const font = opts.font ?? this.regular;
    const lh = size * 1.55;
    for (const line of wrap(txt, font, size, CW)) {
      this.ensure(lh + 2, section);
      this.page.drawText(line, { x: M, y: this.y - size, size, font, color: opts.color ?? C.body });
      this.y -= lh;
    }
    this.y -= opts.gap ?? 8;
  }

  bullet(txt: string, section: string): void {
    const size = 10;
    const lines = wrap(txt, this.regular, size, CW - 18);
    lines.forEach((line, i) => {
      this.ensure(size * 1.55 + 2, section);
      if (i === 0) this.page.drawCircle({ x: M + 5, y: this.y - size * 0.62, size: 2.4, color: C.violet });
      this.page.drawText(line, { x: M + 18, y: this.y - size, size, font: this.regular, color: C.body });
      this.y -= size * 1.55;
    });
    this.y -= 4;
  }

  notice(txt: string, section: string, tone: 'info' | 'warn' = 'warn'): void {
    const size = 9.5;
    const lines = wrap(txt, this.regular, size, CW - 34);
    const h = lines.length * size * 1.5 + 22;
    this.ensure(h + 10, section);
    const bg = tone === 'warn' ? C.amberSoft : C.violetSoft;
    const bar = tone === 'warn' ? C.amber : C.violet;
    this.roundRect(M, this.y, CW, h, 6, bg);
    this.page.drawRectangle({ x: M, y: this.y - h + 3, width: 4, height: h - 6, color: bar });
    let yy = this.y - 11;
    for (const l of lines) {
      this.page.drawText(l, { x: M + 18, y: yy - size, size, font: this.regular, color: C.ink });
      yy -= size * 1.5;
    }
    this.y -= h + 12;
  }

  /** Pill with centred text; returns the pill width. */
  pill(text: string, x: number, yTop: number, ink: Color, soft: Color, size = 8): number {
    const t = sanitizeForPdf(text, this.bold);
    const tw = this.bold.widthOfTextAtSize(t, size);
    const w = tw + 14;
    this.roundRect(x, yTop, w, size + 8, (size + 8) / 2, soft);
    this.page.drawText(t, { x: x + 7, y: yTop - size - 2.2, size, font: this.bold, color: ink });
    return w;
  }

  /** Generic wrapped-cell table with repeating header. */
  table(
    cols: Array<{ title: string; width: number; align?: 'left' | 'right' | 'center'; bold?: boolean; mono?: boolean }>,
    rows: string[][],
    section: string,
    opts: { size?: number; padY?: number } = {},
  ): void {
    const size = opts.size ?? 9.5;
    const lh = size * 1.35;
    const padX = 6;
    const padY = opts.padY ?? 7;
    const total = cols.reduce((s, c) => s + c.width, 0);
    const fontOf = (c: { bold?: boolean; mono?: boolean }) => (c.mono ? this.mono : c.bold ? this.bold : this.regular);
    const header = () => {
      const h = 26;
      this.ensure(h + 44, section);
      this.roundRect(M, this.y, total, h, 5, C.navy2);
      let x = M;
      for (const c of cols) {
        const t = sanitizeForPdf(c.title, this.bold);
        const tw = this.bold.widthOfTextAtSize(t, 9);
        const tx = c.align === 'right' ? x + c.width - padX - tw : c.align === 'center' ? x + (c.width - tw) / 2 : x + padX;
        this.page.drawText(t, { x: tx, y: this.y - 17, size: 9, font: this.bold, color: C.white });
        x += c.width;
      }
      this.y -= h;
    };
    header();
    rows.forEach((cells, ri) => {
      const wrapped = cells.map((cell, ci) => wrap(cell, fontOf(cols[ci] as object), size, (cols[ci] as { width: number }).width - 2 * padX));
      const lines = Math.max(...wrapped.map((w) => w.length));
      const h = lines * lh + 2 * padY;
      if (this.y - h < 64) {
        this.newContentPage(section);
        header();
      }
      if (ri % 2 === 1) this.page.drawRectangle({ x: M, y: this.y - h, width: total, height: h, color: C.zebra });
      this.page.drawRectangle({ x: M, y: this.y - h, width: total, height: 0.6, color: C.line });
      let x = M;
      wrapped.forEach((ls, ci) => {
        const col = cols[ci] as { width: number; align?: string; bold?: boolean; mono?: boolean };
        const font = fontOf(col);
        ls.forEach((line, li) => {
          const tw = font.widthOfTextAtSize(line, size);
          const tx = col.align === 'right' ? x + col.width - padX - tw : col.align === 'center' ? x + (col.width - tw) / 2 : x + padX;
          this.page.drawText(line, { x: tx, y: this.y - padY - size - li * lh + 1.5, size, font, color: ci === 0 ? C.ink : C.body });
        });
        x += col.width;
      });
      this.y -= h;
    });
    this.y -= 14;
  }
}

const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

/* ------------------------------------------------------------------ cover */
function coverPage(w: Writer, d: ReportData): void {
  const [pw, ph] = A4;
  w.addPage();
  const p = w.page;
  p.drawRectangle({ x: 0, y: 0, width: pw, height: ph, color: C.navy });
  p.drawCircle({ x: pw - 30, y: ph - 40, size: 250, color: C.violet, opacity: 0.2 });
  p.drawCircle({ x: -10, y: ph - 330, size: 170, color: C.cyanBright, opacity: 0.08 });
  p.drawRectangle({ x: M, y: ph - 100, width: 40, height: 4, color: C.cyanBright });
  p.drawText('CYMOR', { x: M, y: ph - 88, size: 16, font: w.bold, color: C.cyanBright });
  p.drawText('CourseChecker', { x: M + 68, y: ph - 88, size: 16, font: w.regular, color: C.white });

  p.drawText('KCSE Degree', { x: M, y: ph - 200, size: 42, font: w.bold, color: C.white });
  p.drawText('Eligibility Report', { x: M, y: ph - 248, size: 42, font: w.bold, color: C.white });
  w.roundRect(M, ph - 262, 110, 5, 2.5, C.cyanBright);
  const purpose =
    'The KUCCPS degree programmes you may qualify for, based on your KCSE grades, the published minimum subject requirements, your estimated cluster score and historical programme cutoffs.';
  let yy = ph - 300;
  for (const line of wrap(purpose, w.regular, 12.5, pw - 2 * M - 70)) {
    p.drawText(line, { x: M, y: yy, size: 12.5, font: w.regular, color: rgb(0.85, 0.89, 0.96) });
    yy -= 19;
  }

  // White summary card for maximum legibility
  const rows: Array<[string, string]> = [
    ['Candidate', d.candidateName?.trim() || 'Not provided'],
    ['Report reference', d.reportId.slice(0, 22)],
    ['Generated', fmtDate(d.generatedAt)],
    ['Dataset version', d.datasetVersion],
    ['Cutoff policy', d.cutoffPolicyLabel],
    ['Cutoff years used', d.cutoffYearsUsed.length ? d.cutoffYearsUsed.join(', ') : 'None'],
    ['Estimated mean grade', d.meanGrade ? `${d.meanGrade}  (aggregate ${d.aggregate.t} of 84)` : 'Not available'],
  ];
  if (d.candidateReference?.trim()) rows.splice(1, 0, ['Your reference', d.candidateReference.trim()]);
  const rowH = 32;
  const cardH = rows.length * rowH + 100;
  const cardTop = 470;
  w.roundRect(M, cardTop, pw - 2 * M, cardH, 14, C.white);
  // qualifying-count highlight band inside card
  w.roundRect(M + 14, cardTop - 14, pw - 2 * M - 28, 62, 10, C.violetSoft);
  p.drawText(String(d.options.length), { x: M + 32, y: cardTop - 54, size: 34, font: w.bold, color: C.violet });
  const numW = w.bold.widthOfTextAtSize(String(d.options.length), 34);
  p.drawText('qualifying programme-university options', { x: M + 44 + numW, y: cardTop - 40, size: 12.5, font: w.bold, color: C.ink });
  p.drawText('that meet the subject requirements and the cutoff rule', { x: M + 44 + numW, y: cardTop - 57, size: 10, font: w.regular, color: C.muted });
  let ry = cardTop - 98;
  rows.forEach(([k, v], i) => {
    if (i > 0) p.drawRectangle({ x: M + 20, y: ry + rowH - 11, width: pw - 2 * M - 40, height: 0.6, color: C.line });
    p.drawText(sanitizeForPdf(k.toUpperCase(), w.bold), { x: M + 22, y: ry + 3, size: 8, font: w.bold, color: C.cyan });
    const line = wrap(v, w.bold, 11.5, pw - 2 * M - 210)[0] ?? '';
    p.drawText(line, { x: M + 185, y: ry + 2, size: 11.5, font: w.bold, color: C.ink });
    ry -= rowH;
  });
  p.drawText(sanitizeForPdf('Estimated scores only. Not an official KUCCPS result. Historical cutoffs do not guarantee future placement.', w.italic), {
    x: M,
    y: 52,
    size: 9.5,
    font: w.italic,
    color: rgb(0.78, 0.84, 0.94),
  });
}

/* ---------------------------------------------------------- at a glance */
function glanceSection(w: Writer, d: ReportData): void {
  const section = 'Your results at a glance';
  w.newContentPage(section);
  w.heading('Your results at a glance', 'Section 3', section);

  const counts = { safe: 0, balanced: 0, competitive: 0 } as Record<Level, number>;
  for (const o of d.options) counts[levelOf(o.margin)]++;
  const cards: Array<{ big: string; label: string; ink: Color; soft: Color }> = [
    { big: String(d.options.length), label: 'Qualifying options', ink: C.violet, soft: C.violetSoft },
    { big: String(counts.safe), label: 'Safe (3.000+ above cutoff)', ink: C.green, soft: C.greenSoft },
    { big: String(counts.balanced), label: 'Balanced (1.000 to 2.999)', ink: C.amber, soft: C.amberSoft },
    { big: String(counts.competitive), label: 'Competitive (under 1.000)', ink: C.indigo, soft: C.indigoSoft },
  ];
  const gap = 10;
  const cw = (CW - gap * 3) / 4;
  cards.forEach((c, i) => {
    const x = M + i * (cw + gap);
    w.roundRect(x, w.y, cw, 76, 10, c.soft);
    w.page.drawText(c.big, { x: x + 12, y: w.y - 38, size: 26, font: w.bold, color: c.ink });
    let ly = w.y - 54;
    for (const line of wrap(c.label, w.bold, 8.5, cw - 22)) {
      w.page.drawText(line, { x: x + 12, y: ly, size: 8.5, font: w.bold, color: C.ink });
      ly -= 11;
    }
  });
  w.y -= 96;

  const stats: Array<[string, string]> = [
    ['Aggregate points', `${d.aggregate.t} of 84`],
    ['Estimated mean grade', d.meanGrade ?? 'Not available'],
    ['Subjects entered', String(Object.keys(d.grades).length)],
  ];
  stats.forEach(([k, v], i) => {
    const x = M + i * ((CW - 2 * gap) / 3 + gap);
    const bw = (CW - 2 * gap) / 3;
    w.roundRect(x, w.y, bw, 50, 8, C.surface);
    w.page.drawText(sanitizeForPdf(k.toUpperCase(), w.bold), { x: x + 12, y: w.y - 17, size: 7.5, font: w.bold, color: C.muted });
    w.page.drawText(sanitizeForPdf(v, w.bold), { x: x + 12, y: w.y - 39, size: 15, font: w.bold, color: C.ink });
  });
  w.y -= 72;

  w.sub('Your KCSE grades', section);
  const counted = new Map(d.aggregate.subjects.map((s) => [s.code, s.points] as const));
  const rows = Object.entries(d.grades)
    .sort(([a], [b]) => (counted.has(b) ? 1 : 0) - (counted.has(a) ? 1 : 0) || a.localeCompare(b))
    .map(([code, grade]) => [
      getSubject(code)?.name ?? code,
      grade,
      String(GRADE_POINTS[grade as keyof typeof GRADE_POINTS] ?? '-'),
      counted.has(code) ? 'Counted in aggregate' : 'Not counted',
    ]);
  w.table(
    [
      { title: 'Subject', width: 230 },
      { title: 'Grade', width: 70, align: 'center', bold: true },
      { title: 'Points', width: 70, align: 'center' },
      { title: 'Aggregate (best seven)', width: CW - 370 },
    ],
    rows,
    section,
    { size: 10, padY: 8 },
  );
  w.notice(
    'Calculation notes: grade points use the 12-point scale (A = 12 ... E = 1). The aggregate uses English, Kiswahili, Mathematics and your best four other subjects, a common description of the KCSE mean-grade subjects that is not stated in the KUCCPS documents supplied to this tool. The mean grade is an estimate, not an official KNEC result.',
    section,
    'info',
  );
}

/* ----------------------------------------------------------- qualifying */
function qualifyingSection(w: Writer, d: ReportData): void {
  const section = 'Qualifying programmes';
  w.newContentPage(section);
  w.heading('All qualifying degree programmes', 'Section 2', section);
  if (d.options.length === 0) {
    w.notice(
      'No programme passed the current checks. Please review the grades you entered, the cutoff dataset and year policy used, and the official KUCCPS placement guidance. No programme is listed unless it meets both the subject requirements and the cutoff rule.',
      section,
    );
    return;
  }
  w.paragraph(
    `${d.options.length} programme-university option(s) meet the published minimum subject requirements and have a cutoff at or below your estimated cluster score. They are listed from the HIGHEST cutoff (the most competitive programme you qualify for) down to the lowest. A * marks a shared minimum cutoff. Programmes below the cutoff are not listed.`,
    section,
    { size: 10 },
  );

  // Legend
  const legendH = 58;
  w.ensure(legendH + 10, section);
  w.roundRect(M, w.y, CW, legendH, 8, C.surface);
  let lx = M + 14;
  w.page.drawText('HOW TO READ THE MARGIN', { x: lx, y: w.y - 16, size: 7.5, font: w.bold, color: C.muted });
  (['safe', 'balanced', 'competitive'] as Level[]).forEach((lv) => {
    const st = LEVEL_STYLE[lv];
    const pw2 = w.pill(st.label, lx, w.y - 24, st.ink, st.soft, 8);
    const hint = lv === 'safe' ? '3.000+ above cutoff' : lv === 'balanced' ? '1.000 to 2.999' : 'under 1.000';
    w.page.drawText(hint, { x: lx + pw2 + 6, y: w.y - 36, size: 8, font: w.regular, color: C.body });
    lx += pw2 + 6 + w.regular.widthOfTextAtSize(hint, 8) + 16;
  });
  w.page.drawText('* Shared minimum: the same cutoff value is printed for many universities, so it is a generic floor, not a university-specific cutoff.', {
    x: M + 14,
    y: w.y - 51,
    size: 8,
    font: w.italic,
    color: C.amber,
  });
  w.y -= legendH + 14;

  const cols = [
    { title: '#', width: 28, align: 'center' as const },
    { title: 'Programme and university', width: 232 },
    { title: 'Code', width: 58, align: 'center' as const },
    { title: 'Your score', width: 54, align: 'right' as const },
    { title: 'Cutoff (year)', width: 66, align: 'right' as const },
    { title: 'Margin', width: CW - 438, align: 'right' as const },
  ];
  const total = cols.reduce((s, c) => s + c.width, 0);
  const padX = 6;
  const padY = 8;

  const header = () => {
    const h = 26;
    w.ensure(h + 60, section);
    w.roundRect(M, w.y, total, h, 5, C.navy2);
    let x = M;
    for (const c of cols) {
      const t = sanitizeForPdf(c.title, w.bold);
      const tw = w.bold.widthOfTextAtSize(t, 9);
      const tx = c.align === 'right' ? x + c.width - padX - tw : c.align === 'center' ? x + (c.width - tw) / 2 : x + padX;
      w.page.drawText(t, { x: tx, y: w.y - 17, size: 9, font: w.bold, color: C.white });
      x += c.width;
    }
    w.y -= h;
  };
  header();

  d.options.forEach((o, i) => {
    const progLines = wrap(readable(o.programmeName), w.bold, 9.5, (cols[1] as { width: number }).width - 2 * padX);
    const uniLines = wrap(readable(o.institutionName), w.regular, 8.5, (cols[1] as { width: number }).width - 2 * padX);
    const h = Math.max(progLines.length * 12.5 + uniLines.length * 11 + 2 * padY + 2, 44);
    if (w.y - h < 64) {
      w.newContentPage(section);
      header();
    }
    const top = w.y;
    if (i % 2 === 1) w.page.drawRectangle({ x: M, y: top - h, width: total, height: h, color: C.zebra });
    w.page.drawRectangle({ x: M, y: top - h, width: total, height: 0.6, color: C.line });

    let x = M;
    // #
    const num = String(i + 1);
    w.page.drawText(num, { x: x + ((cols[0] as { width: number }).width - w.regular.widthOfTextAtSize(num, 8.5)) / 2, y: top - padY - 9, size: 8.5, font: w.regular, color: C.muted });
    x += (cols[0] as { width: number }).width;
    // programme + university
    let ty = top - padY - 9.5;
    for (const l of progLines) {
      w.page.drawText(l, { x: x + padX, y: ty, size: 9.5, font: w.bold, color: C.ink });
      ty -= 12.5;
    }
    ty += 1.5;
    for (const l of uniLines) {
      ty -= 11;
      w.page.drawText(l, { x: x + padX, y: ty + 2, size: 8.5, font: w.regular, color: C.muted });
    }
    x += (cols[1] as { width: number }).width;
    // code
    const cw2 = (cols[2] as { width: number }).width;
    w.page.drawText(o.programmeCode, { x: x + (cw2 - w.mono.widthOfTextAtSize(o.programmeCode, 9)) / 2, y: top - padY - 9, size: 9, font: w.mono, color: C.ink });
    x += cw2;
    // score
    const cw3 = (cols[3] as { width: number }).width;
    const sc = o.score.toFixed(3);
    w.page.drawText(sc, { x: x + cw3 - padX - w.bold.widthOfTextAtSize(sc, 9.5), y: top - padY - 9, size: 9.5, font: w.bold, color: C.ink });
    x += cw3;
    // cutoff + year (+ shared marker)
    const cw4 = (cols[4] as { width: number }).width;
    const cutTxt = o.cutoff + (o.cutoffIsShared ? '*' : '');
    w.page.drawText(cutTxt, { x: x + cw4 - padX - w.regular.widthOfTextAtSize(cutTxt, 9.5), y: top - padY - 9, size: 9.5, font: w.regular, color: o.cutoffIsShared ? C.amber : C.body });
    const yr = String(o.cutoffYear);
    w.page.drawText(yr, { x: x + cw4 - padX - w.regular.widthOfTextAtSize(yr, 8.5), y: top - padY - 21.5, size: 8.5, font: w.regular, color: C.muted });
    x += cw4;
    // margin + level pill
    const cw5 = (cols[5] as { width: number }).width;
    const lv = LEVEL_STYLE[levelOf(o.margin)];
    const mg = `+${o.margin.toFixed(3)}`;
    w.page.drawText(mg, { x: x + cw5 - padX - w.bold.widthOfTextAtSize(mg, 9.5), y: top - padY - 9, size: 9.5, font: w.bold, color: lv.ink });
    const lt = sanitizeForPdf(lv.label, w.bold);
    const pwid = w.bold.widthOfTextAtSize(lt, 7) + 10;
    w.roundRect(x + cw5 - padX - pwid, top - padY - 15, pwid, 12.5, 6.25, lv.soft);
    w.page.drawText(lt, { x: x + cw5 - padX - pwid + 5, y: top - padY - 24, size: 7, font: w.bold, color: lv.ink });
    w.y -= h;
  });
  w.y -= 12;
  w.paragraph('Your score is the estimated cluster score for each programme\'s cluster. The cutoff year is the year of the cutoff actually used for that programme.', section, { size: 9, color: C.muted });
}

/* --------------------------------------------------------------- choices */
function choicesSection(w: Writer, d: ReportData): void {
  const section = 'Application choices';
  w.newContentPage(section);
  w.heading('Your recommended application choices', 'Section 1', section);
  const rec = d.recommendation;
  w.paragraph(
    rec.mode === 'preferences'
      ? 'These choices follow the programme preferences you stated, using only options from your qualifying results.'
      : 'You did not state programme preferences, so the choices below are suggested choices based on your qualifying results, not your personal preference order.',
    section,
  );

  const cols = [
    { title: 'Choice', width: 54 },
    { title: 'Recommended programme', width: 190 },
    { title: 'University', width: 150 },
    { title: 'Programme code', width: CW - 394 },
  ];
  const total = CW;
  const padX = 8;
  const hh = 26;
  w.ensure(hh + 60, section);
  w.roundRect(M, w.y, total, hh, 5, C.navy2);
  let hx = M;
  for (const c of cols) {
    w.page.drawText(sanitizeForPdf(c.title, w.bold), { x: hx + padX, y: w.y - 17, size: 9, font: w.bold, color: C.white });
    hx += c.width;
  }
  w.y -= hh;

  rec.rows.forEach((r, i) => {
    const prog = r.option ? readable(r.option.programmeName) : 'No qualifying option available';
    const uni = r.option ? readable(r.option.institutionName) : '-';
    const pl = wrap(prog, w.bold, 10, (cols[1] as { width: number }).width - 2 * padX);
    const ul = wrap(uni, w.regular, 9.5, (cols[2] as { width: number }).width - 2 * padX);
    const h = Math.max(Math.max(pl.length * 13, ul.length * 12.5) + 24, 50);
    w.ensure(h + 4, section);
    const top = w.y;
    if (i % 2 === 1) w.page.drawRectangle({ x: M, y: top - h, width: total, height: h, color: C.zebra });
    w.page.drawRectangle({ x: M, y: top - h, width: total, height: 0.6, color: C.line });
    // badge
    const isFirst = r.choice.startsWith('1');
    w.roundRect(M + 8, top - (h - 30) / 2, 38, 30, 7, isFirst ? C.violet : C.navy2);
    const lw = w.bold.widthOfTextAtSize(r.choice, 13);
    w.page.drawText(r.choice, { x: M + 8 + (38 - lw) / 2, y: top - (h - 30) / 2 - 20, size: 13, font: w.bold, color: C.white });
    let x = M + (cols[0] as { width: number }).width;
    let ty = top - 18;
    for (const l of pl) {
      w.page.drawText(l, { x: x + padX, y: ty, size: 10, font: w.bold, color: r.option ? C.ink : C.muted });
      ty -= 13;
    }
    x += (cols[1] as { width: number }).width;
    ty = top - 18;
    for (const l of ul) {
      w.page.drawText(l, { x: x + padX, y: ty, size: 9.5, font: w.regular, color: C.body });
      ty -= 12.5;
    }
    x += (cols[2] as { width: number }).width;
    if (r.option) {
      w.page.drawText(r.option.programmeCode, { x: x + padX, y: top - 18, size: 11, font: w.mono, color: C.ink });
      const meta = `Score ${r.option.score.toFixed(3)} | Cutoff ${r.option.cutoff}${r.option.cutoffIsShared ? '*' : ''} (${r.option.cutoffYear})`;
      const ml = wrap(meta, w.regular, 7.5, (cols[3] as { width: number }).width - padX);
      let my = top - 31;
      for (const l of ml) {
        w.page.drawText(l, { x: x + padX, y: my, size: 7.5, font: w.regular, color: C.muted });
        my -= 9.5;
      }
    } else {
      w.page.drawText('-', { x: x + padX, y: top - 18, size: 11, font: w.regular, color: C.muted });
    }
    w.y -= h;
  });
  w.y -= 18;

  w.sub('How the choices were selected', section);
  w.paragraph(rec.method, section, { size: 9.5 });
  for (const n of rec.notes) w.bullet(n, section);
  w.notice(
    'This report does not submit anything to KUCCPS. Review your final choices against the current official KUCCPS application instructions, programme availability and requirements before applying.',
    section,
  );
}

/* ----------------------------------------------------------- methodology */
function methodologySection(w: Writer, d: ReportData): void {
  const section = 'Methodology and disclaimer';
  w.newContentPage(section);
  w.heading('Methodology and important disclaimer', 'Section 4', section);
  w.sub('How your results were produced', section);
  w.bullet(`Cutoff data: ${d.cutoffPolicyLabel}. This prefers, for each programme, the newest cutoff specific to that university; a value marked * is a shared minimum printed identically for many universities. Each listed programme shows the cutoff year actually used, and a missing cutoff is never treated as zero.`, section);
  w.bullet(`Cluster score: ${SCORING_METHODOLOGY.formula}, where r is the sum of your points in the four cluster subjects and t is your aggregate (best seven subjects). This is an ESTIMATE based on a formula published by third parties, not an official KUCCPS score.`, section);
  w.bullet('A programme is listed only when (1) the published minimum subject requirements are met and (2) your estimated cluster score is equal to or greater than the selected cutoff. The comparison uses exact arithmetic, not rounded display values.', section);
  w.bullet('Historical cutoffs describe past cycles and are not a guarantee or prediction of future placement.', section);
  w.bullet('KUCCPS remains the authority for programme requirements, application instructions and placement. Confirm current requirements and programme availability before you apply.', section);
  w.bullet('General KUCCPS guidance, to be confirmed on the official site: degree programmes normally also require a minimum overall KCSE mean grade. This tool applies only the requirements printed in the supplied documents.', section);

  w.sub('Data sources', section);
  for (const s of [d.sources.cluster, d.sources.cutoffs]) {
    const parts = [
      `${s.kind === 'cluster' ? 'Degree programme clusters' : 'Degree programme cutoffs'}: "${s.title ?? s.originalFilename}"`,
      s.cycleLabel ? `printed cycle ${s.cycleLabel}` : null,
      s.copyrightYear ? `copyright ${s.copyrightYear}` : null,
      s.pdfCreationDate ? `PDF file created ${s.pdfCreationDate} (file metadata, not a publication date)` : null,
      `issuer ${s.issuingOrganisation}`,
    ].filter(Boolean);
    w.bullet(parts.join('; ') + '.', section);
  }
  w.paragraph(`Dataset version ${d.datasetVersion}  |  Formula ${SCORING_METHODOLOGY.formulaVersion} (${SCORING_METHODOLOGY.status})  |  Report ${d.reportId}`, section, { size: 8.5, color: C.muted });

  w.sub('Disclaimer', section);
  w.notice(
    'CYMOR CourseChecker is an independent guidance tool. It is not affiliated with KUCCPS and does not guarantee admission, placement or programme availability. Subject groups and the aggregate rule used here follow common convention where the supplied documents are silent; they are listed in the project documentation so they can be verified.',
    section,
  );
  if (d.supportEmail) w.paragraph(`Questions about this report: ${d.supportEmail}`, section, { size: 10 });
}

function finishFooters(w: Writer, d: ReportData): void {
  const pages = w.pdf.getPages();
  const total = pages.length;
  pages.forEach((p, i) => {
    if (i === 0) return;
    p.drawRectangle({ x: M, y: 44, width: CW, height: 0.7, color: C.line });
    const left = sanitizeForPdf(`${d.siteName}   |   Report ${d.reportId.slice(0, 22)}   |   ${fmtDate(d.generatedAt)}`, w.regular);
    p.drawText(left, { x: M, y: 30, size: 8, font: w.regular, color: C.muted });
    const right = `Page ${i + 1} of ${total}`;
    p.drawText(right, { x: A4[0] - M - w.bold.widthOfTextAtSize(right, 8.5), y: 30, size: 8.5, font: w.bold, color: C.ink });
  });
}

export async function generateReportPdf(d: ReportData): Promise<Uint8Array> {
  const w = await Writer.create();
  w.pdf.setTitle('KCSE Degree Eligibility Report');
  w.pdf.setAuthor(sanitizeForPdf(d.siteName, w.regular));
  w.pdf.setSubject(`Report ${d.reportId}`);
  w.pdf.setCreationDate(d.generatedAt);
  w.pdf.setProducer('CYMOR CourseChecker');
  // Order: cover, recommended choices first, then ALL qualifying programmes (highest cutoff first), then profile and method.
  d = { ...d, options: [...d.options].sort((a, b) => b.cutoffValue - a.cutoffValue || a.programmeName.localeCompare(b.programmeName) || a.institutionName.localeCompare(b.institutionName) || a.programmeCode.localeCompare(b.programmeCode)) };
  coverPage(w, d);
  choicesSection(w, d);
  qualifyingSection(w, d);
  glanceSection(w, d);
  methodologySection(w, d);
  finishFooters(w, d);
  return w.pdf.save();
}
