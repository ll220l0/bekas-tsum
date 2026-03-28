# Dordoi Food Web (v3 / 2026-ready)

PWA web-app for market restaurants (container delivery):
- guest menu
- cart + checkout (line / container)
- payment by **bank** or **cash**
- manual confirmation by restaurant
- **Admin hidden from clients** (no client links) + login page/session protection
- Admin menu editor (categories + items CRUD)
- Admin orders: confirm bank payments

## Run

```bash
npm i
docker compose up -d
cp .env.example .env
npm run prisma:migrate
npm run db:seed
npm run dev
```

To enable PWA locally in development:
- PowerShell: `$env:PWA_DEV="true"; npm run dev`
- Bash: `PWA_DEV=true npm run dev`

Open:
- http://localhost:3000
- root URL opens the first active restaurant automatically
- /admin/login (login from .env)

## Seed behavior
- `npm run db:seed` now creates only an empty active restaurant (if none exists).
- Test categories/items are no longer created automatically.

## GitHub + deploy

### 1) Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-user>/<your-repo>.git
git push -u origin main
```

### 2) CI in GitHub Actions
- Workflow file: `.github/workflows/ci.yml`
- Runs on push/PR:
  - `npm ci`
  - `npm run lint`
  - `npm run build`

### 3) Deploy from GitHub (Vercel)
1. Import repository in Vercel.
2. Add environment variables in project settings:
   - `DATABASE_URL`
   - `BLOB_READ_WRITE_TOKEN` (required on Vercel for image uploads)
   - `ADMIN_USER`
   - `ADMIN_PASS`
   - `ADMIN_SESSION_SECRET` (strong random secret for signed admin session cookies)
   - `ADMIN_BANK_PASS` (optional, separate password for bank numbers changes in admin menu)
   - `NEXT_PUBLIC_APP_NAME`
   - `NEXT_PUBLIC_DEFAULT_RESTAURANT_SLUG` (unique slug per project, e.g. `bekas-dordoi` / `bekas-tsum`)
   - `NEXT_PUBLIC_MBANK_PAY_URL` (optional, overrides default bank deeplink template)
   - `FREEDOMPAY_MERCHANT_ID` (Freedom Pay project ID)
   - `FREEDOMPAY_SECRET_KEY` (Freedom Pay secret key for incoming payments)
   - `FREEDOMPAY_PAYOUT_SECRET_KEY` (optional, payouts key)
   - `FREEDOMPAY_API_BASE` (default: `https://api.freedompay.kz`)
   - `FREEDOMPAY_CURRENCY` (optional, leave empty to use project currency in Freedom Pay cabinet)
   - `FREEDOMPAY_TEST_MODE` (`1` for sandbox, `0` for production)
   - `APP_BASE_URL` (public app URL for Freedom Pay callbacks)
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (for Web Push)
   - `VAPID_PRIVATE_KEY` (for Web Push)
   - `VAPID_SUBJECT` (for Web Push, e.g. `mailto:admin@example.com`)
3. Deploy.
4. This repo includes `vercel.json`; Vercel build runs `npm run vercel-build` (without DB migrations).

### 4) Production DB migration
Run once for production database (or after adding new migrations):
```bash
npm run prisma:migrate:deploy
```

## Vercel: quick fix for server error

If you see `Application error: a server-side exception has occurred`, usually DB/env is not configured.

### Required environment variables (Production)
- `DATABASE_URL`
- `ADMIN_USER`
- `ADMIN_PASS`
- `ADMIN_SESSION_SECRET`
- `ADMIN_BANK_PASS` (optional)
- `NEXT_PUBLIC_APP_NAME`
- `NEXT_PUBLIC_DEFAULT_RESTAURANT_SLUG` (must be unique for each project deployment)
- `NEXT_PUBLIC_MBANK_PAY_URL` (optional)
- `FREEDOMPAY_MERCHANT_ID`
- `FREEDOMPAY_SECRET_KEY`
- `FREEDOMPAY_PAYOUT_SECRET_KEY` (optional)
- `FREEDOMPAY_API_BASE` (default: `https://api.freedompay.kz`)
- `FREEDOMPAY_CURRENCY` (optional, leave empty to use project currency in Freedom Pay cabinet)
- `FREEDOMPAY_TEST_MODE` (`1` sandbox, `0` prod)
- `APP_BASE_URL` (for Freedom Pay callback URLs)
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (for Web Push)
- `VAPID_PRIVATE_KEY` (for Web Push)
- `VAPID_SUBJECT` (for Web Push)

### `DATABASE_URL` format examples
- Neon:
`postgresql://USER:PASSWORD@ep-xxxx.REGION.aws.neon.tech/DBNAME?sslmode=require&channel_binding=require`
- Supabase:
`postgresql://postgres:PASSWORD@db.xxxxx.supabase.co:5432/postgres?sslmode=require`
- Railway:
`postgresql://postgres:PASSWORD@HOST:PORT/railway?sslmode=require`

Important:
- if password has special chars (`@`, `:`, `/`, `#`, `%`) URL-encode it.
- never use `localhost` in Vercel production.

### Validate deployment after redeploy
Open:
- `https://<your-domain>/api/health`

Expected:
- `"ok": true`
- `"db.ok": true`
- `missingEnv` is empty.

### Run production migrations
From local terminal (PowerShell), point Prisma to production DB once:
```powershell
$env:DATABASE_URL="postgresql://..."; npx prisma migrate deploy
```

### If you see `P2021` (`public.Restaurant` does not exist)
- Your production database is empty or migrations were not applied.
- Redeploy after setting correct `DATABASE_URL`.
- Verify: `https://<your-domain>/api/health` must return `"db.ok": true`.

## New operational features
- Role-based admin accounts: `owner`, `operator`, `courier`.
- Real-time updates over SSE for order/payment/admin order board.
- Admin audit log API: `/api/admin/audit`.
- Daily analytics API/page: `/api/admin/reports/daily`, `/admin/reports`.
- Idempotent order create (`x-idempotency-key`) to prevent duplicates.

### Additional env vars
- `ADMIN_OPERATOR_USER`
- `ADMIN_OPERATOR_PASS`
- `ADMIN_COURIER_USER`
- `ADMIN_COURIER_PASS`
- `FREEDOMPAY_MERCHANT_ID`
- `FREEDOMPAY_SECRET_KEY`
- `FREEDOMPAY_PAYOUT_SECRET_KEY` (optional)
- `FREEDOMPAY_API_BASE` (default: `https://api.freedompay.kz`)
- `FREEDOMPAY_CURRENCY` (optional, leave empty to use project currency in Freedom Pay cabinet)
- `FREEDOMPAY_TEST_MODE` (`1` sandbox, `0` prod)
- `APP_BASE_URL` (public origin used for callback/success/failure URLs)
- `ORDER_PAYMENT_TIMEOUT_MINUTES` (auto-cancel timeout for unpaid bank orders, default `8`)
- `ORDER_CREATE_LIMIT_PER_MINUTE` (soft throttle cap, default `20`)
- `ORDER_CREATE_THROTTLE_DELAY_MS` (soft-throttle delay before recheck, default `450`)
- `ORDER_DUPLICATE_WINDOW_SECONDS` (server anti-duplicate window, default `90`)
- `SLO_PAYMENT_CONFIRM_MINUTES` (SLA target for payment confirmation, default `8`)
- `SLO_DELIVERY_MINUTES` (SLA target for delivery, default `35`)

### Smoke checks
```bash
npm run smoke
# optional
SMOKE_BASE_URL=https://your-domain npm run smoke
```




