import type { DatasetRepository, LoadedDataset } from '../repositories/types';
import type { DatasetView } from '../modules/eligibility/eligibility.service';
import { unavailable } from '../utils/errors';

export interface ResolvedDataset {
  loaded: LoadedDataset;
  view: DatasetView;
}

/**
 * Loads a dataset version once (two queries) and keeps it in memory for a short time so
 * that every checker request does not hit the database. Activation/rollback invalidates it.
 */
export class DatasetCache {
  private cache = new Map<string, { at: number; value: ResolvedDataset }>();
  private activeCache: { at: number; version: string | null } | null = null;
  constructor(
    private readonly repo: DatasetRepository,
    private readonly ttlMs = 5 * 60 * 1000,
    private readonly now: () => number = Date.now,
  ) {}

  invalidate(): void {
    this.cache.clear();
    this.activeCache = null;
  }

  async activeVersion(): Promise<string> {
    if (!this.activeCache || this.now() - this.activeCache.at > 30_000) {
      this.activeCache = { at: this.now(), version: await this.repo.getActiveVersion() };
    }
    if (!this.activeCache.version) throw unavailable('No dataset is active yet. An administrator must import and activate a dataset.');
    return this.activeCache.version;
  }

  async get(version: string): Promise<ResolvedDataset | null> {
    const hit = this.cache.get(version);
    if (hit && this.now() - hit.at < this.ttlMs) return hit.value;
    const loaded = await this.repo.loadDataset(version);
    if (!loaded) return null;
    const value: ResolvedDataset = {
      loaded,
      view: {
        clusters: new Map(loaded.clusters.map((c) => [c.clusterId, c] as const)),
        subClusters: new Map(loaded.subClusters.map((s) => [s.subClusterId, s] as const)),
      },
    };
    this.cache.set(version, { at: this.now(), value });
    if (this.cache.size > 3) {
      const oldest = [...this.cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest) this.cache.delete(oldest[0]);
    }
    return value;
  }

  async active(): Promise<ResolvedDataset> {
    const v = await this.activeVersion();
    const d = await this.get(v);
    if (!d) throw unavailable('The active dataset could not be loaded');
    return d;
  }
}
