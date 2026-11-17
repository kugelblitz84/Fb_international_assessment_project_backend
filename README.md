# AutoCare backend

NestJS foundation for the AutoCare vehicle service platform. **Phase 1 is implemented:** typed configuration, shared HTTP bootstrap, PostgreSQL/Prisma infrastructure, Zod request validation, a framework-independent domain error base, and public health reporting.

## Local setup

Use npm, Node.js 22.12+ on the 22 release line or Node.js 24+, and a running PostgreSQL instance. Node.js 24 LTS is recommended for this project.

```sh
npm ci
```

```powershell
Copy-Item .env.example .env
```

Set `DATABASE_URL` in `.env` to an existing local database with your credentials. The example password is a placeholder. PostgreSQL must be reachable before application initialization completes.

```sh
npm run prisma:generate
npm run start:dev
```

The server listens on port 3000 by default. Local API base URL: **`http://localhost:3000/api/v1`**. Android emulator base URL: **`http://10.0.2.2:3000/api/v1`**.

```sh
curl http://localhost:3000/api/v1/health/status
```

The health response includes `status`, UTC `timestamp`, `uptimeSeconds`, and the configured `environment`. It reports process liveness; it does not run a database readiness query.

## Verification

```sh
npm run build
npm run lint
npx prisma validate
```

The build generates Prisma Client automatically. Automated tests and test tooling are omitted for this assignment. After starting the application, verify the health endpoint with the curl command above.

```sh
npm run start:prod
```

Production startup uses the compiled `dist/main.js`; build first. Production configuration requires explicit HTTPS browser origins. Authentication, cookie security, and secret validation will be implemented alongside authentication, which is not exposed yet.

## Project layout

```text
prisma/schema.prisma           Generator and PostgreSQL datasource; no models yet
prisma.config.ts              Schema-directory and migration-path configuration
src/app/                      Root composition and reusable HTTP configuration
src/core/config/              Global typed configuration
src/core/database/            Shared PrismaPg lifecycle provider
src/core/errors/              Pure domain error base
src/core/validator/            Generic Zod validation pipe
src/features/health/          Public health controller and service
```

The [reference registration architecture](https://github.com/kugelblitz84/edu_app_backend/tree/002711b1219b2bf4f64754a1c78f2c13a9b3c7ad/src/features/auth/register) guides later domain contracts, data implementations, and factory-provider composition. Existing compatible NestJS scaffold dependencies are preserved.

## Scope and documentation

No business models, migrations, seeds, registration/login, sessions, catalogue/profile APIs, availability, bookings, AI integration, or outbox processing have been implemented. Schema/migration/seed verification and the ER/DBML diagram belong to Phase 2. The reference and frontend repositories have not been modified.

- [API behavior and examples](docs/api.md)
- [Environment variables](docs/environment.md)
- [Architecture and dependency rules](docs/architecture.md)
- [Database setup and verification](docs/database.md)
- [Flutter base URL and future CSRF transport changes](docs/flutter-integration.md)
- [Development workflow](WORKFLOW.md)
- [Phase 1 verification report](docs/phase-1-report.md)
