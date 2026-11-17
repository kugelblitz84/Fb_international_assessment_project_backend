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
  readonly auth: {
    readonly accessTokenSecret: string;
    readonly accessTokenTtlSeconds: number;
    readonly refreshTokenTtlSeconds: number;
    readonly issuer: string;
    readonly audience: string;
    readonly cookieSameSite: 'lax' | 'strict' | 'none';
    readonly cookieSecure: boolean;
  };
  readonly booking: {
    readonly horizonDays: number;
    readonly slotStepMinutes: number;
    readonly timeZone: 'Asia/Dhaka';
  };
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
  const secret = environment.AUTH_ACCESS_TOKEN_SECRET?.trim();
  if (
    !secret ||
    Buffer.byteLength(secret) < 32 ||
    /replace|placeholder|change-me/i.test(secret)
  ) {
    throw new Error(
      'AUTH_ACCESS_TOKEN_SECRET must be a non-placeholder secret of at least 32 bytes.',
    );
  }
  const sameSite = environment.AUTH_COOKIE_SAME_SITE ?? 'lax';
  if (!['lax', 'strict', 'none'].includes(sameSite))
    throw new Error('Invalid AUTH_COOKIE_SAME_SITE.');
  const secure =
    environment.AUTH_COOKIE_SECURE ??
    (nodeEnv === 'production' ? 'true' : 'false');
  if (
    !['true', 'false'].includes(secure) ||
    (nodeEnv === 'production' && secure !== 'true') ||
    (sameSite === 'none' && secure !== 'true')
  )
    throw new Error(
      'Production and SameSite=None require AUTH_COOKIE_SECURE=true and HTTPS.',
    );
  const issuer = environment.AUTH_ISSUER?.trim() ?? 'autocare';
  const audience = environment.AUTH_AUDIENCE?.trim() ?? 'autocare-api';
  if (!issuer || !audience)
    throw new Error('AUTH_ISSUER and AUTH_AUDIENCE cannot be empty.');
  return {
    nodeEnv,
    port: parseInteger('PORT', environment.PORT, 3000, 1, 65_535),
    databaseUrl: parseDatabaseUrl(environment.DATABASE_URL),
    corsOrigins: parseCorsOrigins(environment.CORS_ORIGINS, nodeEnv),
    auth: {
      accessTokenSecret: secret,
      accessTokenTtlSeconds: parseInteger(
        'AUTH_ACCESS_TOKEN_TTL_SECONDS',
        environment.AUTH_ACCESS_TOKEN_TTL_SECONDS,
        900,
        60,
        3600,
      ),
      refreshTokenTtlSeconds: parseInteger(
        'AUTH_REFRESH_TOKEN_TTL_SECONDS',
        environment.AUTH_REFRESH_TOKEN_TTL_SECONDS,
        2592000,
        3600,
        7776000,
      ),
      issuer,
      audience,
      cookieSameSite: sameSite as 'lax' | 'strict' | 'none',
      cookieSecure: secure === 'true',
    },
    booking: {
      horizonDays: parseInteger(
        'BOOKING_HORIZON_DAYS',
        environment.BOOKING_HORIZON_DAYS,
        30,
        1,
        90,
      ),
      slotStepMinutes: parseInteger(
        'BOOKING_SLOT_STEP_MINUTES',
        environment.BOOKING_SLOT_STEP_MINUTES,
        15,
        5,
        120,
      ),
      timeZone: 'Asia/Dhaka',
    },
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
