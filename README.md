# CYMOR KUCCPS CourseChecker

Enter KCSE grades, see for free how many degree programmes you qualify for (subject requirements met **and** estimated cluster score >= cutoff). A one-time **KSh 149** M-Pesa payment (Daraja STK push) unlocks **both** the ranked list with six suggested application choices **and** the PDF report, which is also emailed to the address collected. Optional coupon codes give percentage discounts; an admin dashboard shows reports generated, money earned, orders and coupons.

**Aggregate (mean) rule used:** Mathematics (compulsory) + the better of English/Kiswahili + the best five of the remaining subjects (the weaker language may count among those five).

**Support shown in the app and PDF:** simion@karimique.com, WhatsApp 0113821327.

**PDF report order:** cover -> your recommended application choices (1A/1B/1C = same programme at three universities; 2, 3, 4 = other programmes) -> every qualifying programme from the **highest cutoff down to the lowest** -> candidate profile -> methodology and disclaimer -> a closing note from Legendary Smiley Cymor with support contacts. Page numbers and a report reference are on every page.

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


## Environment variables (set these in the Render dashboard)
**Never commit real values.** Everything below is a name with a placeholder. Real M-Pesa and Brevo keys go only in Render > your service > Environment.

| Variable | Required | Example / placeholder | Notes |
|---|---|---|---|
| `MONGODB_URI` | yes | `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/...` | Atlas connection string |
| `MONGODB_DB_NAME` | no | `cymor_coursechecker` | |
| `JWT_SECRET` | yes | 48+ random chars | admin tokens |
| `CORS_ORIGINS` | yes | `https://your-site.vercel.app,https://synchro.co.ke` | comma separated, exact origins |
| `PUBLIC_SITE_URL` | recommended | `https://your-site.vercel.app` | frontend URL |
| `SEED_KEY` | one-time | 32+ random chars | delete after seeding |
| `PRICE_KES` | no | `149` | price before coupons |
| `SUPPORT_EMAIL` | no | `simion@karimique.com` | shown in app, PDF, emails |
| `SUPPORT_WHATSAPP` | no | `0113821327` | |
| `MPESA_ENV` | yes for payments | `sandbox` or `production` | |
| `MPESA_CONSUMER_KEY` | yes for payments | `your-daraja-consumer-key` | Daraja app |
| `MPESA_CONSUMER_SECRET` | yes for payments | `your-daraja-consumer-secret` | |
| `MPESA_SHORTCODE` | yes for payments | `174379` (sandbox) | Paybill or Till number |
| `MPESA_PASSKEY` | yes for payments | `your-daraja-passkey` | Lipa Na M-Pesa Online passkey |
| `MPESA_TRANSACTION_TYPE` | no | `CustomerPayBillOnline` or `CustomerBuyGoodsOnline` | use BuyGoods for a Till |
| `MPESA_PARTY_B` | no | Till number | defaults to `MPESA_SHORTCODE` |
| `MPESA_CALLBACK_BASE_URL` | yes for payments | `https://cymorcoursechecker.onrender.com` | your API's public URL, no trailing slash |
| `MPESA_CALLBACK_SECRET` | yes for payments | 24+ random chars | generate: `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"` |
| `BREVO_API_KEY` | for emailing reports | `your-brevo-api-key` | free Brevo account; HTTPS API (SMTP is blocked on Render free) |
| `EMAIL_FROM` | for emailing reports | `reports@your-domain` | must be a sender verified in Brevo |
| `EMAIL_FROM_NAME` | no | `CYMOR CourseChecker` | |

Frontend (Vercel): `VITE_API_BASE_URL` = `https://cymorcoursechecker.onrender.com` (the `/api/v1` suffix is added automatically).

If the M-Pesa variables are missing the API still starts and logs a warning; paid checkout then answers "payments unavailable" (reports are never unlocked for free by mistake). If the Brevo variables are missing, reports are simply not emailed (users can still download the PDF).

### Daraja checklist
1. Create an app at developer.safaricom.co.ke, copy the consumer key/secret, and (for production) get your shortcode and Lipa Na M-Pesa passkey via Go Live.
2. Set the variables above in Render. The callback URL given to Safaricom is built by the server as `MPESA_CALLBACK_BASE_URL/api/v1/payments/mpesa/callback/<MPESA_CALLBACK_SECRET>` (the secret keeps strangers from calling it). It must be public HTTPS, so test in sandbox first.
3. Pay with a sandbox test number, confirm the order turns **paid** in `/admin`. Render's free tier sleeps; if a callback is missed the browser's status polling asks Daraja directly (STK query), so the order is still unlocked.
4. Payments are verified server-side: only a callback/query reporting success with an amount >= the amount due unlocks a report, and each order is marked paid exactly once.

### Admin dashboard
No shell on Render? Add `ADMIN_EMAIL` and `ADMIN_PASSWORD` (12+ characters) in the Render dashboard and save: on startup the API creates that admin if it does not exist yet. Then **delete `ADMIN_PASSWORD`** from Render (the account stays). Otherwise run `npm run create:admin` from your computer.

Open `https://<your-site>/admin`, sign in with the admin created by `npm run create:admin` (set `ADMIN_EMAIL`, `ADMIN_PASSWORD` env vars once). It shows reports generated, money earned (today / 7 / 30 days), conversion, a 14-day chart, an orders table (search, status filter, CSV export, resend report email) and coupons (create percentage codes with optional max uses and expiry; enable/disable). Coupons are applied by the server when pricing and the percentage actually reduces the amount sent to M-Pesa; a 100% coupon unlocks for free. Only users with the `admin` role can create coupons or resend emails.

## Verification status (read this)
**Actually run in the authoring sandbox:**
- `npm test` suite: **99 tests, 99 passed, 0 failed** (scoring, grammar, exact cutoff, eligibility, recommendations, PDF generation incl. 0/1/180 options, validators, services with in-memory repositories, and a full import of the two real PDFs, plus payments logic: phone normalisation, coupon pricing, STK push request shape against a fake `fetch`, callback verification and idempotence, STK-query fallback, order statistics, dashboard permissions and CSV safety, report emailing with a fake sender). The package registry was blocked there, so `bcryptjs` and `jsonwebtoken` were replaced by small test-only stand-ins to run the service tests; with real packages installed the same tests should pass but **you must confirm by running `npm test`**.
- The PDF report was generated from the real data (113 pages for a sample candidate) and the pages were inspected visually.

**NOT executed (written carefully but never run):**
- The Express app/routes/middleware (including the payment, callback and admin routes), the Mongoose models and repositories (including orders and coupons), the real Daraja and Brevo network calls, the CLI scripts against a database.
- The React frontend including the payment screen and admin dashboard (only syntax-checked with esbuild; not type-checked, built or opened in a browser).
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
