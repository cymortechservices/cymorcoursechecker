# Scoring methodology

**Status: the formula and the aggregate rule are NOT printed in the supplied PDFs. They come from published secondary sources and are unverified. All scores are estimates.**

- Grade points: A=12, A-=11, B+=10, B=9, B-=8, C+=7, C=6, C-=5, D+=4, D=3, D-=2, E=1.
- `C = sqrt((r/48) * (t/84)) * 48`, r = points in the 4 cluster-slot subjects, t = aggregate of 7 subjects. No cap at 100, no rounding before comparison.
- Aggregate t (configurable, 7 subjects, max 84): **Mathematics (compulsory) + the better of English and Kiswahili + the best five of the remaining subjects** (the weaker language competes with the other subjects). This is the current KCSE mean-grade rule as provided by the product owner; it is not printed in the supplied PDFs. The older rule (English + Kiswahili + Mathematics + best four) remains available as `COMPULSORY_PLUS_BEST_FOUR`.
- Cluster slots come from the cluster header rows; the four subjects maximising r are chosen exhaustively without reusing a subject. A slot that cannot be filled legitimately leaves the programme unassessed; no filler is substituted. "2nd GROUP II" is applied strictly.
- Subject groups I-V are **assumed** (KNEC convention); the PDFs do not define them.
- Minimum subject requirements (sub-cluster rows) are separate from slot definitions. Each requirement cell is an OR-list; all cells must be met by **different** subjects.
- **Cutoff comparison is exact**: `r*t*2304*10^(2d) >= k^2*4032` in BigInt, so a score equal to the cutoff is included.
- A general minimum mean grade (e.g. C+) is not in the PDFs and is not applied; the report says so.

## Cutoff policy
Default `latest-specific`: for each programme, the newest cutoff that is *not* a shared value; if only shared values exist, the newest is used and flagged `*`. Alternatives: `latest-available`, `fixed-year`. A missing cutoff is never zero.

## Why some universities show identical cutoffs
In the source cutoff table, 2020-2023 columns repeat generic values across hundreds of programmes (for example one value appears ~297 times). Values repeated 5+ times in a year are flagged `shared` and de-prioritised.
