/**
 * Builds a candidate dataset (clusters, sub-cluster requirements, programme records and a
 * data-quality report) from the two parsed KUCCPS documents. Pure: no I/O.
 */
import { parseSlotRule, parseRequirementSlot, RequirementSlot, SlotRule } from '../requirements/grammar';
import type { ClusterDocParseResult } from './clusterDoc.parser';
import type { CutoffDocParseResult } from './cutoffs.parser';
import { jaccard, key1, key2, tokenSet } from './nameMatch';
import type {
  ClusterDefinition,
  CutoffObservation,
  ProgrammeRecord,
  SubClusterRequirement,
  VerificationStatus,
} from '../shared/types';

/**
 * A printed value reported by at least this many records in the SAME year is treated as shared.
 * Derived from the supplied cutoff document: in the years where cutoffs are university-specific
 * (2018, 2019, 2024) no value repeats more than 4 times, while 2020-2023 repeat single values
 * hundreds of times (e.g. 16.791 x297, 15.864 x276). Five is the smallest count that coincidence
 * does not explain. Configurable here; documented in docs/DATA_DICTIONARY.md.
 */
export const SHARED_VALUE_THRESHOLD = 5;

export type MatchTier = 'exact' | 'normalized' | 'ambiguous' | 'unmatched';

export interface ReviewItem {
  programmeCode: string;
  programmeName: string;
  institutionName: string;
  reason: 'unmatched' | 'ambiguous' | 'requirements_unusable' | 'cluster_unusable' | 'conflict' | 'malformed_row';
  detail: string;
  /** Candidate cluster mappings offered for manual review (never auto-applied). */
  suggestions: Array<{ clusterId: number; subClusterId: string; name: string; similarity: number }>;
}

export interface DataQualityReport {
  programmeRecords: number;
  cutoffObservations: number;
  clusterDefinitions: number;
  clusterDefinitionsUsable: number;
  subClusters: number;
  subClustersUsable: number;
  programmeToClusterMatches: { exact: number; normalized: number; ambiguous: number; unmatched: number };
  recordsMissingRequiredFields: number;
  recordsWithNoCutoffAtAll: number;
  ambiguousMatches: number;
  duplicateOrConflicting: { duplicateCodes: number; possibleDuplicateNames: number; institutionPrefixConflicts: number };
  awaitingReview: number;
  eligibleForActivation: number;
  parseDiagnostics: { unrecognisedCutoffLines: number; malformedCutoffRows: number; clusterDocDiagnostics: string[]; strayClusterText: number };
  cutoffYears: number[];
  /** Per year: observations whose value is shared by many records (generic floor values). */
  sharedCutoffObservations: Record<number, { observations: number; shared: number; sharedValues: string[] }>;
  warnings: string[];
}

export interface BuiltDataset {
  clusters: ClusterDefinition[];
  subClusters: SubClusterRequirement[];
  programmes: ProgrammeRecord[];
  reviewQueue: ReviewItem[];
  quality: DataQualityReport;
  /** programmeCode -> match tier, for audit. */
  matchTiers: Record<string, MatchTier>;
}

export function buildDataset(clusterDoc: ClusterDocParseResult, cutoffDoc: CutoffDocParseResult): BuiltDataset {
  const warnings: string[] = [];

  // ---- clusters -----------------------------------------------------------------------
  const clusters: ClusterDefinition[] = clusterDoc.clusters.map((c) => {
    const rules: SlotRule[] = ([1, 2, 3, 4] as const).map((k) => parseSlotRule(k, c.slots[k]));
    const usable = rules.every((r) => r.status === 'parsed');
    if (!usable) warnings.push(`Cluster ${c.clusterId}: slot definitions not fully parsed`);
    return {
      clusterId: c.clusterId,
      slotRules: rules,
      sourcePage: c.page,
      verificationStatus: (usable ? 'validated' : 'needs_review') as VerificationStatus,
    };
  });
  const clusterOk = new Map(clusters.map((c) => [c.clusterId, c.verificationStatus === 'validated'] as const));

  // ---- sub-clusters ------------------------------------------------------------------
  const subClusters: SubClusterRequirement[] = clusterDoc.subClusters.map((s) => {
    const slots: RequirementSlot[] = [];
    const notes: string[] = [];
    for (const k of [1, 2, 3, 4] as const) {
      const raw = s.slots[k];
      if (!raw.trim()) continue;
      slots.push(parseRequirementSlot(k, raw));
    }
    const unparsed = slots.filter((x) => x.status !== 'parsed');
    for (const sl of slots) for (const w of sl.warnings) notes.push(`slot ${sl.slot}: ${w}`);
    for (const u of unparsed) notes.push(`slot ${u.slot} not interpreted: ${u.reason}`);
    if (slots.length === 0) notes.push('No minimum subject requirement is printed for this sub-cluster in the document');
    if (s.strayText.length) notes.push(`Unplaced text: ${s.strayText.join(' | ')}`);
    return {
      clusterId: s.clusterId,
      subClusterId: s.subClusterId,
      slots,
      notes,
      verificationStatus: (unparsed.length === 0 && s.strayText.length === 0 ? 'validated' : 'needs_review') as VerificationStatus,
    };
  });
  const subById = new Map(subClusters.map((s) => [s.subClusterId, s] as const));

  // ---- name index of the cluster document ------------------------------------------------
  type Entry = { clusterId: number; subClusterId: string; name: string; k1: string; k2: string; tokens: Set<string> };
  const entries: Entry[] = clusterDoc.programmes.map((p) => ({
    clusterId: p.clusterId,
    subClusterId: p.subClusterId,
    name: p.name,
    k1: key1(p.name),
    k2: key2(p.name),
    tokens: tokenSet(p.name),
  }));
  const byK1 = new Map<string, Entry[]>();
  const byK2 = new Map<string, Entry[]>();
  for (const e of entries) {
    (byK1.get(e.k1) ?? byK1.set(e.k1, []).get(e.k1)!).push(e);
    (byK2.get(e.k2) ?? byK2.set(e.k2, []).get(e.k2)!).push(e);
  }
  const distinctSubs = (list: Entry[]) => [...new Set(list.map((e) => e.subClusterId))];

  // ---- programme records -----------------------------------------------------------------
  // Shared-value detection: same printed value, same year, many records.
  const valueCounts = new Map<string, number>();
  for (const r of cutoffDoc.rows) for (const [y, v] of Object.entries(r.values)) valueCounts.set(`${y}|${v}`, (valueCounts.get(`${y}|${v}`) ?? 0) + 1);
  const isShared = (year: number, raw: string) => (valueCounts.get(`${year}|${raw}`) ?? 0) >= SHARED_VALUE_THRESHOLD;

  const programmes: ProgrammeRecord[] = [];
  const reviewQueue: ReviewItem[] = [];
  const matchTiers: Record<string, MatchTier> = {};
  const tally = { exact: 0, normalized: 0, ambiguous: 0, unmatched: 0 };
  let missingRequired = 0;
  let noCutoff = 0;
  let observations = 0;

  const codeCount = new Map<string, number>();
  for (const r of cutoffDoc.rows) codeCount.set(r.programmeCode, (codeCount.get(r.programmeCode) ?? 0) + 1);
  const prefixNames = new Map<string, Set<string>>();
  for (const r of cutoffDoc.rows) {
    const prefix = r.programmeCode.slice(0, 4);
    (prefixNames.get(prefix) ?? prefixNames.set(prefix, new Set()).get(prefix)!).add(r.institutionName);
  }
  const conflictingPrefixes = new Set([...prefixNames].filter(([, v]) => v.size > 1).map(([k]) => k));
  const pairCount = new Map<string, number>();
  for (const r of cutoffDoc.rows) {
    const k = `${r.institutionName}|${key1(r.programmeName)}`;
    pairCount.set(k, (pairCount.get(k) ?? 0) + 1);
  }
  const malformedKeys = new Set(cutoffDoc.malformedRows.map((m) => `${m.page}|${m.text}`));

  for (const row of cutoffDoc.rows) {
    const issues: string[] = [];
    const cutoffs: CutoffObservation[] = Object.entries(row.values)
      .map(([year, raw]) => ({ year: Number(year), raw, value: Number(raw), sourcePage: row.page, shared: isShared(Number(year), raw) }))
      .sort((a, b) => a.year - b.year);
    observations += cutoffs.length;
    if (cutoffs.length === 0) noCutoff++;

    if (!row.institutionName || !row.programmeName || !/^\d{4}[A-Z0-9]{3}$/.test(row.programmeCode)) {
      missingRequired++;
      issues.push('missing required field (code, institution or programme name)');
    }
    if ((codeCount.get(row.programmeCode) ?? 0) > 1) issues.push('duplicate programme code in the cutoff document');
    if (conflictingPrefixes.has(row.programmeCode.slice(0, 4))) issues.push('institution prefix maps to several institution names');

    // Cluster mapping
    let tier: MatchTier = 'unmatched';
    let clusterId: number | null = null;
    let subClusterId: string | null = null;
    const k1 = key1(row.programmeName);
    const exact = byK1.get(k1);
    const norm = byK2.get(key2(row.programmeName));
    const pick = (list: Entry[], t: MatchTier) => {
      const subs = distinctSubs(list);
      if (subs.length === 1) {
        tier = t;
        clusterId = (list[0] as Entry).clusterId;
        subClusterId = subs[0] as string;
      } else {
        tier = 'ambiguous';
        issues.push(`programme name appears under several sub-clusters (${subs.join(', ')}); manual mapping required`);
        reviewQueue.push({
          programmeCode: row.programmeCode,
          programmeName: row.programmeName,
          institutionName: row.institutionName,
          reason: 'ambiguous',
          detail: `Name listed under sub-clusters ${subs.join(', ')}`,
          suggestions: list.map((e) => ({ clusterId: e.clusterId, subClusterId: e.subClusterId, name: e.name, similarity: 1 })),
        });
      }
    };
    if (exact) pick(exact, 'exact');
    else if (norm) pick(norm, 'normalized');
    else {
      const tokens = tokenSet(row.programmeName);
      const suggestions = entries
        .map((e) => ({ e, s: jaccard(tokens, e.tokens) }))
        .filter((x) => x.s >= 0.6)
        .sort((a, b) => b.s - a.s)
        .slice(0, 3)
        .map((x) => ({ clusterId: x.e.clusterId, subClusterId: x.e.subClusterId, name: x.e.name, similarity: Math.round(x.s * 100) / 100 }));
      issues.push('programme name not found in the cluster document; manual mapping required');
      reviewQueue.push({
        programmeCode: row.programmeCode,
        programmeName: row.programmeName,
        institutionName: row.institutionName,
        reason: 'unmatched',
        detail: 'No programme with this name in the cluster document',
        suggestions,
      });
    }
    tally[tier]++;
    matchTiers[row.programmeCode] = tier;

    if (clusterId != null && subClusterId) {
      if (!clusterOk.get(clusterId)) issues.push(`cluster ${clusterId} slot definitions unusable`);
      const sub = subById.get(subClusterId);
      if (!sub || sub.verificationStatus !== 'validated') {
        issues.push(`sub-cluster ${subClusterId} requirements could not be fully interpreted`);
        reviewQueue.push({
          programmeCode: row.programmeCode,
          programmeName: row.programmeName,
          institutionName: row.institutionName,
          reason: 'requirements_unusable',
          detail: sub ? sub.notes.join('; ') : 'unknown sub-cluster',
          suggestions: [],
        });
      }
    }
    if ([...malformedKeys].some((k) => k.startsWith(`${row.page}|`) && k.includes(row.programmeCode))) {
      issues.push('row could not be read reliably from the PDF');
    }

    const hard = issues.some(
      (i) => !i.startsWith('programme name not found') && !i.startsWith('programme name appears') && !i.startsWith('sub-cluster') && !i.startsWith('cluster '),
    );
    const status: VerificationStatus = issues.length === 0 ? 'validated' : hard ? 'rejected' : 'needs_review';
    programmes.push({
      programmeCode: row.programmeCode,
      programmeName: row.programmeName,
      institutionCode: row.programmeCode.slice(0, 4),
      institutionName: row.institutionName,
      clusterId,
      subClusterId,
      cutoffs,
      verificationStatus: status,
      issues,
    });
  }

  const dupNames = [...pairCount.values()].filter((n) => n > 1).length;
  const validated = programmes.filter((p) => p.verificationStatus === 'validated').length;
  const quality: DataQualityReport = {
    programmeRecords: programmes.length,
    cutoffObservations: observations,
    clusterDefinitions: clusters.length,
    clusterDefinitionsUsable: clusters.filter((c) => c.verificationStatus === 'validated').length,
    subClusters: subClusters.length,
    subClustersUsable: subClusters.filter((s) => s.verificationStatus === 'validated').length,
    programmeToClusterMatches: tally,
    recordsMissingRequiredFields: missingRequired,
    recordsWithNoCutoffAtAll: noCutoff,
    ambiguousMatches: tally.ambiguous,
    duplicateOrConflicting: {
      duplicateCodes: [...codeCount.values()].filter((n) => n > 1).length,
      possibleDuplicateNames: dupNames,
      institutionPrefixConflicts: conflictingPrefixes.size,
    },
    awaitingReview: programmes.filter((p) => p.verificationStatus === 'needs_review').length,
    eligibleForActivation: validated,
    parseDiagnostics: {
      unrecognisedCutoffLines: cutoffDoc.unrecognisedLines.length,
      malformedCutoffRows: cutoffDoc.malformedRows.length,
      clusterDocDiagnostics: clusterDoc.diagnostics,
      strayClusterText: clusterDoc.subClusters.reduce((n, s) => n + s.strayText.length, 0),
    },
    cutoffYears: cutoffDoc.years,
    sharedCutoffObservations: sharedSummary(cutoffDoc, valueCounts),
    warnings,
  };
  const sharedTotal = Object.values(quality.sharedCutoffObservations).reduce((n, e) => n + e.shared, 0);
  if (sharedTotal > 0) warnings.push(`${sharedTotal} cutoff observation(s) carry a value shared by ${SHARED_VALUE_THRESHOLD}+ records in the same year (generic floor values, not university-specific); they are labelled in results`);
  if (dupNames > 0) warnings.push(`${dupNames} institution+programme name pair(s) appear under more than one code (possible duplicates, kept as separate placement options)`);

  return { clusters, subClusters, programmes, reviewQueue, quality, matchTiers };
}

function sharedSummary(
  doc: CutoffDocParseResult,
  counts: Map<string, number>,
): DataQualityReport['sharedCutoffObservations'] {
  const out: DataQualityReport['sharedCutoffObservations'] = {};
  for (const y of doc.years) out[y] = { observations: 0, shared: 0, sharedValues: [] };
  for (const r of doc.rows) {
    for (const [y, v] of Object.entries(r.values)) {
      const e = out[Number(y)];
      if (!e) continue;
      e.observations++;
      if ((counts.get(`${y}|${v}`) ?? 0) >= SHARED_VALUE_THRESHOLD) {
        e.shared++;
        if (!e.sharedValues.includes(v)) e.sharedValues.push(v);
      }
    }
  }
  return out;
}
