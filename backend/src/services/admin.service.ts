/**
 * Administrative use cases: authentication, import (dry-run or draft), review, correction,
 * activation and rollback. Storage is accessed only through repository interfaces.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { AdminRepository, Correction, DatasetRepository } from '../repositories/types';
import { analysePdfs, PdfValidationError } from '../modules/import/import.service';
import { checkActivationReadiness } from '../modules/import/corrections';
import { DatasetCache } from './datasetCache';
import { badRequest, conflict, forbidden, notFound, unauthorized, AppError } from '../utils/errors';

export interface AdminDeps {
  datasets: DatasetRepository;
  admins: AdminRepository;
  cache: DatasetCache;
  jwtSecret: string;
  jwtExpiresIn: string;
  now?: () => Date;
}

export interface AdminPrincipal {
  email: string;
  role: 'admin' | 'reviewer';
}

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export class AdminService {
  constructor(private readonly d: AdminDeps) {}
  private now() {
    return this.d.now ? this.d.now() : new Date();
  }

  async login(email: string, password: string): Promise<{ token: string; role: string; expiresIn: string }> {
    const user = await this.d.admins.findByEmail(email);
    // Same error for unknown user / wrong password / locked: no account enumeration.
    const generic = unauthorized('Invalid credentials');
    if (!user) {
      await bcrypt.compare(password, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali');
      throw generic;
    }
    if (user.lockedUntil && user.lockedUntil > this.now()) throw generic;
    const okPw = await bcrypt.compare(password, user.passwordHash);
    if (!okPw) {
      const lock = user.failedLogins + 1 >= MAX_FAILED ? new Date(this.now().getTime() + LOCK_MINUTES * 60_000) : undefined;
      await this.d.admins.recordFailure(user.email, lock);
      await this.d.datasets.audit({ at: this.now(), actor: user.email, action: 'login_failed' });
      throw generic;
    }
    await this.d.admins.recordSuccess(user.email);
    await this.d.datasets.audit({ at: this.now(), actor: user.email, action: 'login' });
    const token = jwt.sign({ sub: user.email, role: user.role }, this.d.jwtSecret, { expiresIn: this.d.jwtExpiresIn as jwt.SignOptions['expiresIn'], issuer: 'cymor-coursechecker' });
    return { token, role: user.role, expiresIn: this.d.jwtExpiresIn };
  }

  verifyToken(token: string): AdminPrincipal {
    try {
      const p = jwt.verify(token, this.d.jwtSecret, { issuer: 'cymor-coursechecker' }) as jwt.JwtPayload;
      if (typeof p.sub !== 'string' || (p.role !== 'admin' && p.role !== 'reviewer')) throw new Error('bad claims');
      return { email: p.sub, role: p.role };
    } catch {
      throw unauthorized('Invalid or expired token');
    }
  }

  requireAdmin(p: AdminPrincipal) {
    if (p.role !== 'admin') throw forbidden('Administrator role required');
  }

  async importPdfs(
    actor: AdminPrincipal,
    files: { clusterPdf: Buffer; clusterFilename: string; cutoffPdf: Buffer; cutoffFilename: string },
    opts: { dryRun: boolean },
  ) {
    this.requireAdmin(actor);
    let analysis;
    try {
      analysis = await analysePdfs(files);
    } catch (e) {
      await this.d.datasets.audit({ at: this.now(), actor: actor.email, action: 'import_failed', details: { reason: (e as Error).message } });
      if (e instanceof PdfValidationError) throw badRequest(e.message);
      throw new AppError(422, 'IMPORT_FAILED', 'The PDFs could not be processed');
    }
    const existing = await this.d.datasets.findByContentId(analysis.contentId);
    const readiness = checkActivationReadiness(analysis.built.quality, analysis.built.programmes);
    if (opts.dryRun) {
      return { dryRun: true as const, duplicateOf: existing?.version ?? null, quality: analysis.built.quality, readiness, sources: analysis.sources, reviewQueuePreview: analysis.built.reviewQueue.slice(0, 20) };
    }
    if (existing) throw conflict(`These exact files were already imported as dataset ${existing.version}`, { version: existing.version });
    const stamp = this.now().toISOString().replace(/[-:T]/g, '').slice(0, 12);
    const version = `ds-${stamp}-${analysis.contentId.slice(0, 8)}`;
    try {
      const meta = await this.d.datasets.createDraft(version, analysis.contentId, analysis.built, analysis.sources, actor.email);
      return { dryRun: false as const, version: meta.version, status: meta.status, quality: meta.quality, readiness, sources: analysis.sources };
    } catch (e) {
      await this.d.datasets.audit({ at: this.now(), actor: actor.email, action: 'import_failed', details: { reason: 'storage failure', version } });
      throw new AppError(500, 'IMPORT_STORAGE_FAILED', 'The import failed and nothing was activated. The active dataset is unchanged.');
    }
  }

  /**
   * One-time seeding for hosts without a shell (e.g. Render free tier): imports the two source PDFs
   * bundled in the repository and activates the result. Refuses to run if any dataset is already active.
   */
  async seedFromBundled(dir: string) {
    if (await this.d.datasets.getActiveVersion()) throw conflict('A dataset is already active, so seeding is disabled.');
    const actor: AdminPrincipal = { email: 'seed-key', role: 'admin' };
    const clusterFilename = 'DEGREE_CLUSTER_DOCUMENT_11_2_2024.pdf';
    const cutoffFilename = 'DEGREE_CUTOFFS_14_07_2025.pdf';
    let clusterPdf: Buffer;
    let cutoffPdf: Buffer;
    try {
      [clusterPdf, cutoffPdf] = await Promise.all([fs.readFile(path.join(dir, clusterFilename)), fs.readFile(path.join(dir, cutoffFilename))]);
    } catch {
      throw new AppError(500, 'SEED_FILES_MISSING', 'The bundled source PDFs were not found on the server (expected backend/data/source).');
    }
    let version: string;
    try {
      const out = await this.importPdfs(actor, { clusterPdf, clusterFilename, cutoffPdf, cutoffFilename }, { dryRun: false });
      version = (out as { version: string }).version;
    } catch (e) {
      // The same files were imported earlier as a draft: reuse that draft.
      const v = e instanceof AppError && e.status === 409 ? (e.details as { version?: string } | undefined)?.version : undefined;
      if (!v) throw e;
      version = v;
    }
    const activated = await this.activate(actor, version);
    return { version, activated: true, warnings: activated.warnings };
  }

  async listDatasets() {
    return (await this.d.datasets.listVersions()).map((m) => ({
      version: m.version,
      status: m.status,
      createdAt: m.createdAt,
      activatedAt: m.activatedAt ?? null,
      programmeRecords: m.quality.programmeRecords,
      validated: m.quality.eligibleForActivation,
      awaitingReview: m.quality.awaitingReview,
      correctionCount: m.correctionCount,
    }));
  }

  async getDataset(version: string) {
    const ds = await this.d.datasets.loadDataset(version);
    if (!ds) throw notFound('Dataset version not found');
    const validated = ds.programmes.filter((p) => p.verificationStatus === 'validated').length;
    return {
      version,
      status: ds.meta.status,
      sources: ds.meta.sources,
      quality: { ...ds.meta.quality, eligibleForActivation: validated, awaitingReview: ds.programmes.filter((p) => p.verificationStatus === 'needs_review').length },
      readiness: checkActivationReadiness(ds.meta.quality, ds.programmes),
    };
  }

  async reviewQueue(version: string, limit: number, skip: number) {
    return this.d.datasets.listReviewItems(version, limit, skip);
  }

  async correct(actor: AdminPrincipal, version: string, correction: Correction) {
    this.requireAdmin(actor);
    const r = await this.d.datasets.applyCorrection(version, correction, actor.email);
    if (!r.ok) throw badRequest(r.message);
    this.d.cache.invalidate();
    return r;
  }

  async activate(actor: AdminPrincipal, version: string) {
    this.requireAdmin(actor);
    const ds = await this.d.datasets.loadDataset(version);
    if (!ds) throw notFound('Dataset version not found');
    if (ds.meta.status === 'failed') throw badRequest('A failed import cannot be activated');
    if (ds.meta.status === 'active') throw conflict('This dataset is already active');
    const readiness = checkActivationReadiness(
      { ...ds.meta.quality, awaitingReview: ds.programmes.filter((p) => p.verificationStatus === 'needs_review').length },
      ds.programmes,
    );
    if (!readiness.ready) throw conflict('The dataset did not pass the activation checks', readiness);
    const r = await this.d.datasets.activate(version, actor.email);
    this.d.cache.invalidate();
    return { version, previous: r.previous, warnings: readiness.warnings };
  }

  async rollback(actor: AdminPrincipal) {
    this.requireAdmin(actor);
    try {
      const r = await this.d.datasets.rollback(actor.email);
      this.d.cache.invalidate();
      return r;
    } catch (e) {
      throw conflict((e as Error).message);
    }
  }

  async audit(limit: number) {
    return this.d.datasets.listAudit(limit);
  }
}
