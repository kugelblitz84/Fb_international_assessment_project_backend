import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import { APP_CONFIG } from '../../config/app-config';
import type { AppConfig } from '../../config/app-config';
import type { AuthenticatedUser } from '../auth.types';

@Injectable()
export class AccessTokenService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}
  generate(userId: string, sessionId: string) {
    return new SignJWT({ sid: sessionId, tokenType: 'access' })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(userId)
      .setIssuer(this.config.auth.issuer)
      .setAudience(this.config.auth.audience)
      .setIssuedAt()
      .setExpirationTime(`${this.config.auth.accessTokenTtlSeconds}s`)
      .setJti(randomUUID())
      .sign(new TextEncoder().encode(this.config.auth.accessTokenSecret));
  }
  async verify(token: string): Promise<Omit<AuthenticatedUser, 'role'>> {
    try {
      if (token.length > 4096) throw new Error();
      const { payload } = await jwtVerify(
        token,
        new TextEncoder().encode(this.config.auth.accessTokenSecret),
        {
          algorithms: ['HS256'],
          issuer: this.config.auth.issuer,
          audience: this.config.auth.audience,
          typ: 'JWT',
          requiredClaims: ['sub', 'sid', 'iat', 'exp', 'jti', 'tokenType'],
        },
      );
      const claims = z
        .object({
          sub: z.uuid(),
          sid: z.uuid(),
          iat: z.number().int().nonnegative(),
          exp: z.number().int(),
          jti: z.uuid(),
          tokenType: z.literal('access'),
        })
        .parse(payload);
      if (
        claims.iat > Math.floor(Date.now() / 1000) + 60 ||
        claims.exp <= claims.iat
      )
        throw new Error();
      return { userId: claims.sub, sessionId: claims.sid };
    } catch {
      throw new UnauthorizedException('A valid access token is required.');
    }
  }
}
