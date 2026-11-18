# AutoCare backend documentation

Start with the [project overview and quick start](../README.md).

- [Setup, environment variables and deployment](setup.md)
- [Architecture and security](architecture.md)
- [Features and implementation](features.md)
- [API contracts and examples](api.md)
- [Database schema, constraints and migrations](database.md)

Supporting artifacts:

- [DBML schema](schema.dbml), exported with `node scripts/export-schema.cjs`
- [JSON response examples](examples/), exported with `npx ts-node scripts/export-examples.ts` and `npx ts-node scripts/export-assistant-example.ts`

Export scripts require a configured database. Prisma models and SQL migrations remain the source of truth for the database; controllers and validation schemas define the API contracts.
