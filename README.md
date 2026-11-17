# AutoCare backend

NestJS 11, PostgreSQL, Prisma 7.10.1 and Zod 4 REST API for vehicle service discovery and customer appointments. Includes authentication, services, packages, offers, persisted availability, private bookings and a grounded Gemini assistant with structured recommendations.

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
- [Gemini integration, privacy, limits and verification](docs/gemini-assistant.md)
- [Gemini delivery report](docs/gemini-implementation-report.md)
- [Generated JSON examples](docs/examples/)

Demo seed: five categories, six individual services, three packages, two introductory offers, two bays, fourteen opening intervals and ten public settings. Existing seed rows are preserved on rerun, including offer expiration dates. No users, passwords or appointments are seeded.

## Gemini assistant

Add `GEMINI_API_KEY` to the local `.env`; the default configurable model is `gemini-3.5-flash-lite`. Without a key, only `/assistant/chat` is disabled (503). Set `ASSISTANT_DAILY_REQUEST_BUDGET` at or below the project's actual quota; the default 100 is a conservative application cap, not a claim about Google's free tier. No model fallback or automatic retries are used.

`POST /api/v1/assistant/chat` accepts `{messages:[{role:"user",content:"Suggest a package under 2000 taka."}]}` for guests or authenticated users. It returns `{id,role:"assistant",text,actions}`. The Flutter integration uses live catalog UUIDs and cards; explicit demo mode remains available. Live Gemini verification is pending a configured key; fake-provider automated tests do not establish live availability.

## Administration

The additive admin module manages categories, individual services, packages, offers, Cloudinary image uploads, legacy PostgreSQL images, payments and appointment status. All admin endpoints require an active ADMIN session; public registration always creates CUSTOMER.

Apply migrations with `npm run prisma:migrate:deploy` and run `npm run admin:create`. The CLI prompts for name/email and a hidden password, or accepts ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD together. There is no default administrator or public promotion endpoint. Existing users become CUSTOMER automatically. No database reset is required.

See [complete admin contracts and Flutter handover](docs/admin-api.md) and [implementation/verification report](docs/admin-implementation-report.md).

## Image storage and hosted payments

Enable uploads with CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET; CLOUDINARY_FOLDER defaults to autocare. New images use Cloudinary directly; existing bytea images and seeded external URLs remain available. The admin multipart route and `{id,imageUrl}` response are unchanged. [Cloudinary setup and errors](docs/cloudinary-integration.md).

Enable checkout with SSLCOMMERZ_STORE_ID, SSLCOMMERZ_STORE_PASSWORD and a publicly reachable HTTPS PUBLIC_API_BASE_URL ending in /api/v1. SSLCOMMERZ_IS_LIVE defaults to false; SSLCOMMERZ_TIMEOUT_MS defaults to 20000. Completely missing credentials disable only that integration; partial credentials fail startup. No provider calls run at startup.

Booking remains independent of payment: customers book first, then optionally pay online or at the workshop. Payment never confirms a booking. Paid/unresolved payments block cancellation; review cases require manual support. No refund endpoint is provided. [Payment API and sandbox handover](docs/payment-api.md), [final implementation and verification](docs/final-integration-report.md).

On Render, Northflank or equivalent hosting, use the assigned PORT, terminate HTTPS at the hosting ingress, configure exact CORS origins and secure cookies, and set the external API URL explicitly. TRUSTED_PROXY_ADDRESSES accepts only the deployment's verified proxy IPs/CIDRs; empty leaves forwarded headers untrusted. Add shared ingress throttling when deploying multiple replicas.
