import 'dotenv/config';

export const APP_CONFIG = Symbol('APP_CONFIG');

export type NodeEnvironment = 'development' | 'test' | 'production';
type Environment = Readonly<Record<string, string | undefined>>;

export interface AppConfig {
  readonly nodeEnv: NodeEnvironment;
  readonly port: number;
  readonly databaseUrl: string;
  readonly corsOrigins: string[];
  readonly httpBodyLimitBytes: number;
}

function parseNodeEnvironment(value: string | undefined): NodeEnvironment {
  if (value === undefined) return 'development';
  if (value === 'development' || value === 'test' || value === 'production') {
    return value;
  }
  throw new Error('NODE_ENV must be development, test, or production.');
}

function parseInteger(
  name: string,
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const text = value === undefined ? String(fallback) : value.trim();
  const parsed = Number(text);
  if (
    !/^\d+$/.test(text) ||
    !Number.isSafeInteger(parsed) ||
    parsed < minimum ||
    parsed > maximum
  ) {
    throw new Error(
      `${name} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return parsed;
}

function parseDatabaseUrl(value: string | undefined): string {
  const databaseUrl = value?.trim();
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is required. Copy .env.example to .env and configure PostgreSQL.',
    );
  }
  try {
    const parsed = new URL(databaseUrl);
    if (
      !['postgresql:', 'postgres:'].includes(parsed.protocol) ||
      !parsed.hostname ||
      !parsed.username ||
      parsed.pathname.length < 2
    ) {
      throw new Error('Invalid connection string.');
    }
  } catch {
    // Never echo the URL: it can contain a database password.
    throw new Error(
      'DATABASE_URL must be a PostgreSQL URL with a host, user, and database name.',
    );
  }
  return databaseUrl;
}

function parseCorsOrigins(
  value: string | undefined,
  nodeEnv: NodeEnvironment,
): string[] {
  const origins = value?.trim()
    ? value.split(',').map((origin) => origin.trim())
    : [];
  if (nodeEnv === 'production' && origins.length === 0) {
    throw new Error(
      'CORS_ORIGINS must contain explicit HTTPS origins in production.',
    );
  }
  for (const origin of origins) {
    try {
      const parsed = new URL(origin);
      if (
        !['http:', 'https:'].includes(parsed.protocol) ||
        parsed.origin !== origin ||
        (nodeEnv === 'production' && parsed.protocol !== 'https:')
      ) {
        throw new Error('Invalid origin.');
      }
    } catch {
      throw new Error(
        'CORS_ORIGINS must be comma-separated HTTP(S) origins without paths or wildcards; production requires HTTPS.',
      );
    }
  }
  return [...new Set(origins)];
}

export function loadAppConfig(
  environment: Environment = process.env,
): AppConfig {
  const nodeEnv = parseNodeEnvironment(environment.NODE_ENV);
  return {
    nodeEnv,
    port: parseInteger('PORT', environment.PORT, 3000, 1, 65_535),
    databaseUrl: parseDatabaseUrl(environment.DATABASE_URL),
    corsOrigins: parseCorsOrigins(environment.CORS_ORIGINS, nodeEnv),
    httpBodyLimitBytes: parseInteger(
      'HTTP_BODY_LIMIT_BYTES',
      environment.HTTP_BODY_LIMIT_BYTES,
      65_536,
      1024,
      1_048_576,
    ),
  };
}

export const appConfigProvider = {
  provide: APP_CONFIG,
  useFactory: () => loadAppConfig(),
};
