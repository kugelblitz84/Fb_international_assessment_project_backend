# Admin implementation report

Implemented on 2026-11-17.

The module adds database-authoritative CUSTOMER/ADMIN authorization, protected administration routes, explicit administrator provisioning, persistent image uploads, category/service/package/offer editing, appointment processing and database dashboard counts. Existing authentication, pricing, public filtering, booking ownership/capacity rules and assistant behavior are retained.

## Changes

- Additive `202611170003_admin` migration adds users.role with CUSTOMER default and PostgreSQL media_assets. Earlier migrations are unchanged; no existing database was reset or used for testing.
- Global AccessTokenGuard runs before RolesGuard. Active-session lookup selects the current database role; JWT structure is unchanged. All admin controllers require ADMIN. Register/login/profile/me/refresh safe user responses include role. Strict public schemas reject client role changes, and the repository explicitly creates CUSTOMER accounts.
- `npm run admin:create` validates using shared registration schemas and the existing scrypt service. Hidden interactive input and optional all-or-nothing ADMIN_* environment provisioning create ACTIVE ADMIN only, reject duplicates, never promote users, omit credentials from output and disconnect in finally.
- Admin category/service lists include inactive entries. Slugs are generated on create and uniqueness errors handled. Existing public catalog filters apply immediately. Package composition and service edits are serializable transactions and preserve database type/composition triggers. Pricing delegates to the existing catalog/pricing services; admin price means configured base price with effectivePrice exposed separately.
- Duration edits update future slot intervals in the same transaction. Booking acquires a shared service-row lock and retains duration/current-business-hours validation. Historical appointment snapshots remain unchanged.
- Offers validate merged start/end/discount values on PATCH and keep existing centralized selection. Dashboard counts are database-derived.
- Image upload is guarded before multipart parsing, limited to one file and 2 MiB, and checks byte signatures instead of trusting client MIME. Bytea persists in PostgreSQL. Public immutable image reads provide cache/nosniff headers. Upload URLs use explicit PUBLIC_API_BASE_URL; binaries never enter upload/catalog JSON.
- Appointment transitions use conditional updates against the observed status in a transaction. Premature completion and invalid/terminal/conflicting changes fail. Customer endpoints keep ownership-scoped pending cancellation. Existing database predicates release capacity for cancelled/completed appointments.
- Updated README, API/database/environment docs and exported schema.dbml; admin-api.md specifies endpoint requests/responses, validation, errors, role handling, uploads and Flutter integration.

## Verification

All requested commands passed:

| Command | Result |
|---|---|
| npm run prisma:validate | Passed |
| npm run prisma:generate | Passed |
| npm run build | Passed |
| npm run lint | Passed, zero warnings |
| npm test | 21 passed, zero failures/skips |
| npm run test:integration | 7 passed, zero failures/skips |

Database integration used a newly initialized local PostgreSQL 18 test cluster, bound only to 127.0.0.1 on port 55441, with a dedicated admin_verification database. All three migrations were applied using migrate deploy. No production/existing application database was contacted. The temporary test server was shut down after verification; test data files remain ignored under .tmp.

New tests cover strict role-escalation rejection, CUSTOMER defaults, 401/403/admin access, immediate promotion/demotion using the same token, suspension/revocation, category visibility and edits, service validation/editing, duplicate slug conflicts, package duplicate/nested/self/empty/type constraints and replacement, offer bounds/period/relation validation, pricing/public catalog effects, upload authorization/signature/size checks, exact public image byte retrieval, duration/availability updates, historical snapshots, status filtering and atomic terminal transitions. CLI subprocess tests verify successful provisioning, duplicate rejection without promotion, normalized email, ACTIVE/ADMIN state and no password output. Existing auth rotation/replay/CSRF, pricing, booking/capacity/ownership, catalog and assistant regression suites pass. Refresh response tests include the role-aware safe user object.

The first integration attempt revealed test-fixture interference: newly inserted test business hours overlapped the catalog seed and invalidated an existing booking assertion. The admin test now uses the common seed, cleans up its own records, and the corrected full suite passed on a fresh test database. No application behavior was changed to accommodate that fixture.

## Operational notes and limits

Apply `npm run prisma:migrate:deploy` to the intended deployment database, configure PUBLIC_API_BASE_URL including /api/v1, then run `npm run admin:create`. No deployment migration or real administrator provisioning was performed here. There are no default credentials or public admin-creation endpoints.

Collections are intentionally unpaginated for this assessment. Uploaded images are immutable and have no library/delete/processing feature; database storage and backups must include their bytes. Validation checks supported signatures, not full image decoding, metadata removal or content moderation. Public image URLs and existing external catalog URLs remain supported. Missing PUBLIC_API_BASE_URL disables uploads with 503 without disabling other APIs.

The interactive hidden-password path was reviewed but not exercised in a real terminal; automated CLI verification used noninteractive secret environment variables. Assistant regression tests use fake provider behavior or disabled-key operation, not a paid live Gemini call. No Flutter UI, payment, notification, rescheduling, user management or analytics work was added.

The installed Prisma PostgreSQL adapter emits a pg deprecation warning about concurrent client.query calls during transaction execution; all assertions pass. No dependencies were changed. Existing deployments should retain the pinned compatible adapter/client versions until their normal dependency upgrade process addresses it.
