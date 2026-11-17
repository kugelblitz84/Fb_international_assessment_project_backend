# Final backend integration report

Implemented and verified on 2026-11-17. Cloudinary and SSLCOMMERZ can be enabled through environment configuration without source edits. No live provider transaction/upload was performed, and no existing application database was reset or contacted for verification.

## Delivered behavior

New ADMIN image uploads use the official Cloudinary SDK's authenticated upload_stream with verified JPEG/PNG/WebP bytes, the existing 2 MiB limit, UUID asset IDs, overwrite disabled, image-only upload options, a 20-second timeout and optimized HTTPS delivery. PostgreSQL retains metadata only for new cloud images. The exact Flutter upload response remains `{id,imageUrl}`. Legacy binary image reads and seeded/external image URLs remain available. Metadata failure attempts cleanup of only the new upload; replacing a service image never deletes existing assets.

The new payment module implements hosted checkout, public capability discovery, owner-scoped attempt queries, customer/admin reconciliation, protected admin list/detail routes and four public independently verified callbacks. Callback HTML contains no gateway data and never claims unverified success; IPN uses JSON acknowledgement. The typed fetch adapter follows the official V4 session/validation/query APIs, uses bounded timeouts, filters returned fields and never automatically retries session creation. Amount/currency/owner/status remain server-controlled. Customer contact is validated and sent for non-shipping Bangladesh service checkout; no card information or raw provider response is persisted.

Booking and payment remain independent. Optional checkout uses the immutable booked price, never automatically confirms an appointment, and never expires an unpaid booking. Appointment payment summaries and canCancel reflect active/applied/review states. Payment initiation, application, cancellation and admin transitions lock the appointment row; external calls happen after transaction release. Partial indexes enforce one active checkout and one applied charge. High-risk, mismatched, late, duplicate and reference-collision cases require review. Additional charge references remain recorded rather than applied twice. Uncertain initiation blocks another payment and can recover through a verified merchant query; other review incidents remain sticky for manual support.

Configuration accepts entirely absent credentials for either integration and rejects partial credentials. Sandbox is the default. Checkout requires a structurally usable public HTTPS API base; the operator verifies actual DNS/TLS and callback reachability. Proxy forwarding remains untrusted unless explicit deployment proxy IPs/CIDRs are configured. Public platform output adds only booking horizon, slot increment and Asia/Dhaka timezone; no assistant counters or secrets are exposed.

Existing JWT/session/refresh-cookie auth, roles, administrator CLI including noninteractive ADMIN_* variables, catalog composition, centralized offers/pricing, availability/capacity exclusions, historical appointment snapshots, seed behavior and database-grounded Gemini context remain intact. Flutter application code was not modified. The handover documents the live backend booking/profile and payment contracts for the frontend agent.

## Database and migration verification

`202611170004_integrations` extends MediaAsset without dropping rows and adds Payment, provider/status enums, restrictive appointment references, unique provider references, active/applied partial indexes and an immutable payment-snapshot trigger. Earlier migrations were preserved byte-for-byte. No reset or db push was run.

A new isolated PostgreSQL cluster was initialized under ignored `.tmp/integration-pg`, listening only on 127.0.0.1:55443. Final verification used the newly created integration_final_verification database. The first three migrations were deployed, a legacy binary image was inserted, then the integration migration was applied through `npm run prisma:migrate:deploy`. The image bytes survived exactly and the row acquired POSTGRESQL as its default provider. Re-running deploy reported no pending migrations. DBML was regenerated from this migrated database, including checks, actual unique references and partial-index predicates. The temporary test server was shut down after verification; its ignored test files remain for inspection.

## Verification results

| Command | Result |
|---|---|
| npm run prisma:validate | Passed |
| npm run prisma:generate | Passed |
| npm run build | Passed |
| npm run lint | Passed, zero warnings |
| npm test | 30 passed, zero failures/skips |
| npm run test:integration | 9 passed, zero failures/skips |
| npm run prisma:migrate:deploy | Passed on isolated upgrade database; repeat had no pending migrations |

New unit tests cover complete/missing/partial config, callback-base/proxy validation, disabled gateway, contact strictness, provider request/response contracts and safe errors, Cloudinary timeout/error handling and controlled options, metadata-only writes, legacy reads, compensating cleanup, Decimal comparisons, risk and payment summaries/transition rules. Providers are mocked; these results establish implementation behavior, not live account availability.

Database/HTTP tests cover ADMIN upload authorization, signature/size enforcement, the exact upload response, cloud metadata, legacy bytes, disabled integrations with valid pay-at-workshop booking, actual booking-horizon output, owner scoping, immutable stored amount, invalid appointment states, duplicate/concurrent initiation, uncertain request recovery, forged/mismatched notifications, risk review, verified payment without appointment confirmation, repeated IPN, out-of-order failure, reconciliation throttling, terminal retry behavior, late/extra charges, paid/unresolved cancellation restrictions, payment-versus-cancellation ordering, admin access and database uniqueness/snapshot enforcement. Existing authentication rotation/replay/CSRF, admin CLI/catalog/package/offer, availability/capacity/history, pricing and Gemini suites all pass.

The installed pg version emits the existing query-concurrency deprecation warning in some regression transactions. Tests pass. Installing the official Cloudinary SDK reported nine moderate dependency advisories; broad dependency upgrades were outside this integration.

## Operator and frontend handover

1. Deploy using npm ci, prisma generation, `npm run prisma:migrate:deploy`, build and production start. Preserve the provider-assigned PORT and configure HTTPS termination, exact CORS origins and secure cookies. Set TRUSTED_PROXY_ADDRESSES only for the verified hosting topology.
2. Provision administrators explicitly with `npm run admin:create`, interactively or with ADMIN_NAME/ADMIN_EMAIL/ADMIN_PASSWORD together. There are no default/admin startup credentials.
3. Enable Cloudinary with CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET and optional CLOUDINARY_FOLDER. [Cloudinary setup and API](cloudinary-integration.md).
4. Enable SSLCOMMERZ sandbox with SSLCOMMERZ_STORE_ID, SSLCOMMERZ_STORE_PASSWORD, SSLCOMMERZ_IS_LIVE=false, optional SSLCOMMERZ_TIMEOUT_MS and an external HTTPS PUBLIC_API_BASE_URL ending in /api/v1. Configure portal IPN and explicitly run the manual sandbox acceptance procedure before deployment acceptance. No real-provider verification is claimed here.
5. Connect Flutter using [customer API](api.md), [payment DTOs, errors and examples](payment-api.md), [admin API](admin-api.md) and [Flutter handover](flutter-integration.md). Use GET /platform booking.horizonDays instead of a 365-day date window. Refresh payment state on resume and provide manual reconciliation with at least five seconds between calls.

Manual support limitations are deliberate: there is no refund, financial settlement/reporting, bulk media migration/deletion/library, or payment-review override endpoint. A missing session after ambiguous initiation cannot be safely released solely because a merchant query lists failed/no transactions; investigate in the merchant portal. Cleanup after image persistence failure is best effort and can leave an orphan if Cloudinary cleanup itself fails. Short-window per-user throttles are process-local; multiple replicas require shared ingress limiting, while the per-payment spacing is database-enforced. No live provider test runs automatically or during startup.
