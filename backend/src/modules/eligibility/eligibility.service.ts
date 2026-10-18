/**
 * Eligibility pipeline. For every programme-institution record, in this order:
 *   1. subject requirements  2. cluster slots  3. estimated score  4. cutoff  5. compare.
 * A record is "qualifying" only if every step succeeds and score >= selected cutoff.
 * Records that cannot be evaluated reliably are NEVER shown as qualifying; the reason is
 * counted in diagnostics so administrators can fix the underlying data.
 *
 * Pure: the caller supplies already-loaded records (no database access here), so the same
 * function serves the website, the PDF report and the tests.
 */
import {
  AggregateResult,
  DEFAULT_SCORING_CONFIG,
  FORMULA_VERSION,
  GradeMap,
  ScoringConfig,
  SlotSelection,
  clusterScore,
  computeAggregate,
  selectClusterSlots,
} from '../scoring/clusterScore.service';
import { CutoffPolicy, DEFAULT_CUTOFF_POLICY, meetsCutoff, selectCutoff } from './cutoff';
import { RequirementMatch, evaluateRequirements } from './requirements.eval';
import type { ClusterDefinition, ProgrammeRecord, SubClusterRequirement } from '../shared/types';

export interface DatasetView {
  clusters: ReadonlyMap<number, ClusterDefinition>;
  subClusters: ReadonlyMap<string, SubClusterRequirement>;
}

export interface QualifyingOption {
  programmeCode: string;
  programmeName: string;
  institutionCode: string;
  institutionName: string;
  clusterId: number;
  subClusterId: string;
  /** Full precision estimated cluster score. */
  score: number;
  cutoff: string;
  cutoffValue: number;
  cutoffYear: number;
  /** True when the cutoff value is shared by many records (a generic floor, not university-specific). */
  cutoffIsShared: boolean;
  /** score - cutoff (display only). */
  margin: number;
  requirementMatches: RequirementMatch[];
  clusterSubjects: Array<{ slot: number; subject: string; points: number }>;
  explanation: string;
}

export type SkipReason =
  | 'not_validated'
  | 'no_cluster_mapping'
  | 'cluster_definition_unusable'
  | 'requirements_unusable'
  | 'requirements_not_met'
  | 'slots_unresolved'
  | 'no_cutoff_available'
  | 'below_cutoff';

export interface EligibilityDiagnostics {
  evaluated: number;
  qualifying: number;
  skipped: Record<SkipReason, number>;
}

export interface EligibilityResult {
  formulaVersion: string;
  cutoffPolicy: CutoffPolicy;
  aggregate: AggregateResult;
  options: QualifyingOption[];
  diagnostics: EligibilityDiagnostics;
}

export interface EligibilityOptions {
  cutoffPolicy?: CutoffPolicy;
  scoring?: ScoringConfig;
}

function emptySkips(): Record<SkipReason, number> {
  return {
    not_validated: 0,
    no_cluster_mapping: 0,
    cluster_definition_unusable: 0,
    requirements_unusable: 0,
    requirements_not_met: 0,
    slots_unresolved: 0,
    no_cutoff_available: 0,
    below_cutoff: 0,
  };
}

export function evaluateCandidate(
  grades: GradeMap,
  programmes: Iterable<ProgrammeRecord>,
  dataset: DatasetView,
  options: EligibilityOptions = {},
): EligibilityResult {
  const policy = options.cutoffPolicy ?? DEFAULT_CUTOFF_POLICY;
  const scoring = options.scoring ?? DEFAULT_SCORING_CONFIG;
  const aggregate = computeAggregate(grades, scoring.aggregateRule);
  const skipped = emptySkips();
  const out: QualifyingOption[] = [];
  let evaluated = 0;
  if (!aggregate.ok) {
    return {
      formulaVersion: FORMULA_VERSION,
      cutoffPolicy: policy,
      aggregate,
      options: [],
      diagnostics: { evaluated: 0, qualifying: 0, skipped },
    };
  }

  // Cluster slot selection and requirement checks depend only on (sub)cluster: compute once.
  const slotCache = new Map<number, SlotSelection>();
  const reqCache = new Map<string, ReturnType<typeof evaluateRequirements>>();

  for (const p of programmes) {
    evaluated++;
    if (p.verificationStatus !== 'validated') {
      skipped.not_validated++;
      continue;
    }
    if (p.clusterId == null || !p.subClusterId) {
      skipped.no_cluster_mapping++;
      continue;
    }
    const cluster = dataset.clusters.get(p.clusterId);
    const sub = dataset.subClusters.get(p.subClusterId);
    if (!cluster || cluster.verificationStatus !== 'validated' || cluster.slotRules.length !== 4) {
      skipped.cluster_definition_unusable++;
      continue;
    }
    if (!sub || sub.verificationStatus !== 'validated') {
      skipped.requirements_unusable++;
      continue;
    }

    let req = reqCache.get(sub.subClusterId);
    if (!req) {
      req = evaluateRequirements(sub.slots, grades);
      reqCache.set(sub.subClusterId, req);
    }
    if (req.status === 'not_evaluable') {
      skipped.requirements_unusable++;
      continue;
    }
    if (req.status === 'not_met') {
      skipped.requirements_not_met++;
      continue;
    }

    let sel = slotCache.get(p.clusterId);
    if (!sel) {
      sel = selectClusterSlots(cluster.slotRules, grades, scoring);
      slotCache.set(p.clusterId, sel);
    }
    if (sel.status !== 'resolved') {
      skipped.slots_unresolved++;
      continue;
    }

    const cutoff = selectCutoff(p.cutoffs, policy);
    if (!cutoff) {
      skipped.no_cutoff_available++;
      continue;
    }

    if (!meetsCutoff(sel.r, aggregate.t, cutoff.raw)) {
      skipped.below_cutoff++;
      continue;
    }

    const score = clusterScore(sel.r, aggregate.t);
    out.push({
      programmeCode: p.programmeCode,
      programmeName: p.programmeName,
      institutionCode: p.institutionCode,
      institutionName: p.institutionName,
      clusterId: p.clusterId,
      subClusterId: p.subClusterId,
      score,
      cutoff: cutoff.raw,
      cutoffValue: cutoff.value,
      cutoffYear: cutoff.year,
      cutoffIsShared: Boolean(cutoff.shared),
      margin: Math.max(0, score - cutoff.value),
      requirementMatches: req.matches,
      clusterSubjects: sel.picks.map((x) => ({ slot: x.slot, subject: x.subject, points: x.points })),
      explanation: `Meets the published minimum subject requirements for sub-cluster ${p.subClusterId} and the estimated cluster score ${score.toFixed(3)} is at or above the ${cutoff.year} cutoff of ${cutoff.raw}.`,
    });
  }

  // Highest cutoff first (most competitive programme the candidate qualifies for), then lowest.
  out.sort((a, b) => b.cutoffValue - a.cutoffValue || a.programmeName.localeCompare(b.programmeName) || a.institutionName.localeCompare(b.institutionName) || a.programmeCode.localeCompare(b.programmeCode));
  return {
    formulaVersion: FORMULA_VERSION,
    cutoffPolicy: policy,
    aggregate,
    options: out,
    diagnostics: { evaluated, qualifying: out.length, skipped },
  };
}
