# Architecture

The existing `src/app`, typed `APP_CONFIG`, `PrismaModule`, health endpoint, domain error base and Zod request pipe are preserved. HTTP retains Helmet, body limits, untrusted proxy headers, explicit credentialed CORS and URI versioning under `/api/v1`.

Features separate domain contracts/rules, Prisma data implementations, application orchestration, HTTP validation/controllers and Nest module composition. Controllers never query Prisma. Concrete injectable repositories are used without a generic repository framework. The catalog domain uses Prisma's exact Decimal implementation for money; persistence records are mapped in data modules. `PlatformService` is a small read-only query service with an explicit public setting allowlist.

| Area | Responsibility |
|---|---|
| `core/auth` | JWTs, cookie/CSRF policy, sessions, global guard, bounded authentication throttling |
| `features/auth/register` | Registration and password hashing orchestration |
| `features/auth/login` | Credentials, account status and independent sessions |
| `features/auth/data` | Scrypt hashing and allowlisted user persistence |
| `features/catalog` | Active catalog/package/offer queries, DTOs, shared Decimal pricing |
| `features/scheduling` | Dhaka time, business-hour intervals, persisted slots and reservation reads |
| `features/appointments` | Booking policy, transactional reservation/snapshots, owner-scoped reads/cancellation |
| `features/platform` | Public policy JSON and authoritative business hours |
| `features/assistant` | Public context, replaceable Gemini provider, strict structured actions, request limits and PostgreSQL daily budget |

Booking uses one transactional data operation. It loads the active service/category/package components, slot, hours and optional owned vehicle; an application callback validates booking policy and calculates the price. PostgreSQL's exclusion constraint and partial unique index enforce capacity under concurrency. Conflict SQLSTATEs become HTTP 409.

Refresh atomically consumes old history, conditionally swaps the session digest and inserts new history. A failed conditional update throws to roll back the entire transaction. Cookies and tokens are returned only after commit. Known consumed-token replay revokes that session outside the failed transaction; unknown digests cannot revoke it. Concurrent refresh is intentionally strict: the losing replay may revoke the session, so clients must serialize refresh.

Access authorization queries PostgreSQL on every request for session ownership, expiry, revocation and active user status. No session cache is used. `@Public()` skips authentication; `@OptionalAuth()` permits no header but rejects invalid supplied credentials. All other routes require a bearer token.

## Inspected sources

- Backend foundation: `4384adc37982816f72197a9c08fcb803e6dbf276`.
- [Authentication reference](https://github.com/kugelblitz84/edu_app_backend/tree/002711b1219b2bf4f64754a1c78f2c13a9b3c7ad): inspected user/session/history models, session/access-token/cookie services, guard, controller, module, README, register/login use cases and scrypt services. Educational roles, institutions and unrelated features were omitted. AutoCare adds rollback on failed rotation, direct database session checks and HTTP-compatible native development cookies.
- The adjacent [Flutter repository](https://github.com/kugelblitz84/assessment_project_fb_international_frontend) was read without modification: `demo_workshop.dart`, service/appointment/availability models, CreateBookingPayload, routes, catalog/appointment adapters, auth repository, native/web cookie transports. BookingStatus requires lowercase strings; authentication expects `{accessToken,user}` and `{user}` for `/auth/me`.

The subsequent Gemini feature injects CatalogService and PlatformService, never private appointment/user repositories. AssistantContextService builds bounded public JSON; GeminiService uses the official SDK with a separate system instruction and model-role mapping; AssistantService validates output and refreshes authoritative data before returning actions/prices. The provider contract can be replaced by a fake in tests. AssistantBudgetRepository atomically counts daily requests under reserved internal PlatformSetting keys, excluded from public knowledge. No chat storage, vector database, admin workflow, payment flow, notifications, staff system or vendor abstraction was added.
