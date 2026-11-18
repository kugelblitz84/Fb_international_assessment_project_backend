# Backend setup, configuration and deployment

## Prerequisites

Git; Node.js 22.12+ within v22 or v24+; npm; PostgreSQL with permission to install `btree_gist`; optional Gemini, Cloudinary and SSLCommerz sandbox accounts. Use an empty local database, never a production database for development/testing.

## 1. Database

Create a PostgreSQL database and role (example using `psql` as a local administrator). Choose a strong local password when prompted.

```sql
CREATE ROLE autocare LOGIN;
\password autocare
CREATE DATABASE autocare OWNER autocare;
\connect autocare
CREATE EXTENSION IF NOT EXISTS btree_gist;
```

If your provider supports it, the migration role can install the extension itself; otherwise preinstall using an authorized database administrator. For managed PostgreSQL, use provider connection strings and SSL options as required. Do not run reset or `db push` instead of migrations.

## 2. Install and configure

```sh
git clone https://github.com/kugelblitz84/Fb_international_assessment_project_backend.git
cd Fb_international_assessment_project_backend
npm ci
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

PowerShell copy command: `Copy-Item .env.example .env`. Set `DATABASE_URL` to your new database, URL-encoding special characters in its password, and paste the generated value into `AUTH_ACCESS_TOKEN_SECRET`. Use `NODE_ENV=development`, `AUTH_COOKIE_SECURE=false`, `AUTH_COOKIE_SAME_SITE=lax`, `CORS_ORIGINS=http://localhost:5173` for the local browser example. Leave optional providers blank until configured. Keep `.env` private.

## 3. Apply schema, seed and create admin

```sh
npm run prisma:validate
npm run prisma:generate
npm run prisma:migrate:deploy
npm run prisma:seed
npm run admin:create
npm run start:dev
```

`migrate:deploy` applies committed migrations on a fresh database. `npm run prisma:migrate:dev` is for developing new migrations locally, not deployment. Seed inserts demonstration categories, services/packages, offers, bays, hours and public settings idempotently; it does not create accounts or renew expired offers. The admin CLI prompts for name, email and hidden password; it rejects existing email and creates an ACTIVE ADMIN. For noninteractive provisioning inject all three `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` using your secret mechanism and run the same command. Never put real passwords in Git or shell history. No admin is created at startup.

```sh
curl http://localhost:3000/api/v1/health/status
curl http://localhost:3000/api/v1/services
```

Health checks process liveness; catalog requests additionally exercise database access. Use the frontend setup guide to connect Flutter to this API.

## Environment reference

### Core and authentication

| Variable | Default / purpose |
|---|---|
| `NODE_ENV` | development; development/test/production |
| `PORT` | 3000; 1–65535 |
| `DATABASE_URL` | Required PostgreSQL runtime URL |
| `DIRECT_URL` | Optional direct migration URL; Prisma falls back to DATABASE_URL when unset. Do not set to an empty string. Use same database/branch. |
| `CORS_ORIGINS` | Exact comma-separated HTTP(S) browser origins; required HTTPS origins in production |
| `HTTP_BODY_LIMIT_BYTES` | 65536; 1024–1048576 |
| `AUTH_ACCESS_TOKEN_SECRET` | Required random secret, minimum 32 bytes, no placeholder |
| `AUTH_ACCESS_TOKEN_TTL_SECONDS` | 900; 60–3600 |
| `AUTH_REFRESH_TOKEN_TTL_SECONDS` | 2592000; 3600–7776000, absolute session lifetime |
| `AUTH_ISSUER` | autocare |
| `AUTH_AUDIENCE` | autocare-api |
| `AUTH_COOKIE_SAME_SITE` | lax; lax/strict/none |
| `AUTH_COOKIE_SECURE` | false in development/test, true in production; true required for SameSite=None |
| `BOOKING_HORIZON_DAYS` | 30; 1–90 |
| `BOOKING_SLOT_STEP_MINUTES` | 15; 5–120 |
| `TRUSTED_PROXY_ADDRESSES` | Empty = no proxy trust; verified explicit ingress IPs/CIDRs only |
| `TEST_DATABASE_URL` | Separate disposable test DB, not runtime config |

### Gemini

| Variable | Default / purpose |
|---|---|
| `GEMINI_API_KEY` | Blank disables assistant; server-only |
| `GEMINI_MODEL` | gemini-3.5-flash-lite; configurable, no automatic fallback |
| `GEMINI_TIMEOUT_MS` | 20000; 1000–60000 |
| `GEMINI_MAX_OUTPUT_TOKENS` | 1500; 128–4096 |
| `ASSISTANT_REQUESTS_PER_MINUTE` | 5; 1–60 per IP/user |
| `ASSISTANT_REQUESTS_PER_HOUR` | 20; 1–1000 per IP/user |
| `ASSISTANT_DAILY_REQUEST_BUDGET` | 100; 0–10000, database-backed UTC cap; 0 disables admitted requests |
| `ASSISTANT_MAX_CONCURRENT` | 2; 1–10 per process |

Use a model available to your Gemini project and set the application cap at/below actual provider quota. The default cap is not a promise of free-tier allowance. No provider secret belongs in Flutter.

### Cloudinary, payments and admin

| Variable | Default / purpose |
|---|---|
| `CLOUDINARY_CLOUD_NAME` | Optional; all three credentials required together |
| `CLOUDINARY_API_KEY` | Optional secret |
| `CLOUDINARY_API_SECRET` | Optional secret |
| `CLOUDINARY_FOLDER` | autocare; safe slash-separated path |
| `SSLCOMMERZ_STORE_ID` | Optional sandbox merchant ID; pair with password |
| `SSLCOMMERZ_STORE_PASSWORD` | Optional merchant secret |
| `SSLCOMMERZ_IS_LIVE` | false; keep false for assessment |
| `SSLCOMMERZ_TIMEOUT_MS` | 20000; 1000–60000 |
| `PUBLIC_API_BASE_URL` | Public API root ending `/api/v1`; publicly reachable HTTPS required for checkout |
| `ADMIN_NAME` | CLI only, noninteractive name |
| `ADMIN_EMAIL` | CLI only, valid unique email |
| `ADMIN_PASSWORD` | CLI only, 10–256 characters, secret |

Completely absent Cloudinary or merchant credentials disable that feature; partial credentials fail startup. For sandbox payment use an externally accessible HTTPS API and register `https://YOUR_API_HOST/api/v1/payments/sslcommerz/ipn` in the sandbox portal. Allow provider callback POSTs to the four gateway routes. Localhost alone cannot receive remote callbacks. Use a controlled HTTPS tunnel or deployed test backend for end-to-end callback tests. Do not use real cards or change merchant environment while payment attempts are unresolved.

## 4. Tests and production build

```sh
npm run prisma:validate
npm run prisma:generate
npm run lint
npm run format:check
npm run build
npm test
```

For integration tests create a second isolated database, apply migrations to it, and set `TEST_DATABASE_URL` before running `npm run test:integration`. For example in a separate shell (Bash), with real test credentials injected via environment:

```sh
export TEST_DATABASE_URL='postgresql://USER:PASSWORD@localhost:5432/autocare_test'
DATABASE_URL="$TEST_DATABASE_URL" DIRECT_URL="$TEST_DATABASE_URL" npm run prisma:migrate:deploy
npm run test:integration
```

PowerShell: set `$env:TEST_DATABASE_URL` first, then set both `$env:DATABASE_URL` and `$env:DIRECT_URL` to that value in the isolated test shell before migrating. Close the shell afterward. Integration tests skip without TEST_DATABASE_URL. Never run against production. No destructive reset is necessary.

## 5. Render deployment

Set production environment variables through the Render dashboard. Use `NODE_ENV=production`, `AUTH_COOKIE_SECURE=true`, `AUTH_COOKIE_SAME_SITE=none` if the frontend is cross-site, exact HTTPS frontend origin in `CORS_ORIGINS`, runtime `DATABASE_URL`, optional `DIRECT_URL` and provider secrets. Render assigns PORT. Set PUBLIC_API_BASE_URL to the actual external API root. Trust only verified proxy addresses. Configure provider callback reachability and browser credential/CSRF settings.

Build with `npm ci --include=dev && npm run build`; apply `npm run prisma:migrate:deploy` in a controlled deployment/pre-start step with database migration privileges; start with `npm run start:prod`. If a dedicated pre-deploy hook is unavailable, a single-instance start command can apply migrations before starting: `npm run prisma:migrate:deploy && npm run start:prod`. Run seed/admin provisioning explicitly against the intended database from a secure environment, never as an unconditional startup step. Build dependencies and Prisma CLI must be available for migration execution. Back up an existing database before changes. Do not reset production.

Hosted health: `https://fb-international-assessment-project.onrender.com/api/v1/health/status`. Verify catalog, availability, registration/login, provider capabilities and real release app behavior after deployment. Keep sandbox mode and note cold-start behavior.
