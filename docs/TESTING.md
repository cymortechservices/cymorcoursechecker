# Testing

```powershell
cd backend
npm install
npm test            # node:test via tsx
```
Real-PDF import tests run when the PDFs are in `backend/data/source/` (override with `KUCCPS_PDF_DIR`).

## What the suite covers
Scoring formula and aggregate; slot selection incl. strict ordinals; requirement grammar; exact cutoff comparison (equal included, next value excluded, BigInt vs float agreement over the input space); eligibility (met/unmet, missing cutoff, same programme at many universities, unvalidated excluded, shared cutoffs flagged, sort by highest cutoff); recommendations (1A-1C vs 2-4, preferences, empty); PDF generation (0, 1, 180 options, long/odd text, section order, page numbers); request validators; checker and admin services against in-memory repositories (token enforcement, lockout, activation gate, rollback, failed import leaves active data intact); full import of the real PDFs.

## Honest status of the author's run
See README "Verification status". Express routes, the Mongoose repository and the React app could **not** be executed in the authoring sandbox (package registry blocked); the service/test layer was run with stand-ins for `bcryptjs` and `jsonwebtoken`. Run `npm test` yourself after `npm install`, then `npm run typecheck` in both folders.
