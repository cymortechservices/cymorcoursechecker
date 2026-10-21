# Deployment (not performed by the author; steps for you)

1. **MongoDB Atlas**: create a cluster, a DB user, and allow Render's outbound IPs (or 0.0.0.0/0 with a strong password). Copy the connection string.
2. **Render (API)**: new Web Service from `backend/` (or use `render.yaml`). Build `npm install --include=dev && npm run build` (devDependencies are needed to compile TypeScript), start `npm start`. Set `MONGODB_URI`, `JWT_SECRET` (>=32 random chars), `CORS_ORIGINS` (your Vercel URL).
3. **Seed data**: from your PC with `backend/.env` pointing at Atlas, run the import/validate/activate commands in `DATA_IMPORT_GUIDE.md`. Create the first admin with `create:admin` (credentials via environment variables).
4. **Vercel (web)**: import `frontend/`, framework Vite, env `VITE_API_BASE_URL=https://<render-app>.onrender.com/api/v1`.
5. Verify `GET /api/v1/health`, then run a check end-to-end and download a PDF.

Free Render instances sleep; the first request after idle can take ~30-60 s.
Transactions (activation/rollback) require an Atlas replica set (all Atlas clusters are).

## Troubleshooting
- **"Route not found" in the website**: `VITE_API_BASE_URL` must point at the API and end with `/api/v1` (the site appends it if missing). Open `https://<render-app>.onrender.com/api/v1` in a browser: you should see a small JSON status. After changing a Vercel variable you must **redeploy** the frontend.
- **CORS errors**: `CORS_ORIGINS` on Render must contain your exact Vercel URL (no trailing slash).
- **"No dataset is active"**: run the import and activate commands in `DATA_IMPORT_GUIDE.md`.

## Seeding without a shell (Render free tier)
1. In Render > Environment add `SEED_KEY` = a random 32+ character value (`node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`). Save; the service redeploys.
2. Call the seed endpoint once (PowerShell):
   ```powershell
   Invoke-RestMethod -Method Post -Uri "https://<render-app>.onrender.com/api/v1/admin/seed" -Headers @{ "X-Seed-Key" = "<your key>" } -TimeoutSec 300
   ```
   It imports the PDFs bundled in `backend/data/source`, runs the activation checks and activates the dataset.
3. Verify `GET /api/v1/metadata`, then **delete `SEED_KEY`** from Render.

The endpoint is disabled when `SEED_KEY` is unset, compares the key in constant time, reads the key only from the `X-Seed-Key` header, is rate limited, and refuses to run if any dataset is already active.


## Payments and email
See the environment-variable table and Daraja checklist in the root `README.md`. Set `MPESA_*`, `BREVO_API_KEY`, `EMAIL_FROM` and `MPESA_CALLBACK_*` in the Render dashboard; add your custom domain (e.g. https://synchro.co.ke) to `CORS_ORIGINS`.
