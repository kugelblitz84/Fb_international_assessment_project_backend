# Gemini delivery report

Implemented the assistant on `feat/autocare-business-prerequisites`, preserving the completed authentication, catalog, scheduling and appointment modules.

Backend: official `@google/genai` 3.4.0, typed optional configuration, replaceable provider, bounded public platform/catalog/package/offer context, separate system instructions, stateless multi-turn history, Zod structured-output validation, active UUID checks after generation, deduplication and four-action cap. Exact price/original-price/duration lines come from centralized catalog pricing. No autonomous booking or private appointment access exists.

Endpoint: POST `/api/v1/assistant/chat`, optional bearer authentication, `{messages:[{role,content}]}` to `{id,role:"assistant",text,actions}`. Actions are serviceDetails/serviceId and browseServices/optional categoryId. Invalid supplied credentials remain 401; all responses/errors are no-store. See [full API](api.md).

Security/reliability: server-only key, sensitive-history screening and visible privacy notice, strict request/context/output limits, per-IP/per-user minute/hour limits, maximum concurrent requests, shared PostgreSQL daily admission cap, configurable timeout/output tokens, AbortController, one provider attempt, safe error codes, no fallback model. Public settings exclude internal counters. No chat tables, vectors, streaming or agent framework were added.

Frontend: live assistant/catalog Dio adapters, strict action/message JSON parsing, recent-history serialization, optional guest/authenticated requests, package/original-price service fields, current catalog images/prices/duration/cards, existing routes, safe errors, explicit demo mode, browser CSRF acquisition and `/api/v1` default. Session identity, late-response protection, retry/clear and shell navigation remain. Catalog failures cannot leave sending stuck; cards resolve after catalog refresh.

Changed files: backend `src/features/assistant/**`, app module/bootstrap, AppConfig, package/lockfile, `.env.example`, assistant unit/integration tests, example export script and docs. Frontend `lib/core/config/demo_mode.dart`, `lib/core/network/{api_endpoints,api_error_handler,auth_interceptor,dio_provider,request_access}.dart`, assistant controller/models/service/welcome/cards, shared ServiceModel/catalog adapter, README and three test files (new assistant integration test plus updated demo fixtures/obsolete catalog expectation).

Configuration: GEMINI_API_KEY, GEMINI_MODEL (requested `gemini-3.5-flash-lite`), GEMINI_TIMEOUT_MS, GEMINI_MAX_OUTPUT_TOKENS and four ASSISTANT usage variables. Missing key disables chat only. No real key or `.env` is committed. [Environment table](environment.md).

Verification performed:

- Prisma validation/generation, Nest build and ESLint passed.
- Seventeen backend unit tests passed: request/output validation, exact pricing, changed/inactive recommendations, sensitive input, timeout, limits, SDK construction, safe errors, JWT/config and workshop time.
- Five integration tests passed against isolated PostgreSQL 18: assistant guest/auth/invalid bearer, public context, concurrent persistent daily-budget claims, missing-key degradation, authentication lifecycle, catalog/seed and booking constraints.
- Flutter analysis passed. Full Flutter suite: 125 passed, two existing tests skipped. Covers live adapters/UUIDs, guest/signed-in assistant transport, strict deserialization, bounded history and existing state/navigation/responsive checks.
- SDK syntax/model identifier checked against official documentation and installed declarations. [assistant.json](examples/assistant.json) is a real orchestrated response fixture using a fake provider.
- Live Gemini request: **not performed, no configured API key**. The fixture/tests do not verify live Google credentials, quota or model access.

Remaining limits: short-window and concurrent admission limits are process-local (daily cap is shared/durable); no counter cleanup job; pattern screening/prompt instructions cannot prove all free-text factual/privacy claims. Catalog cards and booking pages remain authoritative. Native/browser production cookies need deployment validation. Frontend booking/profile business adapters need separate live HTTP wiring. Dependency audit findings and the Prisma/pg transaction deprecation warning remain documented in the prerequisite report. No existing database was reset or changed for verification; an isolated temporary cluster was used.
