# Prerequisite implementation report

Implemented fourteen models across seven feature schema files, an initial migration and custom SQL constraints; digest-based sessions, rotating refresh history, scrypt passwords, JWT access/session guard and customer profiles; catalog/packages/offers and Decimal pricing; stable persisted availability, owner-scoped appointments with PostgreSQL capacity enforcement; public platform knowledge.

Files: `prisma/models/*`, `prisma/migrations/*`, seed/config/data; `src/core/auth/*`; `src/features/auth`, `catalog`, `scheduling`, `appointments`, `platform`; typed config, app composition, public health annotation, environment/scripts/build config; `test/*`, `test/integration/*`, `scripts/*`; README and docs. The frontend was read only during this phase.

Migration commands: `npm run prisma:generate`, `npm run prisma:migrate:dev` (development) or `npm run prisma:migrate:deploy` (deployment), `npm run prisma:seed`. Never reset existing databases.

Seed: five categories, six original services, three packages, two time-limited demonstration offers, two bays, fourteen intervals and ten policy settings. Existing dates/data are retained on reruns. No credentials/users are seeded.

Endpoints and environment variables are fully tabulated in [API](api.md) and [environment](environment.md). Public future context methods are enumerated in [assistant contracts](ai-assistant-prerequisites.md).

Verified against an isolated PostgreSQL 18 cluster on port 55439, with no changes to the existing PostgreSQL service/database: both migrations applied, repeated seed succeeded; schema validation, client generation, build and lint passed; unit pricing/time tests and integration authentication/catalog/booking suites passed. Integration verifies replay/rotation races, session isolation, CSRF, seed counts/offer dates, cross-service database exclusions, adjacent bookings, ownership, cancellation/rebooking and historical snapshots.

Limits: no admin confirmation/completion/catalog APIs, no vehicle CRUD UI/API, no session/slot cleanup job; single-workshop UTC+06 scheduling; process-local authentication throttling; collections are unpaginated for this assessment's small catalog. PostgreSQL requires btree_gist privileges. Prisma/pg emits a query-concurrency deprecation warning during some transactions; checks pass with the installed pg version. Installation reported nine moderate dependency audit findings; no broad dependency upgrades were applied. Flutter live booking adapters and browser CSRF integration remain separate work. Live AI verification is reported separately with the Gemini phase.
