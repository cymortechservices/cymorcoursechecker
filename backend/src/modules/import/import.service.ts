/**
 * Orchestrates PDF analysis: validation of the uploaded files, text extraction, parsing and
 * dataset construction. Pure with respect to storage: persistence is done by the callers
 * (CLI script / admin controller) through the DatasetRepository.
 */
import crypto from 'node:crypto';
import { extractPdfBuffer, pdfDateToIso, ExtractedPdf } from './pdfText';
import { parseClusterDocument } from './clusterDoc.parser';
import { parseCutoffDocument } from './cutoffs.parser';
import { buildDataset, BuiltDataset } from './dataset.builder';

export const MAX_PDF_BYTES = 25 * 1024 * 1024;
export const EXTRACTION_METHOD = 'pdfjs-dist text items with coordinates (table-aware line/column reconstruction)';

export interface SourceDocumentInfo {
  kind: 'cluster' | 'cutoffs';
  originalFilename: string;
  sha256: string;
  sizeBytes: number;
  pageCount: number;
  title?: string;
  issuingOrganisation: string;
  /** Printed cycle label such as "2025/2026", when present in the document body. */
  cycleLabel?: string;
  /** Copyright year printed in the footer. */
  copyrightYear?: number;
  /** PDF file-creation date (file metadata, NOT a publication date). */
  pdfCreationDate?: string;
  /** Publication date is only recorded when printed in the document; otherwise null. */
  publicationDate: string | null;
  footer?: string;
  extractionMethod: string;
}

export class PdfValidationError extends Error {}

export function validatePdfBuffer(buf: Buffer, filename: string): void {
  if (!/\.pdf$/i.test(filename)) throw new PdfValidationError(`"${filename}" does not have a .pdf extension`);
  if (buf.length === 0) throw new PdfValidationError(`"${filename}" is empty`);
  if (buf.length > MAX_PDF_BYTES) throw new PdfValidationError(`"${filename}" exceeds the ${MAX_PDF_BYTES / 1024 / 1024} MB limit`);
  if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') throw new PdfValidationError(`"${filename}" is not a PDF file (missing %PDF header)`);
}

export function sha256(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function describe(kind: 'cluster' | 'cutoffs', filename: string, buf: Buffer, ex: ExtractedPdf): SourceDocumentInfo {
  const heading = ex.firstPageHeading.join(' ');
  const cycle = /(\d{4}\/\d{4})/.exec(heading)?.[1];
  const footer = ex.footerLines[0];
  const copyright = footer ? /(?:Copyright:?\s*(?:KUCCPS,\s*)?|©\s*Copyright\s*)(\d{4})/i.exec(footer)?.[1] : undefined;
  const issuer = /KUCCPS|Kenya Universities and Colleges Central Placement Service/i.test(footer ?? '')
    ? 'Kenya Universities and Colleges Central Placement Service (KUCCPS)'
    : 'unknown (not printed)';
  return {
    kind,
    originalFilename: filename,
    sha256: sha256(buf),
    sizeBytes: buf.length,
    pageCount: ex.metadata.pageCount,
    title: ex.metadata.title,
    issuingOrganisation: issuer,
    cycleLabel: cycle,
    copyrightYear: copyright ? Number(copyright) : undefined,
    pdfCreationDate: pdfDateToIso(ex.metadata.creationDate),
    publicationDate: null,
    footer,
    extractionMethod: EXTRACTION_METHOD,
  };
}

export interface AnalysisResult {
  built: BuiltDataset;
  sources: { cluster: SourceDocumentInfo; cutoffs: SourceDocumentInfo };
  /** Stable id derived from both file hashes: re-importing the same files gives the same id. */
  contentId: string;
}

export async function analysePdfs(input: {
  clusterPdf: Buffer;
  clusterFilename: string;
  cutoffPdf: Buffer;
  cutoffFilename: string;
}): Promise<AnalysisResult> {
  validatePdfBuffer(input.clusterPdf, input.clusterFilename);
  validatePdfBuffer(input.cutoffPdf, input.cutoffFilename);
  const [clusterEx, cutoffEx] = await Promise.all([
    extractPdfBuffer(input.clusterPdf, { segmentGap: 4 }),
    extractPdfBuffer(input.cutoffPdf, { segmentGap: -1 }),
  ]);
  const clusterDoc = parseClusterDocument(clusterEx.lines);
  const cutoffDoc = parseCutoffDocument(cutoffEx.lines);
  if (clusterDoc.clusters.length === 0) throw new PdfValidationError('No cluster definitions were found; is this the degree cluster document?');
  if (cutoffDoc.rows.length === 0) throw new PdfValidationError('No programme rows were found; is this the degree cutoffs document?');
  const built = buildDataset(clusterDoc, cutoffDoc);
  const sources = {
    cluster: describe('cluster', input.clusterFilename, input.clusterPdf, clusterEx),
    cutoffs: describe('cutoffs', input.cutoffFilename, input.cutoffPdf, cutoffEx),
  };
  const contentId = sha256(Buffer.from(sources.cluster.sha256 + sources.cutoffs.sha256)).slice(0, 16);
  return { built, sources, contentId };
}
