/**
 * TEST DOUBLE ONLY. In-memory implementations of the repository interfaces so that the
 * services can be exercised without MongoDB. Production code never imports this file.
 */
import crypto from 'node:crypto';
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
} from '../../src/repositories/types';
import type { BuiltDataset, ReviewItem } from '../../src/modules/import/dataset.builder';
import { mapProgramme, overrideRequirementSlot, revalidateForSubCluster } from '../../src/modules/import/corrections';

interface Stored extends LoadedDataset {
  built: BuiltDataset;
}

export class MemoryDatasetRepository implements DatasetRepository {
  private versions = new Map<string, Stored>();
  private order: string[] = [];
  private activeVersion: string | null = null;
  public auditLog: AuditEntry[] = [];
  public failNextCreate = false;

  async getActiveVersion() {
    return this.activeVersion;
  }
  async loadDataset(version: string) {
    const s = this.versions.get(version);
    return s ? { meta: s.meta, programmes: s.programmes, clusters: s.clusters, subClusters: s.subClusters } : null;
  }
  async listVersions() {
    return this.order.map((v) => (this.versions.get(v) as Stored).meta);
  }
  async findByContentId(contentId: string) {
    for (const s of this.versions.values()) if (s.meta.contentId === contentId && s.meta.status !== 'failed') return s.meta;
    return null;
  }
  async createDraft(version: string, contentId: string, built: BuiltDataset, sources: DatasetMeta['sources'], actor: string) {
    if (this.failNextCreate) {
      this.failNextCreate = false;
      throw new Error('simulated storage failure');
    }
    const meta: DatasetMeta = { version, contentId, status: 'draft', createdAt: new Date(), quality: built.quality, sources, correctionCount: 0 };
    this.versions.set(version, {
      meta,
      programmes: structuredClone(built.programmes),
      clusters: structuredClone(built.clusters),
      subClusters: structuredClone(built.subClusters),
      built,
    });
    this.order.push(version);
    await this.audit({ at: new Date(), actor, action: 'import', datasetVersion: version });
    return meta;
  }
  async listReviewItems(version: string, limit: number, skip: number) {
    const s = this.versions.get(version);
    const all: ReviewItem[] = s ? s.built.reviewQueue : [];
    const open = all.filter((r) => {
      const p = s?.programmes.find((x) => x.programmeCode === r.programmeCode);
      return p ? p.verificationStatus !== 'validated' : false;
    });
    return { total: open.length, items: open.slice(skip, skip + limit) };
  }
  async applyCorrection(version: string, c: Correction, actor: string): Promise<CorrectionResult> {
    const s = this.versions.get(version);
    if (!s) return { ok: false, message: 'Unknown dataset version' };
    if (s.meta.status !== 'draft') return { ok: false, message: 'Only draft datasets can be corrected' };
    const clusters = new Map(s.clusters.map((x) => [x.clusterId, x] as const));
    const subs = new Map(s.subClusters.map((x) => [x.subClusterId, x] as const));
    let result: CorrectionResult;
    if (c.type === 'map_programme') {
      const idx = s.programmes.findIndex((p) => p.programmeCode === c.programmeCode);
      if (idx < 0) return { ok: false, message: 'Unknown programme code' };
      const r = mapProgramme(s.programmes[idx]!, c.subClusterId, subs, clusters);
      if (r.ok && r.programme) s.programmes[idx] = r.programme;
      result = { ok: r.ok, message: r.message };
    } else if (c.type === 'reject_programme') {
      const idx = s.programmes.findIndex((p) => p.programmeCode === c.programmeCode);
      if (idx < 0) return { ok: false, message: 'Unknown programme code' };
      s.programmes[idx] = { ...s.programmes[idx]!, verificationStatus: 'rejected', issues: [...s.programmes[idx]!.issues, `rejected manually: ${c.reason}`] };
      result = { ok: true, message: 'Programme rejected' };
    } else {
      const sub = subs.get(c.subClusterId);
      if (!sub) return { ok: false, message: 'Unknown sub-cluster' };
      const r = overrideRequirementSlot(sub, c.slot, c.text);
      if (r.ok && r.subCluster) {
        const i = s.subClusters.findIndex((x) => x.subClusterId === c.subClusterId);
        s.subClusters[i] = r.subCluster;
        for (const p of revalidateForSubCluster(s.programmes, r.subCluster)) {
          s.programmes[s.programmes.findIndex((x) => x.programmeCode === p.programmeCode)] = p;
        }
      }
      result = { ok: r.ok, message: r.message };
    }
    if (result.ok) {
      s.meta.correctionCount++;
      await this.audit({ at: new Date(), actor, action: 'correction', datasetVersion: version, details: { ...c } });
    }
    return result;
  }
  async activate(version: string, actor: string) {
    const s = this.versions.get(version);
    if (!s || s.meta.status === 'failed') throw new Error('Dataset not found or failed');
    const previous = this.activeVersion;
    if (previous) {
      const p = this.versions.get(previous) as Stored;
      p.meta.status = 'archived';
    }
    s.meta.status = 'active';
    s.meta.activatedAt = new Date();
    s.meta.activatedBy = actor;
    this.activeVersion = version;
    await this.audit({ at: new Date(), actor, action: 'activate', datasetVersion: version, details: { previous } });
    return { previous };
  }
  async rollback(actor: string) {
    if (!this.activeVersion) throw new Error('No active dataset');
    const idx = this.order.indexOf(this.activeVersion);
    const target = [...this.order.slice(0, idx)].reverse().find((v) => this.versions.get(v)!.meta.status === 'archived');
    if (!target) throw new Error('No archived dataset to roll back to');
    const from = this.activeVersion;
    this.versions.get(from)!.meta.status = 'archived';
    const t = this.versions.get(target)!;
    t.meta.status = 'active';
    this.activeVersion = target;
    await this.audit({ at: new Date(), actor, action: 'rollback', datasetVersion: target, details: { from } });
    return { from, to: target };
  }
  async audit(e: AuditEntry) {
    this.auditLog.push(e);
  }
  async listAudit(limit: number) {
    return this.auditLog.slice(-limit).reverse();
  }
}

export class MemoryReportRepository implements ReportRepository {
  private reports = new Map<string, StoredReport>();
  async create(r: StoredReport) {
    this.reports.set(r.reportId, r);
  }
  async get(id: string) {
    const r = this.reports.get(id);
    return r && r.expiresAt > new Date() ? r : null;
  }
}

export class MemoryAdminRepository implements AdminRepository {
  private users = new Map<string, AdminUser>();
  async findByEmail(email: string) {
    return this.users.get(email.toLowerCase()) ?? null;
  }
  async create(u: Omit<AdminUser, 'failedLogins'>) {
    this.users.set(u.email.toLowerCase(), { ...u, failedLogins: 0 });
  }
  async recordFailure(email: string, lockUntil?: Date) {
    const u = this.users.get(email.toLowerCase());
    if (u) {
      u.failedLogins++;
      if (lockUntil) u.lockedUntil = lockUntil;
    }
  }
  async recordSuccess(email: string) {
    const u = this.users.get(email.toLowerCase());
    if (u) {
      u.failedLogins = 0;
      u.lockedUntil = undefined;
    }
  }
}

export function randomId() {
  return crypto.randomBytes(8).toString('hex');
}
