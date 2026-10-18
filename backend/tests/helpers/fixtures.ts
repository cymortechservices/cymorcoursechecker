/** Small synthetic dataset for unit tests. All values are INVENTED test data, not KUCCPS data. */
import { parseRequirementSlot, parseSlotRule } from '../../src/modules/requirements/grammar';
import type { ClusterDefinition, CutoffObservation, ProgrammeRecord, SubClusterRequirement } from '../../src/modules/shared/types';
import type { DatasetView } from '../../src/modules/eligibility/eligibility.service';

export const cluster = (clusterId: number, slots: [string, string, string, string]): ClusterDefinition => ({
  clusterId,
  slotRules: slots.map((s, i) => parseSlotRule((i + 1) as 1 | 2 | 3 | 4, s)),
  sourcePage: 1,
  verificationStatus: 'validated',
});

export const sub = (clusterId: number, subClusterId: string, reqs: Array<[1 | 2 | 3 | 4, string]>): SubClusterRequirement => ({
  clusterId,
  subClusterId,
  slots: reqs.map(([n, t]) => parseRequirementSlot(n, t)),
  verificationStatus: 'validated',
  notes: [],
});

export const cut = (year: number, raw: string, shared = false): CutoffObservation => ({ year, raw, value: Number(raw), sourcePage: 1, shared });

export const prog = (code: string, name: string, inst: string, clusterId: number | null, subClusterId: string | null, cutoffs: CutoffObservation[], status: ProgrammeRecord['verificationStatus'] = 'validated'): ProgrammeRecord => ({
  programmeCode: code,
  programmeName: name,
  institutionCode: inst.slice(0, 3).toUpperCase(),
  institutionName: inst,
  clusterId,
  subClusterId,
  cutoffs,
  verificationStatus: status,
  issues: status === 'validated' ? [] : ['test'],
});

export function makeView(clusters: ClusterDefinition[], subs: SubClusterRequirement[]): DatasetView {
  return { clusters: new Map(clusters.map((c) => [c.clusterId, c] as const)), subClusters: new Map(subs.map((s) => [s.subClusterId, s] as const)) };
}

export const CLUSTER_1 = cluster(1, ['MAT ALTERNATIVE A/B', 'ENG/KIS', 'Any GROUP II', 'Any GROUP III or any GROUP V']);
export const SUB_1A = sub(1, '1A', [[1, 'MAT ALTERNATIVE A/B - C+'], [3, 'BIO/CHE/PHY - C+']]);
export const VIEW = makeView([CLUSTER_1], [SUB_1A]);

/** A strong candidate: ENG B+, KIS B, MATA A-, BIO B+, CHE B+, PHY B, GEO B */
export const GRADES = { ENG: 'B+', KIS: 'B', MATA: 'A-', BIO: 'B+', CHE: 'B+', PHY: 'B', GEO: 'B', CRE: 'B-' } as const;
