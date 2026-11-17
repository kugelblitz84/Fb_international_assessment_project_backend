# Environment

Copy `.env.example` to `.env`. Configuration is loaded and validated by typed `APP_CONFIG`.

| Variable | Default / requirement |
|---|---|
| `NODE_ENV` | `development`; also `test` or `production` |
| `PORT` | 3000, range 1–65535 |
| `DATABASE_URL` | Required PostgreSQL URL with host, user and database |
| `CORS_ORIGINS` | Exact comma-separated HTTP(S) origins, no paths/trailing slashes/wildcards. Production requires HTTPS origins. Empty disables cross-origin browser access |
| `HTTP_BODY_LIMIT_BYTES` | 65536, range 1024–1048576 |
| `AUTH_ACCESS_TOKEN_SECRET` | Required, at least 32 bytes, no placeholder text; generate a cryptographically random value |
| `AUTH_ACCESS_TOKEN_TTL_SECONDS` | 900, range 60–3600 |
| `AUTH_REFRESH_TOKEN_TTL_SECONDS` | 2592000 (30 days), range 3600–7776000; absolute lifetime |
| `AUTH_ISSUER` | `autocare`, nonempty |
| `AUTH_AUDIENCE` | `autocare-api`, nonempty |
| `AUTH_COOKIE_SAME_SITE` | `lax`; also `strict` or `none` |
| `AUTH_COOKIE_SECURE` | false in development/test, true in production; production and SameSite=None require true and HTTPS |
| `BOOKING_HORIZON_DAYS` | 30, range 1–90, includes today |
| `BOOKING_SLOT_STEP_MINUTES` | 15, range 5–120 |
| `TEST_DATABASE_URL` | Dedicated disposable database for integration tests; not runtime config |

Workshop timezone is fixed as typed `Asia/Dhaka`. Business hours come from the database. Seeded policies must remain consistent when changing rules.

Generate a secret: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. Never commit `.env`, real credentials, tokens or secrets. The example leaves the secret blank, so startup fails until configured.

Use `AUTH_COOKIE_SECURE=false` only for local HTTP development. Production must override the example's false value. Cookies use `refresh_token` over HTTP development and `__Secure-refresh_token` with HTTPS; no Domain attribute, path `/api/v1/auth`. CORS alone does not prevent CSRF: trusted browsers also send the session-bound CSRF token for refresh/logout.

Forwarded IP headers are untrusted. Review proxy trust at deployment before changing it. Authentication throttling is bounded in-memory, per process and direct client IP: 20 credential attempts and 60 refresh attempts per 15 minutes. Multiple replicas require shared rate limiting outside this assessment.

## Optional Gemini configuration

| Variable | Default / requirement |
|---|---|
| `GEMINI_API_KEY` | Blank disables assistant only; supply manually in `.env`, never Flutter |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite`; no fallback to another model |
| `GEMINI_TIMEOUT_MS` | 20000, range 1000–60000 |
| `GEMINI_MAX_OUTPUT_TOKENS` | 1500, range 128–4096 |
| `ASSISTANT_REQUESTS_PER_MINUTE` | 5, range 1–60, per IP and authenticated user |
| `ASSISTANT_REQUESTS_PER_HOUR` | 20, range 1–1000, per IP and authenticated user |
| `ASSISTANT_DAILY_REQUEST_BUDGET` | 100, range 0–10000; 0 prevents admitted requests. PostgreSQL shared global cap, UTC calendar day |
| `ASSISTANT_MAX_CONCURRENT` | 2, range 1–10, per backend process |

The daily default is an application limit, not a guaranteed free-tier quota. Check the project's actual limits/billing and choose a safe cap. SDK retries are disabled. Invalid credentials/unavailable model return a configuration error and never silently switch models. Optional configuration is not contacted at startup. Per-IP/user short-window rate limits and concurrency remain process-local; a replicated deployment should also enforce shared ingress limits. The daily budget itself survives restarts and is shared through PostgreSQL.

## Administration and media

| Variable | Default / requirement |
|---|---|
| `PUBLIC_API_BASE_URL` | External API root ending in `/api/v1`; no credentials/query/fragment. HTTPS in production and for checkout. Missing/unusable public base disables checkout; Cloudinary does not require it. |
| `ADMIN_NAME` | CLI only; optional noninteractive provisioning name, same validation as registration |
| `ADMIN_EMAIL` | CLI only; valid email, trimmed/lowercased; existing emails rejected |
| `ADMIN_PASSWORD` | CLI only; 10�256 characters; no default; provide through a secret mechanism |

Either supply all ADMIN_* variables or use the interactive hidden-password prompt. They never create accounts at application startup or during seeding. New image uploads use Cloudinary; legacy PostgreSQL bytes and seeded external URLs remain available. See [Cloudinary integration](cloudinary-integration.md) and [admin API](admin-api.md).

## Optional image and payment providers

| Variable | Default / requirement |
|---|---|
| CLOUDINARY_CLOUD_NAME | Blank disables new uploads; supply all three credentials together |
| CLOUDINARY_API_KEY | Server-side key, required with cloud name/secret |
| CLOUDINARY_API_SECRET | Server-side secret, required with cloud name/key |
| CLOUDINARY_FOLDER | autocare; safe slash-separated path segments |
| SSLCOMMERZ_STORE_ID | Blank disables online payments; supply together with store password |
| SSLCOMMERZ_STORE_PASSWORD | Server-side secret, required with store ID |
| SSLCOMMERZ_IS_LIVE | false; explicit true selects real-payment environment |
| SSLCOMMERZ_TIMEOUT_MS | 20000, integer 1000–60000; no automatic session retry |
| TRUSTED_PROXY_ADDRESSES | Empty means no forwarded-header trust; comma-separated explicit proxy IPs/CIDRs only |

Both optional providers allow completely missing credentials; partial credentials fail startup. No provider calls run at startup. Cloudinary upload timeout is 20 seconds. Pay-at-workshop bookings continue without online payment. HTTPS PUBLIC_API_BASE_URL must be externally reachable for gateway callbacks; obvious loopback/private/test hosts are rejected for checkout. The operator verifies public DNS/TLS/ingress. Never expose credentials in Flutter, request logs, exception causes or URLs in access logs.

On Render/Northflank or equivalent, use provider-assigned PORT, secure cookies and exact HTTPS CORS origins. Trust only verified proxy addresses from that deployment's actual ingress topology. Do not use boolean trust-proxy or arbitrary forwarded headers. Short-window authentication/payment throttles remain process-local, so multiple replicas need shared ingress throttling; per-payment reconciliation spacing is persisted in PostgreSQL. [Payment setup and merchant portal runbook](payment-api.md).
