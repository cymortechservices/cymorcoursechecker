# Deployment (not performed by the author; steps for you)

1. **MongoDB Atlas**: create a cluster, a DB user, and allow Render's outbound IPs (or 0.0.0.0/0 with a strong password). Copy the connection string.
2. **Render (API)**: new Web Service from `backend/` (or use `render.yaml`). Build `npm install --include=dev && npm run build` (devDependencies are needed to compile TypeScript), start `npm start`. Set `MONGODB_URI`, `JWT_SECRET` (>=32 random chars), `CORS_ORIGINS` (your Vercel URL).
3. **Seed data**: from your PC with `backend/.env` pointing at Atlas, run the import/validate/activate commands in `DATA_IMPORT_GUIDE.md`. Create the first admin with `create:admin` (credentials via environment variables).
4. **Vercel (web)**: import `frontend/`, framework Vite, env `VITE_API_BASE_URL=https://<render-app>.onrender.com/api/v1`.
5. Verify `GET /api/v1/health`, then run a check end-to-end and download a PDF.

Free Render instances sleep; the first request after idle can take ~30-60 s.
Transactions (activation/rollback) require an Atlas replica set (all Atlas clusters are).
