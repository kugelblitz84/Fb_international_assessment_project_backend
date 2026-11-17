# AutoCare backend

NestJS 11, PostgreSQL, Prisma 7.10.1 and Zod 4 REST API for vehicle service discovery and customer appointments. Includes authentication, services, packages, offers, persisted availability and private bookings. No AI SDK or assistant endpoint is implemented.

## Run locally

Use Node.js 22.12+ or 24+, and PostgreSQL with permission to create `btree_gist`. Supply an empty database without resetting an existing database.

```powershell
npm ci
Copy-Item .env.example .env
# Configure DATABASE_URL and a random AUTH_ACCESS_TOKEN_SECRET in .env.
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
npm run prisma:validate
npm run prisma:generate
npm run prisma:migrate:dev
npm run prisma:seed
npm run start:dev
```

Base URL: `http://localhost:3000/api/v1`. Health: `GET /api/v1/health/status`.

Deployment: `npm ci`, `npm run prisma:generate`, `npm run prisma:migrate:deploy`, `npm run build`, `npm run start:prod`. Configure production HTTPS, trusted CORS origins and secure cookies first. Seeding is an explicit demonstration-data operation, not a startup hook.

```powershell
npm run prisma:validate
npm run prisma:generate
npm run build
npm run lint
npm test
# Use a dedicated disposable database with migrations applied.
$env:TEST_DATABASE_URL='postgresql://USER:PASSWORD@localhost:5432/autocare_test'
npm run test:integration
```

Integration tests skip when `TEST_DATABASE_URL` is absent. They create and clean test users/bookings, run the seed, temporarily edit seeded catalog values and restore them. They run serially. No reset command is used.

## Documentation

- [Architecture and source inspection](docs/architecture.md)
- [Database and ER diagram](docs/database.md), [DBML](docs/schema.dbml)
- [API contracts](docs/api.md)
- [Environment variables](docs/environment.md)
- [Required Flutter integration work](docs/flutter-integration.md)
- [Future AI service contracts and privacy](docs/ai-assistant-prerequisites.md)
- [Implementation and verification report](docs/implementation-report.md)
- [Generated JSON examples](docs/examples/)

Demo seed: five categories, six individual services, three packages, two introductory offers, two bays, fourteen opening intervals and ten public settings. Existing seed rows are preserved on rerun, including offer expiration dates. No users, passwords or appointments are seeded.
