import type { BuiltDataset, DataQualityReport, ReviewItem } from '../modules/import/dataset.builder';
import type { SourceDocumentInfo } from '../modules/import/import.service';
import type { ClusterDefinition, ProgrammeRecord, SubClusterRequirement } from '../modules/shared/types';
import type { CandidateGradeMap } from '../modules/shared/types';
import type { CutoffPolicy } from '../modules/eligibility/cutoff';

export type DatasetStatus = 'draft' | 'active' | 'archived' | 'failed';

export interface DatasetMeta {
  version: string;
  contentId: string;
  status: DatasetStatus;
  createdAt: Date;
  activatedAt?: Date;
  activatedBy?: string;
  quality: DataQualityReport;
  sources: { cluster: SourceDocumentInfo; cutoffs: SourceDocumentInfo };
  /** Names of manual corrections applied after import (count only; details in the audit log). */
  correctionCount: number;
}

export interface LoadedDataset {
  meta: DatasetMeta;
  programmes: ProgrammeRecord[];
  clusters: ClusterDefinition[];
  subClusters: SubClusterRequirement[];
}

export interface AuditEntry {
  at: Date;
  actor: string;
  action:
    | 'import'
    | 'import_failed'
    | 'validate'
    | 'correction'
    | 'activate'
    | 'rollback'
    | 'login'
    | 'login_failed';
  datasetVersion?: string;
  details?: Record<string, unknown>;
}

export type Correction =
  | { type: 'map_programme'; programmeCode: string; subClusterId: string }
  | { type: 'reject_programme'; programmeCode: string; reason: string }
  | { type: 'override_requirement_slot'; subClusterId: string; slot: 1 | 2 | 3 | 4; text: string };

export interface CorrectionResult {
  ok: boolean;
  message: string;
}

export interface DatasetRepository {
  getActiveVersion(): Promise<string | null>;
  loadDataset(version: string): Promise<LoadedDataset | null>;
  listVersions(): Promise<DatasetMeta[]>;
  findByContentId(contentId: string): Promise<DatasetMeta | null>;
  /** Stores a new DRAFT dataset. Must never touch the active dataset; cleans up on failure. */
  createDraft(version: string, contentId: string, built: BuiltDataset, sources: DatasetMeta['sources'], actor: string): Promise<DatasetMeta>;
  listReviewItems(version: string, limit: number, skip: number): Promise<{ total: number; items: ReviewItem[] }>;
  applyCorrection(version: string, correction: Correction, actor: string): Promise<CorrectionResult>;
  /** Makes `version` the single active dataset, archiving the previous one. */
  activate(version: string, actor: string): Promise<{ previous: string | null }>;
  /** Re-activates the most recently archived dataset. */
  rollback(actor: string): Promise<{ from: string; to: string }>;
  audit(entry: AuditEntry): Promise<void>;
  listAudit(limit: number): Promise<AuditEntry[]>;
}

export interface StoredReport {
  reportId: string;
  /** SHA-256 of the access token (the token itself is only returned once). */
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  datasetVersion: string;
  cutoffPolicy: CutoffPolicy;
  candidate: { name?: string; reference?: string };
  grades: CandidateGradeMap;
  /** Application-choice preferences supplied by the candidate, if any. */
  preferences: string[];
  qualifyingCount: number;
}

export interface ReportRepository {
  create(report: StoredReport): Promise<void>;
  get(reportId: string): Promise<StoredReport | null>;
}

export interface AdminUser {
  email: string;
  passwordHash: string;
  role: 'admin' | 'reviewer';
  failedLogins: number;
  lockedUntil?: Date;
}

export interface AdminRepository {
  findByEmail(email: string): Promise<AdminUser | null>;
  create(user: Omit<AdminUser, 'failedLogins'>): Promise<void>;
  recordFailure(email: string, lockUntil?: Date): Promise<void>;
  recordSuccess(email: string): Promise<void>;
}
