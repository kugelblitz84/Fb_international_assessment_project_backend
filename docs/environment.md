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
