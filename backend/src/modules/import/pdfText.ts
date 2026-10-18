/**
 * Table-aware PDF text extraction.
 *
 * Uses pdfjs-dist text items (with coordinates) and rebuilds visual lines and
 * column "segments" from their geometry. Plain text extraction loses column
 * boundaries, which makes the two-column programme lists and the cutoff tables
 * unreliable; positions are therefore kept.
 */
import fs from 'node:fs/promises';

export interface Segment {
  /** Left edge (PDF points). */
  x: number;
  /** Right edge (PDF points). */
  x1: number;
  text: string;
}

export interface PdfLine {
  page: number;
  /** Baseline y (PDF points, origin bottom-left). */
  y: number;
  segments: Segment[];
}

export interface PdfMetadata {
  title?: string;
  author?: string;
  creator?: string;
  producer?: string;
  creationDate?: string;
  pageCount: number;
}

export interface ExtractedPdf {
  metadata: PdfMetadata;
  lines: PdfLine[];
  /** Plain text of the first lines of page 1 (title block), for provenance. */
  firstPageHeading: string[];
  /** Footer lines (copyright / page marks) found on page 1. */
  footerLines: string[];
}

interface RawItem {
  str: string;
  x: number;
  x1: number;
  y: number;
}

/** Gap (in points) above which two items on one line start a new column segment. */
export const SEGMENT_GAP = 14;
/** Vertical tolerance for items being on the same visual line. */
export const LINE_TOLERANCE = 2.2;

export function buildLines(items: RawItem[], page: number, segmentGap = SEGMENT_GAP): PdfLine[] {
  const cleaned = items.filter((i) => i.str.trim().length > 0);
  cleaned.sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: { y: number; items: RawItem[] }[] = [];
  for (const it of cleaned) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(last.y - it.y) <= LINE_TOLERANCE) last.items.push(it);
    else rows.push({ y: it.y, items: [it] });
  }
  return rows.map((row) => {
    const sorted = row.items.sort((a, b) => a.x - b.x);
    const segments: Segment[] = [];
    let cur: Segment | null = null;
    for (const it of sorted) {
      if (cur && it.x - cur.x1 <= segmentGap) {
        const gap = it.x - cur.x1;
        cur.text += (gap > 1.2 ? ' ' : '') + it.str.trim();
        cur.x1 = Math.max(cur.x1, it.x1);
      } else {
        cur = { x: it.x, x1: it.x1, text: it.str.trim() };
        segments.push(cur);
      }
    }
    return { page, y: row.y, segments };
  });
}

// pdfjs-dist is ESM-only; load it lazily with a real dynamic import (works from CommonJS output).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pdfjsPromise: Promise<any> | null = null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    const specifier = process.env.PDFJS_MODULE ?? 'pdfjs-dist/legacy/build/pdf.mjs';
    pdfjsPromise = import(specifier);
  }
  return pdfjsPromise;
}

export interface ExtractOptions {
  /** Max horizontal gap (points) inside one column segment. */
  segmentGap?: number;
}

export async function extractPdfBuffer(buffer: Uint8Array, options: ExtractOptions = {}): Promise<ExtractedPdf> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, verbosity: 0 }).promise;
  try {
    const info = (await doc.getMetadata().catch(() => ({ info: {} }))).info ?? {};
    const lines: PdfLine[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const items: RawItem[] = [];
      for (const it of content.items as Array<{ str?: string; transform?: number[]; width?: number }>) {
        if (typeof it.str !== 'string' || !it.transform) continue;
        const x = it.transform[4] ?? 0;
        const y = it.transform[5] ?? 0;
        items.push({ str: it.str, x, x1: x + (it.width ?? 0), y });
      }
      lines.push(...buildLines(items, p, options.segmentGap ?? SEGMENT_GAP));
    }
    const firstPage = lines.filter((l) => l.page === 1);
    const textOf = (l: PdfLine) => l.segments.map((s) => s.text).join(' ');
    return {
      metadata: {
        title: info.Title || undefined,
        author: info.Author || undefined,
        creator: info.Creator || undefined,
        producer: info.Producer || undefined,
        creationDate: info.CreationDate || undefined,
        pageCount: doc.numPages,
      },
      lines,
      firstPageHeading: firstPage.slice(0, 3).map(textOf),
      footerLines: lines.filter((l) => /copyright|all rights reserved/i.test(textOf(l))).map(textOf).slice(0, 4),
    };
  } finally {
    await doc.destroy?.();
  }
}

export async function extractPdfFile(path: string, options: ExtractOptions = {}): Promise<ExtractedPdf> {
  const buf = await fs.readFile(path);
  return extractPdfBuffer(buf, options);
}

export function lineText(line: PdfLine): string {
  return line.segments.map((s) => s.text).join(' ');
}

/** Parse a PDF date string such as D:20260407174319Z00'00' into an ISO date (YYYY-MM-DD). */
export function pdfDateToIso(value?: string): string | undefined {
  if (!value) return undefined;
  const m = /^D:(\d{4})(\d{2})(\d{2})/.exec(value);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : undefined;
}
