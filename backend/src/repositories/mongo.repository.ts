/**
 * MongoDB (Mongoose) implementations of the repository interfaces.
 * NOTE: written for Mongoose 8 / MongoDB Atlas. Not executed in the build sandbox (no registry
 * access); see docs/TESTING.md for what was and was not verified.
 */
import mongoose from 'mongoose';
import {
  AdminUserModel,
  AuditModel,
  ClusterModel,
  CutoffModel,
  DatasetVersionModel,
  ImportBatchModel,
  ProgrammeModel,
  ReportModel,
  ReviewItemModel,
  SourceDocumentModel,
  SubClusterModel,
} from '../models';
import type {
  AdminRepository,
  AdminUser,
  AuditEntry,
  Correction,
  CorrectionResult,
  DatasetMeta,
  DatasetRepository,
  LoadedDataset,
  ReportRepository,
  StoredReport,
} from './types';
import type { BuiltDataset, ReviewItem } from '../modules/import/dataset.builder';
import type { ClusterDefinition, ProgrammeRecord, SubClusterRequirement } from '../modules/shared/types';
import { key2 } from '../modules/import/nameMatch';
import { mapProgramme, overrideRequirementSlot, revalidateForSubCluster } from '../modules/import/corrections';
import crypto from 'node:crypto';

/* eslint-disable @typescript-eslint/no-explicit-any */
const CHUNK = 1000;

function chunks<T>(arr: T[], n = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function toMeta(d: any): DatasetMeta {
  return {
    version: d.version,
    contentId: d.contentId,
    status: d.status,
    createdAt: d.createdAt,
    activatedAt: d.activatedAt ?? undefined,
    activatedBy: d.activatedBy ?? undefined,
    quality: d.quality,
    sources: d.sources,
    correctionCount: d.correctionCount ?? 0,
  };
}

export class MongoDatasetRepository implements DatasetRepository {
  async getActiveVersion(): Promise<string | null> {
    const d: any = await DatasetVersionModel.findOne({ activeFlag: true }).select('version').lean();
    return d?.version ?? null;
  }

  async listVersions(): Promise<DatasetMeta[]> {
    const docs: any[] = await DatasetVersionModel.find({}).sort({ createdAt: 1 }).lean();
    return docs.map(toMeta);
  }

  async findByContentId(contentId: string): Promise<DatasetMeta | null> {
    const d: any = await DatasetVersionModel.findOne({ contentId, status: { $ne: 'failed' } }).lean();
    return d ? toMeta(d) : null;
  }

  async loadDataset(version: string): Promise<LoadedDataset | null> {
    const vd: any = await DatasetVersionModel.findOne({ version }).lean();
    if (!vd) return null;
    const [programmes, cutoffs, clusters, subs]: any[][] = await Promise.all([
      ProgrammeModel.find({ datasetVersion: version }).lean(),
      CutoffModel.find({ datasetVersion: version }).lean(),
      ClusterModel.find({ datasetVersion: version }).lean(),
      SubClusterModel.find({ datasetVersion: version }).lean(),
    ]);
    const byCode = new Map<string, any[]>();
    for (const c of cutoffs) {
      const list = byCode.get(c.programmeCode) ?? [];
      list.push({ year: c.year, raw: c.raw, value: c.value, sourcePage: c.sourcePage ?? 0, shared: Boolean(c.shared) });
      byCode.set(c.programmeCode, list);
    }
    const recs: ProgrammeRecord[] = programmes.map((p) => ({
      programmeCode: p.programmeCode,
      programmeName: p.programmeName,
      institutionCode: p.institutionCode,
      institutionName: p.institutionName,
      clusterId: p.clusterId ?? null,
      subClusterId: p.subClusterId ?? null,
      cutoffs: (byCode.get(p.programmeCode) ?? []).sort((a, b) => a.year - b.year),
      verificationStatus: p.verificationStatus,
      issues: p.issues ?? [],
    }));
    return {
      meta: toMeta(vd),
      programmes: recs,
      clusters: clusters.map((c): ClusterDefinition => ({ clusterId: c.clusterId, slotRules: c.slotRules, sourcePage: c.sourcePage ?? 0, verificationStatus: c.verificationStatus })),
      subClusters: subs.map((s): SubClusterRequirement => ({ clusterId: s.clusterId, subClusterId: s.subClusterId, slots: s.slots, notes: s.notes ?? [], verificationStatus: s.verificationStatus })),
    };
  }

  async createDraft(version: string, contentId: string, built: BuiltDataset, sources: DatasetMeta['sources'], actor: string): Promise<DatasetMeta> {
    const batchId = crypto.randomBytes(8).toString('hex');
    await ImportBatchModel.create({ batchId, datasetVersion: version, status: 'running', actor, fileHashes: [sources.cluster.sha256, sources.cutoffs.sha256] });
    try {
      await ClusterModel.insertMany(
        built.clusters.map((c) => ({ datasetVersion: version, clusterId: c.clusterId, slotRules: c.slotRules, sourcePage: c.sourcePage, verificationStatus: c.verificationStatus, formulaVersion: 'kuccps-weighted-cluster-v1' })),
      );
      await SubClusterModel.insertMany(
        built.subClusters.map((s) => ({ datasetVersion: version, clusterId: s.clusterId, subClusterId: s.subClusterId, slots: s.slots, notes: s.notes, verificationStatus: s.verificationStatus })),
      );
      for (const part of chunks(built.programmes)) {
        await ProgrammeModel.insertMany(
          part.map((p) => ({
            datasetVersion: version,
            programmeCode: p.programmeCode,
            programmeName: p.programmeName,
            normalizedProgrammeName: key2(p.programmeName),
            institutionCode: p.institutionCode,
            institutionName: p.institutionName,
            clusterId: p.clusterId,
            subClusterId: p.subClusterId,
            matchTier: built.matchTiers[p.programmeCode],
            verificationStatus: p.verificationStatus,
            issues: p.issues,
            sourceReferences: [{ document: 'cutoffs', page: p.cutoffs[0]?.sourcePage ?? 0 }],
          })),
          { ordered: false },
        );
      }
      const cutoffDocs = built.programmes.flatMap((p) =>
        p.cutoffs.map((c) => ({
          datasetVersion: version,
          programmeCode: p.programmeCode,
          institutionCode: p.institutionCode,
          year: c.year,
          raw: c.raw,
          value: c.value,
          shared: Boolean(c.shared),
          sourcePage: c.sourcePage,
          importBatchId: batchId,
          verificationStatus: p.verificationStatus,
        })),
      );
      for (const part of chunks(cutoffDocs)) await CutoffModel.insertMany(part, { ordered: false });
      for (const part of chunks(built.reviewQueue)) {
        await ReviewItemModel.insertMany(part.map((r) => ({ datasetVersion: version, ...r })), { ordered: false });
      }
      for (const s of [sources.cluster, sources.cutoffs]) {
        await SourceDocumentModel.create({ datasetVersion: version, ...s, validationSummary: built.quality, processingStatus: 'processed' });
      }
      // The version record is written LAST: until it exists nothing can serve this data.
      const created: any = await DatasetVersionModel.create({ version, contentId, status: 'draft', quality: built.quality, sources, createdBy: actor, correctionCount: 0 });
      await ImportBatchModel.updateOne({ batchId }, { status: 'completed', finishedAt: new Date(), quality: built.quality });
      await this.audit({ at: new Date(), actor, action: 'import', datasetVersion: version, details: { batchId, programmes: built.programmes.length } });
      return toMeta(created.toObject());
    } catch (e) {
      // Remove everything written for this draft; the active dataset is untouched.
      await Promise.allSettled([
        ClusterModel.deleteMany({ datasetVersion: version }),
        SubClusterModel.deleteMany({ datasetVersion: version }),
        ProgrammeModel.deleteMany({ datasetVersion: version }),
        CutoffModel.deleteMany({ datasetVersion: version }),
        ReviewItemModel.deleteMany({ datasetVersion: version }),
        SourceDocumentModel.deleteMany({ datasetVersion: version }),
        DatasetVersionModel.deleteMany({ version, status: 'draft' }),
      ]);
      await ImportBatchModel.updateOne({ batchId }, { status: 'failed', finishedAt: new Date(), error: (e as Error).message.slice(0, 500) });
      throw e;
    }
  }

  async listReviewItems(version: string, limit: number, skip: number) {
    // Only items whose programme is still not validated.
    const open: any[] = await ProgrammeModel.find({ datasetVersion: version, verificationStatus: { $ne: 'validated' } }).select('programmeCode').lean();
    const codes = open.map((o) => o.programmeCode);
    const filter = { datasetVersion: version, programmeCode: { $in: codes } };
    const [total, items] = await Promise.all([
      ReviewItemModel.countDocuments(filter),
      ReviewItemModel.find(filter).sort({ programmeCode: 1 }).skip(skip).limit(limit).lean(),
    ]);
    return {
      total,
      items: (items as any[]).map((r): ReviewItem => ({ programmeCode: r.programmeCode, programmeName: r.programmeName, institutionName: r.institutionName, reason: r.reason, detail: r.detail, suggestions: r.suggestions ?? [] })),
    };
  }

  async applyCorrection(version: string, c: Correction, actor: string): Promise<CorrectionResult> {
    const vd: any = await DatasetVersionModel.findOne({ version });
    if (!vd) return { ok: false, message: 'Unknown dataset version' };
    if (vd.status !== 'draft') return { ok: false, message: 'Only draft datasets can be corrected' };
    const clusterDocs: any[] = await ClusterModel.find({ datasetVersion: version }).lean();
    const subDocs: any[] = await SubClusterModel.find({ datasetVersion: version }).lean();
    const clusters = new Map<number, ClusterDefinition>(clusterDocs.map((x) => [x.clusterId, { clusterId: x.clusterId, slotRules: x.slotRules, sourcePage: x.sourcePage ?? 0, verificationStatus: x.verificationStatus }] as const));
    const toSub = (x: any): SubClusterRequirement => ({ clusterId: x.clusterId, subClusterId: x.subClusterId, slots: x.slots, notes: x.notes ?? [], verificationStatus: x.verificationStatus });
    const subs = new Map<string, SubClusterRequirement>(subDocs.map((x) => [x.subClusterId, toSub(x)] as const));
    let result: CorrectionResult;

    if (c.type === 'map_programme') {
      const p: any = await ProgrammeModel.findOne({ datasetVersion: version, programmeCode: c.programmeCode }).lean();
      if (!p) return { ok: false, message: 'Unknown programme code' };
      const rec: ProgrammeRecord = { programmeCode: p.programmeCode, programmeName: p.programmeName, institutionCode: p.institutionCode, institutionName: p.institutionName, clusterId: p.clusterId ?? null, subClusterId: p.subClusterId ?? null, cutoffs: [], verificationStatus: p.verificationStatus, issues: p.issues ?? [] };
      const r = mapProgramme(rec, c.subClusterId, subs, clusters);
      if (r.ok && r.programme) {
        await ProgrammeModel.updateOne({ datasetVersion: version, programmeCode: c.programmeCode }, { clusterId: r.programme.clusterId, subClusterId: r.programme.subClusterId, issues: r.programme.issues, verificationStatus: r.programme.verificationStatus, matchTier: 'manual' });
        await CutoffModel.updateMany({ datasetVersion: version, programmeCode: c.programmeCode }, { verificationStatus: r.programme.verificationStatus });
      }
      result = { ok: r.ok, message: r.message };
    } else if (c.type === 'reject_programme') {
      const res = await ProgrammeModel.updateOne({ datasetVersion: version, programmeCode: c.programmeCode }, { verificationStatus: 'rejected', $push: { issues: `rejected manually: ${c.reason}` } });
      result = res.matchedCount ? { ok: true, message: 'Programme rejected' } : { ok: false, message: 'Unknown programme code' };
    } else {
      const sub = subs.get(c.subClusterId);
      if (!sub) return { ok: false, message: 'Unknown sub-cluster' };
      const r = overrideRequirementSlot(sub, c.slot, c.text);
      if (r.ok && r.subCluster) {
        await SubClusterModel.updateOne({ datasetVersion: version, subClusterId: c.subClusterId }, { slots: r.subCluster.slots, notes: r.subCluster.notes, verificationStatus: r.subCluster.verificationStatus });
        const waiting: any[] = await ProgrammeModel.find({ datasetVersion: version, subClusterId: c.subClusterId, verificationStatus: { $ne: 'validated' } }).lean();
        const recs: ProgrammeRecord[] = waiting.map((p) => ({ programmeCode: p.programmeCode, programmeName: p.programmeName, institutionCode: p.institutionCode, institutionName: p.institutionName, clusterId: p.clusterId ?? null, subClusterId: p.subClusterId ?? null, cutoffs: [], verificationStatus: p.verificationStatus, issues: p.issues ?? [] }));
        for (const changed of revalidateForSubCluster(recs, r.subCluster)) {
          await ProgrammeModel.updateOne({ datasetVersion: version, programmeCode: changed.programmeCode }, { issues: changed.issues, verificationStatus: changed.verificationStatus });
        }
      }
      result = { ok: r.ok, message: r.message };
    }
    if (result.ok) {
      await DatasetVersionModel.updateOne({ version }, { $inc: { correctionCount: 1 } });
      await this.audit({ at: new Date(), actor, action: 'correction', datasetVersion: version, details: { ...c } });
    }
    return result;
  }

  async activate(version: string, actor: string): Promise<{ previous: string | null }> {
    const session = await mongoose.startSession();
    try {
      let previous: string | null = null;
      await session.withTransaction(async () => {
        const target: any = await DatasetVersionModel.findOne({ version }).session(session);
        if (!target || target.status === 'failed') throw new Error('Dataset not found or failed');
        const current: any = await DatasetVersionModel.findOne({ activeFlag: true }).session(session);
        previous = current?.version ?? null;
        if (current) await DatasetVersionModel.updateOne({ _id: current._id }, { status: 'archived', $unset: { activeFlag: '' } }, { session });
        await DatasetVersionModel.updateOne({ _id: target._id }, { status: 'active', activeFlag: true, previousActive: previous, activatedAt: new Date(), activatedBy: actor }, { session });
      });
      await this.audit({ at: new Date(), actor, action: 'activate', datasetVersion: version, details: { previous } });
      return { previous };
    } finally {
      await session.endSession();
    }
  }

  async rollback(actor: string): Promise<{ from: string; to: string }> {
    const session = await mongoose.startSession();
    try {
      let result: { from: string; to: string } | null = null;
      await session.withTransaction(async () => {
        const current: any = await DatasetVersionModel.findOne({ activeFlag: true }).session(session);
        if (!current) throw new Error('No active dataset');
        if (!current.previousActive) throw new Error('No previous dataset to roll back to');
        const prev: any = await DatasetVersionModel.findOne({ version: current.previousActive, status: 'archived' }).session(session);
        if (!prev) throw new Error('The previous dataset is no longer available');
        await DatasetVersionModel.updateOne({ _id: current._id }, { status: 'archived', $unset: { activeFlag: '' } }, { session });
        await DatasetVersionModel.updateOne({ _id: prev._id }, { status: 'active', activeFlag: true, activatedAt: new Date(), activatedBy: actor }, { session });
        result = { from: current.version, to: prev.version };
      });
      if (!result) throw new Error('Rollback failed');
      await this.audit({ at: new Date(), actor, action: 'rollback', datasetVersion: (result as { to: string }).to, details: { from: (result as { from: string }).from } });
      return result;
    } finally {
      await session.endSession();
    }
  }

  async audit(e: AuditEntry): Promise<void> {
    await AuditModel.create(e);
  }

  async listAudit(limit: number): Promise<AuditEntry[]> {
    const docs: any[] = await AuditModel.find({}).sort({ at: -1 }).limit(limit).lean();
    return docs.map((d) => ({ at: d.at, actor: d.actor, action: d.action, datasetVersion: d.datasetVersion, details: d.details }));
  }
}

export class MongoReportRepository implements ReportRepository {
  async create(r: StoredReport): Promise<void> {
    await ReportModel.create({ ...r, grades: new Map(Object.entries(r.grades)) });
  }
  async get(reportId: string): Promise<StoredReport | null> {
    const d: any = await ReportModel.findOne({ reportId, expiresAt: { $gt: new Date() } }).lean();
    if (!d) return null;
    const grades: Record<string, any> = d.grades instanceof Map ? Object.fromEntries(d.grades) : { ...d.grades };
    return {
      reportId: d.reportId,
      tokenHash: d.tokenHash,
      createdAt: d.createdAt,
      expiresAt: d.expiresAt,
      datasetVersion: d.datasetVersion,
      cutoffPolicy: d.cutoffPolicy,
      candidate: { name: d.candidate?.name ?? undefined, reference: d.candidate?.reference ?? undefined },
      grades,
      preferences: d.preferences ?? [],
      qualifyingCount: d.qualifyingCount ?? 0,
    };
  }
}

export class MongoAdminRepository implements AdminRepository {
  async findByEmail(email: string): Promise<AdminUser | null> {
    const u: any = await AdminUserModel.findOne({ email: email.toLowerCase() }).lean();
    return u ? { email: u.email, passwordHash: u.passwordHash, role: u.role, failedLogins: u.failedLogins ?? 0, lockedUntil: u.lockedUntil ?? undefined } : null;
  }
  async create(user: Omit<AdminUser, 'failedLogins'>): Promise<void> {
    await AdminUserModel.create({ email: user.email.toLowerCase(), passwordHash: user.passwordHash, role: user.role });
  }
  async recordFailure(email: string, lockUntil?: Date): Promise<void> {
    await AdminUserModel.updateOne({ email: email.toLowerCase() }, { $inc: { failedLogins: 1 }, ...(lockUntil ? { lockedUntil: lockUntil } : {}) });
  }
  async recordSuccess(email: string): Promise<void> {
    await AdminUserModel.updateOne({ email: email.toLowerCase() }, { failedLogins: 0, $unset: { lockedUntil: '' }, lastLoginAt: new Date() });
  }
}
