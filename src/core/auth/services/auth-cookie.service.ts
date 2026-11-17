import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response, CookieOptions } from 'express';
import { APP_CONFIG } from '../../config/app-config';
import type { AppConfig } from '../../config/app-config';

@Injectable()
export class AuthCookieService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}
  get name() {
    return this.config.auth.cookieSecure
      ? '__Secure-refresh_token'
      : 'refresh_token';
  }
  private options(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.auth.cookieSecure,
      sameSite: this.config.auth.cookieSameSite,
      path: '/api/v1/auth',
    };
  }
  setRefreshToken(response: Response, token: string, expiresAt: Date) {
    response.cookie(this.name, token, {
      ...this.options(),
      expires: expiresAt,
    });
  }
  clearRefreshToken(response: Response) {
    response.clearCookie(this.name, this.options());
  }
  readRefreshToken(request: Request) {
    const values = request.headers.cookie
      ?.split(';')
      .map((p) => p.trim())
      .filter((p) => p.startsWith(`${this.name}=`));
    if (values?.length !== 1) return undefined;
    try {
      return decodeURIComponent(values[0].slice(this.name.length + 1));
    } catch {
      return undefined;
    }
  }
  assertAllowedOrigin(request: Request) {
    const origin = request.get('origin');
    // Browsers send Origin on mutation; Fetch Metadata prevents treating stripped browser requests as native.
    if (
      (origin && !this.config.corsOrigins.includes(origin)) ||
      (!origin &&
        request.get('sec-fetch-site') &&
        request.get('sec-fetch-site') !== 'same-origin')
    )
      throw new ForbiddenException('Request origin is not allowed.');
  }
  private sign(sessionId: string, nonce: string) {
    return createHmac('sha256', this.config.auth.accessTokenSecret)
      .update(`autocare:csrf:v1:${sessionId}:${nonce}`)
      .digest('base64url');
  }
  issueCsrfToken(sessionId: string) {
    const nonce = randomBytes(32).toString('base64url');
    return `${nonce}.${this.sign(sessionId, nonce)}`;
  }
  assertCsrfToken(request: Request, sessionId: string) {
    this.assertAllowedOrigin(request);
    if (!request.get('origin') && !request.get('sec-fetch-site')) return; // Native Dio cookie jar.
    const match = request
      .get('x-csrf-token')
      ?.match(/^([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/);
    if (!match) throw new ForbiddenException('A valid CSRF token is required.');
    const actual = Buffer.from(match[2], 'base64url');
    const expected = Buffer.from(this.sign(sessionId, match[1]), 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      throw new ForbiddenException('A valid CSRF token is required.');
  }
}
