# AutoCare — REST API

AutoCare is a vehicle service booking backend built with NestJS 11, TypeScript, PostgreSQL, Prisma 7 and Zod 4. It supports secure customer/admin authentication, services and packages, workshop scheduling, conflict-safe appointments, Gemini assistance, Cloudinary media and SSLCommerz sandbox checkout.

**Frontend:** [AutoCare Flutter](https://github.com/kugelblitz84/assessment_project_fb_international_frontend)

**Hosted API:** `https://fb-international-assessment-project.onrender.com/api/v1`\
**Health endpoint:** `GET /health/status` (process liveness, not full provider readiness)

## Quick start

Requires Node.js 22.12+ within v22, or v24+, PostgreSQL and permission to install `btree_gist`. Create an empty local database, configure `.env` from `.env.example`, and generate a random access-token signing secret. Full instructions are in [SETUP.md](docs/setup.md).

```sh
npm ci
npm run prisma:validate
npm run prisma:generate
npm run prisma:migrate:deploy
npm run prisma:seed
npm run admin:create
npm run start:dev
```

Local API: `http://localhost:3000/api/v1`. Admin creation is explicit; no default administrator is seeded. AI, media uploads and online payment require separate server-side configuration.

## Documentation

- [Code architecture](docs/architecture.md)
- [Features and technical implementation](docs/features.md)
- [Local setup, environment and deployment](docs/setup.md)
- [API contracts and examples](docs/api.md)
- [Database schema and ER diagram](docs/database.md)

## Verification

```sh
npm run prisma:validate
npm run prisma:generate
npm run build
npm run lint
npm test
```

Integration tests require a separate disposable `TEST_DATABASE_URL` with migrations applied. Never run them against the deployed database. See the setup guide for details. Optional integrations are sandbox/development facilities; automated refund handling and production payment certification are outside scope.
