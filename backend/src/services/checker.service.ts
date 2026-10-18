/**
 * Course-checker use cases: validate input, run the eligibility pipeline against the active
 * dataset, persist a short-lived report, page/filter/sort results, build the PDF.
 * Business rules live in modules/*; this layer only orchestrates and enforces access.
 */
import crypto from 'node:crypto';
import { DatasetCache } from './datasetCache';
import type { ReportRepository, StoredReport } from '../repositories/types';
import { evaluateCandidate, EligibilityResult, QualifyingOption } from '../modules/eligibility/eligibility.service';
import { CutoffPolicy, DEFAULT_CUTOFF_POLICY, describePolicy } from '../modules/eligibility/cutoff';
import { GradeEntry, validateCandidateGrades } from '../modules/subjects/gradeInput';
import { FORMULA_VERSION, FORMULA_STATUS, meanGradeFromAggregate } from '../modules/scoring/clusterScore.service';
import { recommendChoices, Recommendation } from '../modules/recommendations/recommendations.service';
import { generateReportPdf } from '../modules/pdf/report.pdf';
import { badRequest, notFound, forbidden, AppError } from '../utils/errors';

export interface CheckerInput {
  candidate: { name?: string; reference?: string };
  grades: GradeEntry[];
  preferences?: string[];
  cutoffPolicy?: CutoffPolicy;
}

export interface ResultsQuery {
  page: number;
  pageSize: number;
  q?: string;
  institution?: string;
  competitiveness?: 'safe' | 'balanced' | 'competitive';
  sort: 'margin' | 'score' | 'cutoff' | 'programme' | 'institution';
  order: 'asc' | 'desc';
}

export interface PublicOption {
  programmeCode: string;
  programmeName: string;
  institutionCode: string;
  institutionName: string;
  clusterId: number;
  subClusterId: string;
  score: number;
  scoreDisplay: string;
  cutoff: string;
  cutoffYear: number;
  /** 'shared-minimum': the same value is printed for many universities (generic floor). */
  cutoffBasis: 'programme-specific' | 'shared-minimum';
  margin: number;
  marginDisplay: string;
  eligibilityStatus: 'meets_subject_requirements_and_cutoff';
  explanation: string;
  clusterSubjects: Array<{ slot: number; subject: string; points: number }>;
  requirementMatches: Array<{ slot: number; subject: string; grade: string; required: string }>;
}

export const SAFE_MARGIN = 3; // >= 3.000 above cutoff
export const BALANCED_MARGIN = 1; // 1.000 - 2.999

export function competitivenessOf(margin: number): 'safe' | 'balanced' | 'competitive' {
  return margin >= SAFE_MARGIN ? 'safe' : margin >= BALANCED_MARGIN ? 'balanced' : 'competitive';
}

export function toPublic(o: QualifyingOption): PublicOption {
  return {
    programmeCode: o.programmeCode,
    programmeName: o.programmeName,
    institutionCode: o.institutionCode,
    institutionName: o.institutionName,
    clusterId: o.clusterId,
    subClusterId: o.subClusterId,
    score: o.score,
    scoreDisplay: o.score.toFixed(3),
    cutoff: o.cutoff,
    cutoffYear: o.cutoffYear,
    cutoffBasis: o.cutoffIsShared ? 'shared-minimum' : 'programme-specific',
    margin: o.margin,
    marginDisplay: o.margin.toFixed(3),
    eligibilityStatus: 'meets_subject_requirements_and_cutoff',
    explanation: o.explanation,
    clusterSubjects: o.clusterSubjects,
    requirementMatches: o.requirementMatches,
  };
}

export function filterSortPage(options: readonly QualifyingOption[], q: ResultsQuery) {
  let list = [...options];
  if (q.q) {
    const needle = q.q.toLowerCase();
    list = list.filter((o) => `${o.programmeName} ${o.institutionName} ${o.programmeCode}`.toLowerCase().includes(needle));
  }
  if (q.institution) list = list.filter((o) => o.institutionCode === q.institution);
  if (q.competitiveness) list = list.filter((o) => competitivenessOf(o.margin) === q.competitiveness);
  const dir = q.order === 'asc' ? 1 : -1;
  const cmp: Record<ResultsQuery['sort'], (a: QualifyingOption, b: QualifyingOption) => number> = {
    margin: (a, b) => a.margin - b.margin,
    score: (a, b) => a.score - b.score,
    cutoff: (a, b) => a.cutoffValue - b.cutoffValue,
    programme: (a, b) => a.programmeName.localeCompare(b.programmeName),
    institution: (a, b) => a.institutionName.localeCompare(b.institutionName),
  };
  list.sort((a, b) => dir * cmp[q.sort](a, b) || a.programmeCode.localeCompare(b.programmeCode));
  const total = list.length;
  const start = (q.page - 1) * q.pageSize;
  return { total, page: q.page, pageSize: q.pageSize, totalPages: Math.max(1, Math.ceil(total / q.pageSize)), items: list.slice(start, start + q.pageSize).map(toPublic) };
}

export interface CheckerDeps {
  datasets: DatasetCache;
  reports: ReportRepository;
  reportTtlDays: number;
  siteName: string;
  supportEmail?: string;
  now?: () => Date;
}

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export class CheckerService {
  constructor(private readonly deps: CheckerDeps) {}
  private now() {
    return this.deps.now ? this.deps.now() : new Date();
  }

  validate(input: Pick<CheckerInput, 'grades'>) {
    const v = validateCandidateGrades(input.grades);
    return v;
  }

  private async evaluate(report: Pick<StoredReport, 'datasetVersion' | 'grades' | 'cutoffPolicy'>) {
    const ds = await this.deps.datasets.get(report.datasetVersion);
    if (!ds) throw new AppError(410, 'DATASET_UNAVAILABLE', 'The dataset used for this report is no longer available');
    const result = evaluateCandidate(report.grades, ds.loaded.programmes, ds.view, { cutoffPolicy: report.cutoffPolicy });
    return { ds, result };
  }

  private summarise(result: EligibilityResult, datasetVersion: string) {
    const years: Record<string, number> = {};
    for (const o of result.options) years[o.cutoffYear] = (years[o.cutoffYear] ?? 0) + 1;
    const d = result.diagnostics;
    return {
      qualifyingOptions: result.options.length,
      aggregatePoints: result.aggregate.t,
      estimatedMeanGrade: meanGradeFromAggregate(result.aggregate.t),
      cutoffYearsUsed: years,
      sharedCutoffOptions: result.options.filter((o) => o.cutoffIsShared).length,
      /** Programmes that could not be assessed because reference data is incomplete (not the candidate's fault). */
      notAssessable: d.skipped.not_validated + d.skipped.no_cluster_mapping + d.skipped.requirements_unusable + d.skipped.cluster_definition_unusable + d.skipped.no_cutoff_available,
      evaluatedRecords: d.evaluated,
      datasetVersion,
    };
  }

  async run(input: CheckerInput, pageQuery: ResultsQuery) {
    const v = validateCandidateGrades(input.grades);
    if (!v.ok) throw badRequest('Some grades are missing or invalid', v.errors);
    const ds = await this.deps.datasets.active();
    const policy = input.cutoffPolicy ?? DEFAULT_CUTOFF_POLICY;
    const reportId = crypto.randomBytes(16).toString('base64url');
    const token = crypto.randomBytes(24).toString('base64url');
    const created = this.now();
    const stored: StoredReport = {
      reportId,
      tokenHash: sha256(token),
      createdAt: created,
      expiresAt: new Date(created.getTime() + this.deps.reportTtlDays * 86_400_000),
      datasetVersion: ds.loaded.meta.version,
      cutoffPolicy: policy,
      candidate: { name: input.candidate.name?.trim() || undefined, reference: input.candidate.reference?.trim() || undefined },
      grades: v.grades,
      preferences: (input.preferences ?? []).slice(0, 10),
      qualifyingCount: 0,
    };
    const result = evaluateCandidate(stored.grades, ds.loaded.programmes, ds.view, { cutoffPolicy: policy });
    if (!result.aggregate.ok) throw badRequest(result.aggregate.reason ?? 'Aggregate could not be computed');
    stored.qualifyingCount = result.options.length;
    await this.deps.reports.create(stored);
    return {
      reportId,
      accessToken: token,
      expiresAt: stored.expiresAt.toISOString(),
      datasetVersion: stored.datasetVersion,
      cutoffPolicy: describePolicy(policy),
      formulaVersion: FORMULA_VERSION,
      formulaStatus: FORMULA_STATUS,
      scoreIsEstimate: true as const,
      warnings: v.warnings,
      summary: this.summarise(result, stored.datasetVersion),
      results: filterSortPage(result.options, pageQuery),
      diagnostics: result.diagnostics,
    };
  }

  private async authorise(reportId: string, token: string | undefined): Promise<StoredReport> {
    const report = await this.deps.reports.get(reportId);
    if (!report) throw notFound('Report not found or expired');
    if (!token) throw forbidden('A report access token is required');
    const a = Buffer.from(sha256(token), 'hex');
    const b = Buffer.from(report.tokenHash, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw forbidden('Invalid report access token');
    return report;
  }

  async getResults(reportId: string, token: string | undefined, query: ResultsQuery) {
    const report = await this.authorise(reportId, token);
    const { result } = await this.evaluate(report);
    return {
      reportId,
      datasetVersion: report.datasetVersion,
      cutoffPolicy: describePolicy(report.cutoffPolicy),
      formulaVersion: FORMULA_VERSION,
      scoreIsEstimate: true as const,
      summary: this.summarise(result, report.datasetVersion),
      results: filterSortPage(result.options, query),
    };
  }

  async getRecommendations(reportId: string, token: string | undefined): Promise<Recommendation> {
    const report = await this.authorise(reportId, token);
    const { result } = await this.evaluate(report);
    return recommendChoices(result.options, report.preferences);
  }

  async buildPdf(reportId: string, token: string | undefined): Promise<{ bytes: Uint8Array; filename: string }> {
    const report = await this.authorise(reportId, token);
    const { ds, result } = await this.evaluate(report);
    if (!result.aggregate.ok) throw badRequest('Report cannot be generated for this candidate');
    const rec = recommendChoices(result.options, report.preferences);
    const years = [...new Set(result.options.map((o) => o.cutoffYear))].sort();
    try {
      const bytes = await generateReportPdf({
        siteName: this.deps.siteName,
        supportEmail: this.deps.supportEmail,
        reportId: report.reportId,
        generatedAt: this.now(),
        datasetVersion: report.datasetVersion,
        cutoffPolicyLabel: describePolicy(report.cutoffPolicy),
        candidateName: report.candidate.name,
        candidateReference: report.candidate.reference,
        grades: report.grades,
        aggregate: { t: result.aggregate.t, subjects: result.aggregate.subjects },
        meanGrade: meanGradeFromAggregate(result.aggregate.t),
        options: result.options,
        recommendation: rec,
        sources: ds.loaded.meta.sources,
        cutoffYearsUsed: years,
      });
      return { bytes, filename: `CYMOR-KCSE-Degree-Report-${report.reportId.slice(0, 8)}.pdf` };
    } catch {
      throw new AppError(500, 'PDF_FAILED', 'The report could not be generated. Please try again.');
    }
  }
}
