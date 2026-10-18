/**
 * Parser for the KUCCPS "Degree Programme Clusters" document.
 *
 * Document layout (each page, landscape):
 *   - A cluster header row: cluster number at x~52 plus "Subject 1..4" column headings.
 *     The following rows (until the first sub-cluster row) hold the cluster-level
 *     slot definitions, e.g. "Any GROUP II or any GROUP III".
 *   - A sub-cluster row: label such as "2A" at x~82 with per-slot MINIMUM requirement
 *     text, e.g. "MAT ALTERNATIVE A/B - C (PLAIN)". Requirement text may wrap onto
 *     following rows in the same column.
 *   - Programme names in two columns (x~117 and x~439); long names wrap onto the next
 *     row inside the same column.
 *
 * The parser only returns RAW text plus geometry-derived structure. Interpretation of
 * the slot text lives in modules/requirements so that it can be unit-tested.
 */
import { PdfLine, Segment, lineText } from './pdfText';

export interface ClusterSlotsRaw {
  1: string;
  2: string;
  3: string;
  4: string;
}

export interface ClusterDefinitionRaw {
  clusterId: number;
  page: number;
  slots: ClusterSlotsRaw;
}

export interface SubClusterRaw {
  clusterId: number;
  subClusterId: string; // e.g. "2A"
  page: number;
  slots: ClusterSlotsRaw;
  /** Free text that did not sit in a slot column (flagged for review). */
  strayText: string[];
}

export interface ClusterProgrammeRaw {
  clusterId: number;
  subClusterId: string;
  name: string;
  page: number;
  column: 'A' | 'B';
}

export interface ClusterDocParseResult {
  clusters: ClusterDefinitionRaw[];
  subClusters: SubClusterRaw[];
  programmes: ClusterProgrammeRaw[];
  diagnostics: string[];
}

const PROGRAMME_START = /^(Bachelor|Bahelor|Doctor|Diploma|Master)\b/i;
const SUBCLUSTER_LABEL = /^(\d{1,2})\s?([A-Z])$/;
const COL_B_X = 420; // programme column B begins right of this x

function emptySlots(): ClusterSlotsRaw {
  return { 1: '', 2: '', 3: '', 4: '' };
}

function joinFragment(prev: string, next: string): string {
  const n = next.replace(/\s+/g, ' ').trim();
  if (!prev) return n;
  // The printed document repeats some cells verbatim (e.g. "ENG/KIS" twice); keep one copy.
  if (prev === n) return prev;
  return `${prev} ${n}`.replace(/\s+/g, ' ').trim();
}

function nearestSlot(x: number, anchors: number[]): 1 | 2 | 3 | 4 {
  let best = 0;
  let bestD = Infinity;
  anchors.forEach((a, i) => {
    const d = Math.abs(a - x);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return (best + 1) as 1 | 2 | 3 | 4;
}

const DEFAULT_ANCHORS = [117, 297, 439, 589];

function isChrome(line: PdfLine): boolean {
  const t = lineText(line);
  return (
    /^CLUSTER\b/.test(t) ||
    /^SUB-?\s*$/.test(t) ||
    /^PROGRAMMES AND SUBJECT REQUIREMENTS/.test(t) ||
    /^DEGREE PROGRAMME CLUSTERS/.test(t) ||
    /Copyright/i.test(t)
  );
}

export function parseClusterDocument(lines: PdfLine[]): ClusterDocParseResult {
  const result: ClusterDocParseResult = { clusters: [], subClusters: [], programmes: [], diagnostics: [] };
  let anchors = DEFAULT_ANCHORS;
  let clusterId: number | null = null;
  let current: ClusterDefinitionRaw | null = null;
  let sub: SubClusterRaw | null = null;
  let mode: 'none' | 'clusterdef' | 'subdef' | 'programmes' = 'none';
  const lastProgrammeIdx: { A: number; B: number } = { A: -1, B: -1 };

  const resetProgrammeTracking = () => {
    lastProgrammeIdx.A = -1;
    lastProgrammeIdx.B = -1;
  };

  for (const line of lines) {
    const segs = line.segments;
    if (segs.length === 0) continue;
    const first = segs[0] as Segment;

    // Cluster header row: "<n>  Subject 1 ... Subject 4"
    if (first.x < 70 && /^\d{1,2}$/.test(first.text) && segs.some((s) => /^Subject\s*1$/i.test(s.text))) {
      clusterId = Number(first.text);
      const subjectSegs = segs.filter((s) => /^Subject\s*[1-4]$/i.test(s.text));
      anchors = subjectSegs.length === 4 ? subjectSegs.map((s) => s.x) : DEFAULT_ANCHORS;
      current = { clusterId, page: line.page, slots: emptySlots() };
      result.clusters.push(current);
      sub = null;
      mode = 'clusterdef';
      resetProgrammeTracking();
      continue;
    }
    if (isChrome(line)) continue;
    if (clusterId === null || current === null) continue;

    // Sub-cluster row: label at x~82
    if (first.x >= 70 && first.x < 105 && SUBCLUSTER_LABEL.test(first.text)) {
      const m = SUBCLUSTER_LABEL.exec(first.text) as RegExpExecArray;
      sub = {
        clusterId,
        subClusterId: `${m[1]}${m[2]}`,
        page: line.page,
        slots: emptySlots(),
        strayText: [],
      };
      if (Number(m[1]) !== clusterId) {
        result.diagnostics.push(`Sub-cluster ${sub.subClusterId} on page ${line.page} sits under cluster ${clusterId}`);
      }
      result.subClusters.push(sub);
      mode = 'subdef';
      resetProgrammeTracking();
      for (const s of segs.slice(1)) {
        if (PROGRAMME_START.test(s.text)) {
          // Programme names can start on the label row itself.
          mode = 'programmes';
          const col: 'A' | 'B' = s.x >= COL_B_X ? 'B' : 'A';
          result.programmes.push({ clusterId, subClusterId: sub.subClusterId, name: s.text, page: line.page, column: col });
          lastProgrammeIdx[col] = result.programmes.length - 1;
          continue;
        }
        const idx = nearestSlot(s.x, anchors);
        sub.slots[idx] = joinFragment(sub.slots[idx], s.text);
      }
      continue;
    }

    // Programme rows: switch mode as soon as a programme-name segment appears
    const hasProgramme = segs.some((s) => s.x >= 100 && PROGRAMME_START.test(s.text));
    if (mode === 'subdef' && hasProgramme) mode = 'programmes';
    if (mode === 'clusterdef' && hasProgramme) {
      // Programmes listed directly under a cluster without a sub-cluster row.
      result.diagnostics.push(`Page ${line.page}: programme names before any sub-cluster in cluster ${clusterId}`);
      mode = 'programmes';
    }

    if (mode === 'clusterdef') {
      for (const s of segs) {
        const idx = nearestSlot(s.x, anchors);
        current.slots[idx] = joinFragment(current.slots[idx], s.text);
      }
      continue;
    }
    if (mode === 'subdef' && sub) {
      for (const s of segs) {
        const idx = nearestSlot(s.x, anchors);
        sub.slots[idx] = joinFragment(sub.slots[idx], s.text);
      }
      continue;
    }
    if (mode === 'programmes' && sub) {
      for (const s of segs) {
        const col: 'A' | 'B' = s.x >= COL_B_X ? 'B' : 'A';
        if (PROGRAMME_START.test(s.text)) {
          result.programmes.push({
            clusterId,
            subClusterId: sub.subClusterId,
            name: s.text.replace(/\s+/g, ' ').trim(),
            page: line.page,
            column: col,
          });
          lastProgrammeIdx[col] = result.programmes.length - 1;
        } else {
          const idx = lastProgrammeIdx[col];
          const target = idx >= 0 ? result.programmes[idx] : undefined;
          if (target && target.subClusterId === sub.subClusterId) {
            target.name = joinFragment(target.name, s.text);
          } else {
            sub.strayText.push(`p${line.page}: ${s.text}`);
          }
        }
      }
    }
  }
  return result;
}
