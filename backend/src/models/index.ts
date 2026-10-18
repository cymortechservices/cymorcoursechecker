/**
 * Mongoose models and indexes.
 *
 * Every imported record carries `datasetVersion`, so a draft import lives next to the active
 * dataset without touching it. Only DatasetVersion.activeFlag (unique, sparse) says which
 * version serves candidates, which makes "exactly one active dataset" a database guarantee.
 */
import mongoose, { Schema, InferSchemaType } from 'mongoose';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyModel = mongoose.Model<any>;
/** Reuse an already-registered model (hot reload) or create it. Typed loosely so repository code compiles under strict mode. */
function getModel(name: string, schema: mongoose.Schema): AnyModel {
  return (mongoose.models[name] as AnyModel | undefined) ?? mongoose.model(name, schema);
}

const verification = { type: String, enum: ['validated', 'needs_review', 'rejected'], required: true } as const;

/* ---- Source documents (one per imported PDF) ------------------------------------------- */
const sourceDocumentSchema = new Schema(
  {
    datasetVersion: { type: String, required: true, index: true },
    kind: { type: String, enum: ['cluster', 'cutoffs'], required: true },
    originalFilename: { type: String, required: true },
    title: String,
    issuingOrganisation: String,
    publicationDate: { type: String, default: null },
    cycleLabel: String,
    copyrightYear: Number,
    pdfCreationDate: String,
    pageCount: Number,
    sizeBytes: Number,
    sha256: { type: String, required: true, index: true },
    extractionMethod: String,
    processingStatus: { type: String, enum: ['processed', 'failed'], default: 'processed' },
    validationSummary: Schema.Types.Mixed,
    importedAt: { type: Date, default: Date.now },
  },
  { collection: 'source_documents' },
);

/* ---- Import batches ------------------------------------------------------------------- */
const importBatchSchema = new Schema(
  {
    batchId: { type: String, required: true, unique: true },
    datasetVersion: { type: String, required: true, index: true },
    status: { type: String, enum: ['running', 'completed', 'failed'], required: true },
    actor: String,
    fileHashes: [String],
    quality: Schema.Types.Mixed,
    error: String,
    startedAt: { type: Date, default: Date.now },
    finishedAt: Date,
  },
  { collection: 'import_batches' },
);

/* ---- Dataset versions ----------------------------------------------------------------- */
const datasetVersionSchema = new Schema(
  {
    version: { type: String, required: true, unique: true },
    contentId: { type: String, required: true, index: true },
    status: { type: String, enum: ['draft', 'active', 'archived', 'failed'], required: true },
    /** `true` only on the single active version; unset otherwise (sparse unique index). */
    activeFlag: { type: Boolean },
    previousActive: { type: String },
    quality: Schema.Types.Mixed,
    sources: Schema.Types.Mixed,
    correctionCount: { type: Number, default: 0 },
    createdBy: String,
    createdAt: { type: Date, default: Date.now },
    activatedAt: Date,
    activatedBy: String,
  },
  { collection: 'dataset_versions' },
);
datasetVersionSchema.index({ activeFlag: 1 }, { unique: true, sparse: true });

/* ---- Cluster definitions -------------------------------------------------------------- */
const clusterSchema = new Schema(
  {
    datasetVersion: { type: String, required: true },
    clusterId: { type: Number, required: true },
    name: String,
    /** Four cluster-subject slots with their permitted alternatives (structured). */
    slotRules: [Schema.Types.Mixed],
    sourceDocument: { type: String, default: 'cluster' },
    sourcePage: Number,
    verificationStatus: verification,
    formulaVersion: String,
  },
  { collection: 'clusters' },
);
clusterSchema.index({ datasetVersion: 1, clusterId: 1 }, { unique: true });

/* ---- Sub-cluster minimum subject requirements ------------------------------------------- */
const subClusterSchema = new Schema(
  {
    datasetVersion: { type: String, required: true },
    clusterId: { type: Number, required: true },
    subClusterId: { type: String, required: true },
    /** Structured OR/AND requirement slots (see modules/requirements/grammar.ts). */
    slots: [Schema.Types.Mixed],
    notes: [String],
    verificationStatus: verification,
  },
  { collection: 'subject_requirements' },
);
subClusterSchema.index({ datasetVersion: 1, subClusterId: 1 }, { unique: true });

/* ---- Programmes (one programme-institution combination per record) ---------------------- */
const programmeSchema = new Schema(
  {
    datasetVersion: { type: String, required: true },
    programmeCode: { type: String, required: true, match: /^\d{4}[A-Z0-9]{3}$/ },
    programmeName: { type: String, required: true },
    normalizedProgrammeName: { type: String, required: true },
    institutionCode: { type: String, required: true },
    institutionName: { type: String, required: true },
    qualificationLevel: { type: String, enum: ['degree'], default: 'degree' },
    clusterId: { type: Number, default: null },
    subClusterId: { type: String, default: null },
    matchTier: { type: String, enum: ['exact', 'normalized', 'ambiguous', 'unmatched', 'manual'] },
    verificationStatus: verification,
    issues: [String],
    sourceReferences: [{ document: String, page: Number }],
  },
  { collection: 'programmes', timestamps: true },
);
programmeSchema.index({ datasetVersion: 1, programmeCode: 1, institutionCode: 1 }, { unique: true });
programmeSchema.index({ datasetVersion: 1, verificationStatus: 1 });
programmeSchema.index({ datasetVersion: 1, normalizedProgrammeName: 1 });
programmeSchema.index({ datasetVersion: 1, institutionCode: 1 });
programmeSchema.index({ datasetVersion: 1, subClusterId: 1 });

/* ---- Cutoff history (one document per programme per year) ------------------------------ */
const cutoffSchema = new Schema(
  {
    datasetVersion: { type: String, required: true },
    programmeCode: { type: String, required: true },
    institutionCode: { type: String, required: true },
    year: { type: Number, required: true },
    /** Exactly as printed, e.g. "25.798". Missing values are never stored. */
    raw: { type: String, required: true, match: /^\d{1,3}(\.\d{1,6})?$/ },
    value: { type: Number, required: true },
    shared: { type: Boolean, default: false },
    sourceDocument: { type: String, default: 'cutoffs' },
    sourcePage: Number,
    importBatchId: String,
    verificationStatus: verification,
  },
  { collection: 'cutoffs' },
);
cutoffSchema.index({ datasetVersion: 1, programmeCode: 1, year: 1 }, { unique: true });

/* ---- Manual review queue --------------------------------------------------------------- */
const reviewItemSchema = new Schema(
  {
    datasetVersion: { type: String, required: true },
    programmeCode: { type: String, required: true },
    programmeName: String,
    institutionName: String,
    reason: String,
    detail: String,
    suggestions: [Schema.Types.Mixed],
  },
  { collection: 'review_items' },
);
reviewItemSchema.index({ datasetVersion: 1, programmeCode: 1, reason: 1 });

/* ---- Saved candidate reports (short-lived) --------------------------------------------- */
const reportSchema = new Schema(
  {
    reportId: { type: String, required: true, unique: true },
    tokenHash: { type: String, required: true },
    datasetVersion: { type: String, required: true },
    cutoffPolicy: Schema.Types.Mixed,
    candidate: { name: String, reference: String },
    grades: { type: Map, of: String },
    preferences: [String],
    qualifyingCount: Number,
    createdAt: { type: Date, default: Date.now },
    /** TTL: MongoDB removes the report (and the candidate's grades) when this date passes. */
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  },
  { collection: 'reports' },
);

/* ---- Administrators -------------------------------------------------------------------- */
const adminUserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['admin', 'reviewer'], default: 'admin' },
    failedLogins: { type: Number, default: 0 },
    lockedUntil: Date,
    createdAt: { type: Date, default: Date.now },
    lastLoginAt: Date,
  },
  { collection: 'admin_users' },
);

/* ---- Audit log ------------------------------------------------------------------------- */
const auditSchema = new Schema(
  {
    at: { type: Date, default: Date.now, index: true },
    actor: { type: String, required: true },
    action: { type: String, required: true },
    datasetVersion: String,
    details: Schema.Types.Mixed,
  },
  { collection: 'audit_log' },
);

export const SourceDocumentModel: AnyModel = getModel('SourceDocument', sourceDocumentSchema);
export const ImportBatchModel: AnyModel = getModel('ImportBatch', importBatchSchema);
export const DatasetVersionModel: AnyModel = getModel('DatasetVersion', datasetVersionSchema);
export const ClusterModel: AnyModel = getModel('Cluster', clusterSchema);
export const SubClusterModel: AnyModel = getModel('SubCluster', subClusterSchema);
export const ProgrammeModel: AnyModel = getModel('Programme', programmeSchema);
export const CutoffModel: AnyModel = getModel('Cutoff', cutoffSchema);
export const ReviewItemModel: AnyModel = getModel('ReviewItem', reviewItemSchema);
export const ReportModel: AnyModel = getModel('Report', reportSchema);
export const AdminUserModel: AnyModel = getModel('AdminUser', adminUserSchema);
export const AuditModel: AnyModel = getModel('Audit', auditSchema);

export type ProgrammeDoc = InferSchemaType<typeof programmeSchema>;
