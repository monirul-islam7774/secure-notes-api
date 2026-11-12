# Deployment plan

Nothing here is deployed automatically. Follow these steps manually.

## 1. MongoDB Atlas (M0 free)
1. Create a free M0 cluster.
2. Database Access: add a DB user (username + strong password).
3. Network Access: add `0.0.0.0/0` (Render free has no static IP).
4. Connect > Drivers: copy the SRV URI and include the database name:
   `mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/secure-notes?retryWrites=true&w=majority`. Never commit it.

## 2. Backend to Render (Web Service, Free)
- Connect the `secure-notes-api` GitHub repo.
- Build command: `npm install`. Start command: `npm start`. Health check path: `/api/health`.
- Environment variables:

| Key | Value |
|---|---|
| `MONGO_URI` | Atlas SRV URI from step 1 |
| `JWT_SECRET` | long random string, e.g. `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_EXPIRES_IN` | `1d` |
| `CORS_ORIGIN` | the frontend URL (set in step 4) |
| `NODE_ENV` | `production` |

- After the first deploy, run once (Render Shell, or locally with `MONGO_URI` set to the Atlas URI):
  `npm run sync-indexes` then `npm run seed`. `autoIndex` is off in production, so indexes are only created by `sync-indexes`.
- Free instances sleep after ~15 min idle; the first request takes 30–50 s. **Open `/api/health` before reviewers do.**
- Alternative (only if Render is unavailable): Vercel serverless. Export the Express app from `api/index.js` and cache the Mongoose connection across invocations.

## 3. Frontend to Vercel (or Netlify)
- Import `secure-notes-web`; framework preset Vite; build `npm run build`; output `dist`.
- Env: `VITE_API_URL=https://<render-app>.onrender.com/api`. Redeploy after setting it (Vite inlines env vars at build time).
- SPA fallback is handled by `vercel.json` and `public/_redirects`.

## 4. Wire CORS
Set Render `CORS_ORIGIN` to the exact Vercel URL (no trailing slash; comma-separate multiple origins) and redeploy the backend.

## 5. Smoke test live
Log in as admin and as a user, visit every page, and confirm `/interests` and `/users/:id/posts` return data.

## 5b. CI/CD (GitHub Actions)

Both repos have `.github/workflows/ci-cd.yml`. Tests/build run on every PR and push; deploys run only on `main` after they pass. Deploy jobs skip with a warning if their secrets are missing.

Backend repo (Settings > Secrets and variables > Actions, environment `production`):

| Name | Kind | Value |
|---|---|---|
| `RENDER_API_KEY` | secret | Render > Account Settings > API Keys |
| `RENDER_SERVICE_ID` | secret | `srv-...` id from the service URL |
| `MONGO_URI` | secret | Atlas SRV URI (used to run `sync-indexes` before each deploy) |
| `API_URL` | variable | `https://<render-app>.onrender.com` (no trailing slash) |

Frontend repo:

| Name | Kind | Value |
|---|---|---|
| `VERCEL_TOKEN` | secret | Vercel > Account > Tokens |
| `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | secrets | from `.vercel/project.json` after `npx vercel link` |
| `VITE_API_URL` | Vercel project env var (Production) | `https://<render-app>.onrender.com/api` |

Render auto-deploy is off (`render.yaml`) and Vercel git deploys are off (`vercel.json`) so the pipeline is the single deploy path.

## 6. Submission checklist
- Frontend repo URL and backend repo URL
- Live frontend URL and live API URL (`/api/health`)
- Demo credentials (admin@demo.com / Admin@123, alice@demo.com / User@123)
- One-line note: "Backend is on Render free tier; first request may take 30–50 s (cold start)."
- Reply All on the original email thread.
