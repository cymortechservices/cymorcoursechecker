# Data import guide

Source files (included for convenience in `backend/data/source/`):
- `DEGREE_CLUSTER_DOCUMENT_11_2_2024.pdf`
- `DEGREE_CUTOFFS_14_07_2025.pdf`

Dates and titles are read from the **document contents/metadata**, never from file names.

## Steps (PowerShell, from `backend/`)
```powershell
copy .env.example .env      # fill MONGODB_URI and JWT_SECRET
npm install
npm run import:pdfs -- --cluster data/source/DEGREE_CLUSTER_DOCUMENT_11_2_2024.pdf --cutoffs data/source/DEGREE_CUTOFFS_14_07_2025.pdf --dry-run
npm run import:pdfs -- --cluster data/source/DEGREE_CLUSTER_DOCUMENT_11_2_2024.pdf --cutoffs data/source/DEGREE_CUTOFFS_14_07_2025.pdf
npm run validate:dataset -- --version <printed version>
npm run activate:dataset -- --version <printed version>
```
`--dry-run` writes nothing. Import always creates a **draft**; activation is a separate, gated step. Re-importing identical files is refused.

## What the importer does
1. Extracts text with coordinates (pdfjs), rebuilds lines/columns.
2. Parses cluster definitions, sub-cluster minimum requirements and programme lists; parses the 2018-2024 cutoff table.
3. Matches each cutoff row to a sub-cluster by programme name: exact, normalised (connector words/spelling), ambiguous or unmatched. **Ambiguous/unmatched rows are never auto-assigned**; they go to the review queue.
4. Flags cutoff values repeated by 5+ records in one year as **shared minimums**.

## Result on the supplied files (measured)
- 2,122 programme rows, 11,488 cutoff observations, 0 duplicate codes.
- Matching: 1,545 exact, 121 normalised, 13 ambiguous, 443 unmatched.
- 1,625 validated, 497 awaiting review, 107 with no cutoff at all (can never qualify).
- 56 of 59 sub-clusters usable; 15E, 19C and 19I have requirement text the grammar refuses to guess.
- Unmatched rows exist mostly because the 2024 cluster PDF lacks many newer programme names. They are excluded, not guessed.

## Review and correct (admin API)
`GET /admin/datasets/:v/review`, then `POST /admin/datasets/:v/corrections` with `map_programme`, `reject_programme` or `override_requirement_slot`. Every correction is audited. Only drafts are editable.
