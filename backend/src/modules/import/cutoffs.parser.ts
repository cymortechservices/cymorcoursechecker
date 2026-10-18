/**
 * Parser for the KUCCPS "Degree Programme Cut Offs" document.
 *
 * Each data row: "<row #> <programme code>" | institution | programme name | 7 value cells.
 * Value cells are right-aligned in fixed columns under headings "<year> CUTOFF"; a dash or
 * empty cell means "no cutoff reported" and is stored as ABSENT (never as zero).
 * Programme codes are 7 characters: a 4-digit institution prefix + 3 alphanumerics
 * (e.g. 1105101, 1105B61).
 */
import { PdfLine, Segment, lineText } from './pdfText';

export interface RawCutoffRow {
  page: number;
  rowNumber: number;
  programmeCode: string;
  institutionName: string;
  programmeName: string;
  /** year -> printed value; years with a dash/blank are omitted. */
  values: Record<number, string>;
}

export interface CutoffDocParseResult {
  years: number[];
  rows: RawCutoffRow[];
  /** Non-empty lines that were neither header, footer, section title nor data row. */
  unrecognisedLines: Array<{ page: number; text: string }>;
  /** Rows whose cells could not be assigned to columns unambiguously. */
  malformedRows: Array<{ page: number; text: string; reason: string }>;
}

// The row number, code and (often) the institution name sit in one text run.
const ROW_START = /^(\d{1,4})\s+(\d{4}[A-Z0-9]{3})(?:\s+(.*))?$/;
const VALUE = /^\d{1,3}(?:\.\d{1,6})?$/;
const YEAR_HEADING = /(\d{4})\s*CUT\s*OFF/gi;

export function parseCutoffDocument(lines: PdfLine[]): CutoffDocParseResult {
  const res: CutoffDocParseResult = { years: [], rows: [], unrecognisedLines: [], malformedRows: [] };

  // 1) Column geometry: take years and the right-edge centres of the value columns from the
  //    first data page; fall back to the column header text positions.
  const headingLine = lines.find((l) => /2018\s*CUT\s*OFF/i.test(lineText(l)));
  if (headingLine) {
    const text = lineText(headingLine);
    const years: number[] = [];
    for (const m of text.matchAll(YEAR_HEADING)) years.push(Number(m[1]));
    res.years = years;
  }
  if (res.years.length === 0) {
    res.malformedRows.push({ page: 1, text: '', reason: 'Year column headings were not found' });
    return res;
  }

  // Estimate column centres from all numeric cells of well-formed rows.
  const centres = estimateColumnCentres(lines, res.years.length);
  if (!centres) {
    res.malformedRows.push({ page: 1, text: '', reason: 'Could not determine value column positions' });
    return res;
  }

  for (const line of lines) {
    const segs = line.segments;
    const first = segs[0] as Segment | undefined;
    if (!first) continue;
    const text = lineText(line);
    const start = ROW_START.exec(first.text);
    if (first.x < 100 && start) {
      const valueStart = (centres[0] ?? 0) - 28;
      const nameSegs = segs.filter((s) => s.x1 < valueStart + 4);
      const valueSegs = segs.filter((s) => s.x1 >= valueStart + 4);
      const institution = [(start as RegExpExecArray)[3] ?? '', ...nameSegs.slice(1).filter((s) => s.x < 250).map((s) => s.text)]
        .filter(Boolean)
        .join(' ');
      const programme = nameSegs.filter((s) => s.x >= 250).map((s) => s.text).join(' ');
      const values: Record<number, string> = {};
      let bad: string | null = null;
      const seenCol = new Set<number>();
      for (const v of valueSegs) {
        const mid = (v.x + v.x1) / 2;
        let ci = 0;
        let best = Infinity;
        centres.forEach((c, i) => {
          const d = Math.abs(c - mid);
          if (d < best) {
            best = d;
            ci = i;
          }
        });
        if (seenCol.has(ci)) bad = `two cells in column ${res.years[ci]}`;
        seenCol.add(ci);
        const t = v.text.trim();
        if (t === '-' || t === '') continue;
        if (!VALUE.test(t)) {
          bad = `unexpected cell "${t}"`;
          continue;
        }
        values[res.years[ci] as number] = t;
      }
      if (valueSegs.length !== res.years.length) bad = bad ?? `expected ${res.years.length} value cells, found ${valueSegs.length}`;
      if (!institution || !programme) bad = bad ?? 'missing institution or programme name';
      if (bad) res.malformedRows.push({ page: line.page, text, reason: bad });
      res.rows.push({
        page: line.page,
        rowNumber: Number((start as RegExpExecArray)[1]),
        programmeCode: (start as RegExpExecArray)[2] as string,
        institutionName: institution.replace(/\s+/g, ' ').trim(),
        programmeName: programme.replace(/\s+/g, ' ').trim(),
        values,
      });
      continue;
    }
    if (isChromeOrHeading(line, text)) continue;
    res.unrecognisedLines.push({ page: line.page, text });
  }
  return res;
}

function isChromeOrHeading(line: PdfLine, text: string): boolean {
  if (/DEGREE PROGRAMME CUT ?OFFS/i.test(text)) return true;
  if (/Copyright|All Rights Reserved|ISO 9001|Page \d+ of \d+/i.test(text)) return true;
  if (/PROG\s*CODE/i.test(text) && /CUT\s*OFF/i.test(text)) return true;
  // Section title: a single centred text run (programme-group heading such as "BACHELOR OF ARTS").
  const only = line.segments.length === 1 ? (line.segments[0] as Segment) : undefined;
  if (only && only.x > 250) return true;
  return false;
}

function estimateColumnCentres(lines: PdfLine[], nCols: number): number[] | null {
  // Use rows with exactly nCols numeric/dash cells right of x=480; average their centres per column.
  const sums = new Array<number>(nCols).fill(0);
  let n = 0;
  for (const line of lines) {
    const first = line.segments[0];
    if (!first || first.x >= 100 || !ROW_START.test(first.text)) continue;
    const cells = line.segments.filter((s) => s.x >= 480);
    if (cells.length !== nCols) continue;
    cells.forEach((c, i) => {
      sums[i] = (sums[i] as number) + (c.x + c.x1) / 2;
    });
    n++;
  }
  if (n < 10) return null;
  return sums.map((s) => s / n);
}
