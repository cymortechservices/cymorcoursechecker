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
    | 'login_failed'
    | 'coupon_created'
    | 'coupon_updated';
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

/* ------------------------------------------------------------------ orders / payments */
export type OrderStatus = 'unpaid' | 'pending' | 'paid' | 'failed' | 'cancelled';

/** One row per generated report. Kept (without grades) after the report itself expires, for accounting. */
export interface Order {
  reportId: string;
  createdAt: Date;
  email: string;
  candidateName?: string;
  datasetVersion: string;
  qualifyingCount: number;
  status: OrderStatus;
  /** Price in KES before any coupon. */
  listPrice: number;
  /** Amount actually charged in KES (after coupon). */
  amountDue: number;
  couponCode?: string;
  discountPercent?: number;
  checkoutRequestId?: string;
  merchantRequestId?: string;
  /** Last digits only, e.g. "2547******12". The full number is never stored. */
  phoneMasked?: string;
  mpesaReceipt?: string;
  paidAt?: Date;
  failureReason?: string;
  lastStkAt?: Date;
  emailStatus: 'none' | 'sent' | 'failed' | 'skipped';
  emailSentAt?: Date;
}

export interface PeriodStats {
  reports: number;
  paid: number;
  revenue: number;
}

export interface OrderStats {
  reportsGenerated: number;
  paidCount: number;
  pendingCount: number;
  revenue: number;
  conversionRate: number;
  freeUnlocks: number;
  today: PeriodStats;
  last7Days: PeriodStats;
  last30Days: PeriodStats;
  daily: Array<{ date: string; reports: number; paid: number; revenue: number }>;
  topCoupons: Array<{ code: string; uses: number }>;
}

export interface OrderListFilter {
  status?: OrderStatus;
  q?: string;
  limit: number;
  skip: number;
}

export interface OrderRepository {
  create(order: Order): Promise<void>;
  get(reportId: string): Promise<Order | null>;
  getByCheckoutRequestId(checkoutRequestId: string): Promise<Order | null>;
  update(reportId: string, patch: Partial<Order>): Promise<Order | null>;
  /** Atomically moves an order to `paid` only if it is not already paid. Returns the order if THIS call paid it. */
  markPaidOnce(reportId: string, patch: Partial<Order>): Promise<Order | null>;
  list(filter: OrderListFilter): Promise<{ total: number; items: Order[] }>;
  stats(now: Date): Promise<OrderStats>;
}

export interface Coupon {
  code: string;
  percentOff: number;
  active: boolean;
  maxUses?: number;
  expiresAt?: Date;
  usedCount: number;
  note?: string;
  createdAt: Date;
  createdBy: string;
}

export interface CouponRepository {
  create(coupon: Coupon): Promise<void>;
  get(code: string): Promise<Coupon | null>;
  list(): Promise<Coupon[]>;
  setActive(code: string, active: boolean): Promise<Coupon | null>;
  incrementUsed(code: string): Promise<void>;
}
