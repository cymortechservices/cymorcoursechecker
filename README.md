# CYMOR KUCCPS CourseChecker

Enter KCSE grades, get the degree programmes you qualify for (subject requirements met **and** estimated cluster score >= cutoff), a ranked list, six suggested application choices and a PDF report.

**PDF report order:** cover -> your recommended application choices (1A/1B/1C = same programme at three universities; 2, 3, 4 = other programmes) -> every qualifying programme from the **highest cutoff down to the lowest** -> candidate profile -> methodology and disclaimer. Page numbers and a report reference are on every page.

```
frontend/   React + TS + Vite + Tailwind + Framer Motion + React Router + RHF/Zod + Lucide  (Vercel)
backend/    Node + Express + TS + Mongoose, PDF import, scoring, eligibility, PDF report     (Render)
docs/       ARCHITECTURE, DATA_DICTIONARY, DATA_IMPORT_GUIDE, SCORING_METHODOLOGY, API, DEPLOYMENT, TESTING, PRIVACY
```

## Run locally (Windows PowerShell)
```powershell
# API
cd backend
copy .env.example .env     # set MONGODB_URI and JWT_SECRET (>= 32 chars)
npm install
npm test
npm run import:pdfs -- --cluster data/source/DEGREE_CLUSTER_DOCUMENT_11_2_2024.pdf --cutoffs data/source/DEGREE_CUTOFFS_14_07_2025.pdf
npm run activate:dataset -- --version <version printed by import>
npm run dev

# Web (new terminal)
cd frontend
copy .env.example .env
npm install
npm run dev
```
Create an admin only when you need the admin API: set `ADMIN_EMAIL` and `ADMIN_PASSWORD` (>= 12 chars) as environment variables, then `npm run create:admin`. There are no default accounts.

## Verification status (read this)
**Actually run in the authoring sandbox:**
- `npm test` suite: **69 tests, 69 passed, 0 failed** (scoring, grammar, exact cutoff, eligibility, recommendations, PDF generation incl. 0/1/180 options, validators, services with in-memory repositories, and a full import of the two real PDFs). The package registry was blocked there, so `bcryptjs` and `jsonwebtoken` were replaced by small test-only stand-ins to run the service tests; with real packages installed the same tests should pass but **you must confirm by running `npm test`**.
- The PDF report was generated from the real data (113 pages for a sample candidate) and the pages were inspected visually.

**NOT executed (written carefully but never run):**
- The Express app/routes/middleware, the Mongoose models and repository, the CLI scripts against a database.
- The React frontend (only syntax-checked with esbuild; not type-checked, built or opened in a browser).
- `tsc` type-checking of the backend (no `@types/node` available there). Run `npm run typecheck` in both folders and expect to fix small issues.
- **Nothing is deployed and no remote database has been populated.**

## Data and method caveats
- The cluster-score formula `C = sqrt((r/48)(t/84))*48`, the 12-point scale, the aggregate rule and subject groups I-V come from secondary sources/convention - **they are not printed in the supplied PDFs** - so every score is an estimate (see `docs/SCORING_METHODOLOGY.md`).
- Many cutoffs in 2020-2023 are identical across hundreds of programmes in the source PDF. These are flagged **shared minimum** (`*`), de-prioritised, and the year of every cutoff is shown.
- 443 of 2,122 programme rows could not be matched to a cluster (the 2024 cluster PDF lacks many newer programmes); they are excluded and queued for admin review - never guessed. 497 records await review, 107 have no cutoff at all.
- A general minimum mean grade (e.g. C+) is not in the PDFs and is not applied.
- Not affiliated with KUCCPS; confirm everything on the official portal.

## Security notes
Helmet headers, CORS allow-list, rate limits (public/PDF/admin), zod validation with unknown keys rejected, bounded page sizes, 50 KB JSON limit, PDF-only uploads to the OS temp dir (deleted after processing), bcrypt passwords, lockout, JWT in headers only, report access tokens in headers only (hash stored), unguessable report IDs, TTL expiry, no secrets in the repo.
