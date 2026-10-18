/**
 * Programme-name matching between the cutoff document (UPPER CASE, 2025/2026 names) and
 * the cluster document (Title Case, 2024 names).
 *
 *  tier 'exact'      : equal after case/punctuation/"&" normalisation (key1)
 *  tier 'normalized' : equal after additionally ignoring connector words (IN, OF, AND,
 *                      THE, WITH, FOR, TO, A) and known spelling variants (key2)
 *  otherwise         : unmatched; similar names are offered as SUGGESTIONS only and are
 *                      never applied automatically.
 */
const SPELLING: Record<string, string> = {
  COUNSELING: 'COUNSELLING',
  THEATER: 'THEATRE',
  BAHELOR: 'BACHELOR',
  BA: 'BACHELOR OF ARTS',
  BSC: 'BACHELOR OF SCIENCE',
};
const CONNECTORS = new Set(['IN', 'OF', 'AND', 'THE', 'WITH', 'FOR', 'TO', 'A']);

export function key1(name: string): string {
  return name
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => (t === 'BAHELOR' ? 'BACHELOR' : t))
    .join(' ');
}

export function key2(name: string): string {
  const expanded = key1(name)
    .split(' ')
    .map((t) => SPELLING[t] ?? t)
    .join(' ');
  return expanded
    .split(' ')
    .filter((t) => !CONNECTORS.has(t))
    .join(' ');
}

export function tokenSet(name: string): Set<string> {
  return new Set(key2(name).split(' ').filter(Boolean));
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}
