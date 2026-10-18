/**
 * Pure helpers for manual data correction and for the activation gate. Storage layers call
 * these so that the in-memory test repository and the MongoDB repository behave identically.
 */
import { parseRequirementSlot } from '../requirements/grammar';
import type { ClusterDefinition, ProgrammeRecord, SubClusterRequirement, VerificationStatus } from '../shared/types';
import type { DataQualityReport } from './dataset.builder';

export interface MapResult {
  ok: boolean;
  message: string;
  programme?: ProgrammeRecord;
}

/** Manually map a programme to a sub-cluster. Only usable sub-clusters/clusters can be targeted. */
export function mapProgramme(
  programme: ProgrammeRecord,
  subClusterId: string,
  subClusters: ReadonlyMap<string, SubClusterRequirement>,
  clusters: ReadonlyMap<number, ClusterDefinition>,
): MapResult {
  const sub = subClusters.get(subClusterId);
  if (!sub) return { ok: false, message: `Unknown sub-cluster ${subClusterId}` };
  const cluster = clusters.get(sub.clusterId);
  if (!cluster || cluster.verificationStatus !== 'validated') {
    return { ok: false, message: `Cluster ${sub.clusterId} definitions are not usable` };
  }
  if (sub.verificationStatus !== 'validated') {
    return { ok: false, message: `Sub-cluster ${subClusterId} requirements are not yet validated; correct them first` };
  }
  const remaining = programme.issues.filter(
    (i) => !(i.startsWith('programme name') || i.startsWith('sub-cluster') || i.startsWith('cluster ')),
  );
  const status: VerificationStatus = remaining.length === 0 ? 'validated' : 'needs_review';
  return {
    ok: true,
    message: `Mapped ${programme.programmeCode} to sub-cluster ${subClusterId}`,
    programme: {
      ...programme,
      clusterId: sub.clusterId,
      subClusterId,
      issues: remaining,
      verificationStatus: status,
    },
  };
}

export interface SlotOverrideResult {
  ok: boolean;
  message: string;
  subCluster?: SubClusterRequirement;
}

/** Replace the printed text of one requirement slot and re-run the grammar. */
export function overrideRequirementSlot(sub: SubClusterRequirement, slot: 1 | 2 | 3 | 4, text: string): SlotOverrideResult {
  const parsed = parseRequirementSlot(slot, text);
  if (parsed.status !== 'parsed') return { ok: false, message: `Text could not be interpreted: ${parsed.reason}` };
  const slots = [...sub.slots.filter((s) => s.slot !== slot), parsed].sort((a, b) => a.slot - b.slot);
  const allParsed = slots.every((s) => s.status === 'parsed');
  return {
    ok: true,
    message: `Slot ${slot} of ${sub.subClusterId} updated`,
    subCluster: {
      ...sub,
      slots,
      notes: [...sub.notes, `Manual override of slot ${slot}: "${text}"`],
      verificationStatus: allParsed ? 'validated' : 'needs_review',
    },
  };
}

export interface ActivationReadiness {
  ready: boolean;
  blockers: string[];
  warnings: string[];
}

export const MIN_VALIDATED_RATIO = 0.5;

export function checkActivationReadiness(quality: DataQualityReport, programmes: readonly ProgrammeRecord[]): ActivationReadiness {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const validated = programmes.filter((p) => p.verificationStatus === 'validated').length;
  if (programmes.length === 0) blockers.push('The dataset contains no programme records');
  if (quality.duplicateOrConflicting.duplicateCodes > 0) blockers.push(`${quality.duplicateOrConflicting.duplicateCodes} duplicate programme code(s) must be resolved`);
  if (quality.duplicateOrConflicting.institutionPrefixConflicts > 0) blockers.push('Institution code prefixes map to several institution names');
  if (quality.parseDiagnostics.malformedCutoffRows > 0) blockers.push(`${quality.parseDiagnostics.malformedCutoffRows} cutoff row(s) could not be read reliably`);
  if (quality.clusterDefinitionsUsable < quality.clusterDefinitions) blockers.push('Some cluster slot definitions could not be interpreted');
  if (validated === 0) blockers.push('No validated programme records are available');
  if (programmes.length > 0 && validated / programmes.length < MIN_VALIDATED_RATIO) {
    blockers.push(`Only ${validated} of ${programmes.length} records are validated (minimum ratio ${MIN_VALIDATED_RATIO})`);
  }
  if (quality.awaitingReview > 0) warnings.push(`${quality.awaitingReview} record(s) await review and will be excluded from results`);
  if (quality.recordsWithNoCutoffAtAll > 0) warnings.push(`${quality.recordsWithNoCutoffAtAll} record(s) have no cutoff value and can never qualify`);
  if (quality.subClustersUsable < quality.subClusters) warnings.push(`${quality.subClusters - quality.subClustersUsable} sub-cluster(s) have requirements needing review`);
  return { ready: blockers.length === 0, blockers, warnings };
}

/** After a sub-cluster was corrected, clear its issue on programmes that were waiting on it. */
export function revalidateForSubCluster(
  programmes: readonly ProgrammeRecord[],
  sub: SubClusterRequirement,
): ProgrammeRecord[] {
  if (sub.verificationStatus !== 'validated') return [];
  const changed: ProgrammeRecord[] = [];
  for (const p of programmes) {
    if (p.subClusterId !== sub.subClusterId || p.verificationStatus === 'validated') continue;
    const remaining = p.issues.filter((i) => !i.startsWith('sub-cluster'));
    if (remaining.length === p.issues.length) continue;
    changed.push({ ...p, issues: remaining, verificationStatus: remaining.length === 0 ? 'validated' : p.verificationStatus });
  }
  return changed;
}
