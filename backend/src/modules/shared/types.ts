import type { Grade } from '../subjects/catalogue';
import type { RequirementSlot, SlotRule } from '../requirements/grammar';

export type VerificationStatus = 'validated' | 'needs_review' | 'rejected';

export interface CutoffObservation {
  /** Placement/academic cycle year printed in the column heading (e.g. 2024). */
  year: number;
  /** Value exactly as printed (e.g. "25.798"). Missing values are never stored. */
  raw: string;
  /** Numeric value of raw (for display and sorting only; comparison uses raw). */
  value: number;
  sourcePage: number;
  /**
   * True when the SAME printed value is reported for that year by many records (see
   * SHARED_VALUE_THRESHOLD). Such values are a common floor/default, not a cutoff specific to
   * one university, and are labelled as such everywhere they are shown.
   */
  shared?: boolean;
}

export interface ClusterDefinition {
  clusterId: number;
  name?: string;
  slotRules: SlotRule[]; // exactly four when usable
  sourcePage: number;
  verificationStatus: VerificationStatus;
}

export interface SubClusterRequirement {
  clusterId: number;
  subClusterId: string;
  slots: RequirementSlot[]; // only the slots that carry a printed requirement
  verificationStatus: VerificationStatus;
  notes: string[];
}

export interface ProgrammeRecord {
  programmeCode: string;
  programmeName: string;
  institutionCode: string;
  institutionName: string;
  clusterId: number | null;
  subClusterId: string | null;
  cutoffs: CutoffObservation[];
  verificationStatus: VerificationStatus;
  /** Why a record is not 'validated' (empty for validated records). */
  issues: string[];
}

export type CandidateGradeMap = Record<string, Grade>;

export type { Grade, RequirementSlot, SlotRule };
