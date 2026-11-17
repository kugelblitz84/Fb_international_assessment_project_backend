import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { APP_CONFIG } from '../../config/app-config';
import type { AppConfig } from '../../config/app-config';
import type {
  AuthenticatedUser,
  AuthTokenPair,
  SessionMetadata,
} from '../auth.types';
import { AccessTokenService } from './access-token.service';

class RotationConflict extends Error {}
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessTokenService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}
  digest(token: string) {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }
  sessionIdFromRefreshToken(token: string) {
    const match =
      /^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.[A-Za-z0-9_-]{43}$/i.exec(
        token,
      );
    if (!match) throw new UnauthorizedException('Invalid refresh token.');
    return match[1];
  }
  private metadata(m: SessionMetadata) {
    return {
      ipAddress: m.ipAddress?.slice(0, 45),
      userAgent: m.userAgent?.slice(0, 512),
    };
  }
  async create(
    userId: string,
    metadata: SessionMetadata = {},
  ): Promise<AuthTokenPair> {
    const sessionId = randomUUID();
    const refreshToken = `${sessionId}.${randomBytes(32).toString('base64url')}`;
    const digest = this.digest(refreshToken);
    const expiresAt = new Date(
      Date.now() + this.config.auth.refreshTokenTtlSeconds * 1000,
    );
    const accessToken = await this.access.generate(userId, sessionId);
    await this.prisma.authSession.create({
      data: {
        id: sessionId,
        userId,
        refreshTokenDigest: digest,
        expiresAt,
        ...this.metadata(metadata),
        refreshTokens: { create: { digest } },
      },
    });
    return {
      sessionId,
      accessToken,
      refreshToken,
      refreshTokenExpiresAt: expiresAt,
    };
  }
  async rotate(
    refreshToken: string,
    metadata: SessionMetadata = {},
  ): Promise<AuthTokenPair> {
    const sessionId = this.sessionIdFromRefreshToken(refreshToken);
    const digest = this.digest(refreshToken);
    const token = await this.prisma.authRefreshToken.findUnique({
      where: { digest },
      include: {
        session: { include: { user: { select: { id: true, status: true } } } },
      },
    });
    if (!token || token.sessionId !== sessionId)
      throw new UnauthorizedException('Invalid refresh token.');
    if (token.usedAt) {
      await this.revoke(sessionId);
      throw new UnauthorizedException('Invalid refresh token.');
    }
    const session = token.session;
    if (
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.user.status !== 'ACTIVE' ||
      session.refreshTokenDigest !== digest
    )
      throw new UnauthorizedException('Invalid refresh token.');
    const next = `${sessionId}.${randomBytes(32).toString('base64url')}`;
    const nextDigest = this.digest(next);
    const accessToken = await this.access.generate(session.userId, sessionId);
    try {
      await this.prisma.$transaction(async (tx) => {
        const now = new Date();
        const claimed = await tx.authRefreshToken.updateMany({
          where: { digest, sessionId, usedAt: null },
          data: { usedAt: now },
        });
        if (claimed.count !== 1) throw new RotationConflict();
        const changed = await tx.authSession.updateMany({
          where: {
            id: sessionId,
            refreshTokenDigest: digest,
            revokedAt: null,
            expiresAt: { gt: now },
            user: { status: 'ACTIVE' },
          },
          data: {
            refreshTokenDigest: nextDigest,
            rotatedAt: now,
            lastSeenAt: now,
            ...this.metadata(metadata),
          },
        });
        if (changed.count !== 1) throw new RotationConflict();
        await tx.authRefreshToken.create({
          data: { digest: nextDigest, sessionId },
        });
      });
    } catch (error) {
      if (!(error instanceof RotationConflict)) throw error;
      // Inspect committed history after rollback; unknown tokens never revoke sessions.
      const consumed = await this.prisma.authRefreshToken.findUnique({
        where: { digest },
        select: { usedAt: true },
      });
      if (consumed?.usedAt) await this.revoke(sessionId);
      throw new UnauthorizedException('Invalid refresh token.');
    }
    return {
      sessionId,
      accessToken,
      refreshToken: next,
      refreshTokenExpiresAt: session.expiresAt,
    };
  }
  async authenticateAccessToken(claims: AuthenticatedUser) {
    const session = await this.prisma.authSession.findFirst({
      where: {
        id: claims.sessionId,
        userId: claims.userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: { status: 'ACTIVE' },
      },
      select: { id: true },
    });
    if (!session) throw new UnauthorizedException('Inactive session.');
    return claims;
  }
  async revokeByRefreshToken(token: string) {
    const sessionId = this.sessionIdFromRefreshToken(token);
    const known = await this.prisma.authRefreshToken.findUnique({
      where: { digest: this.digest(token) },
      select: { sessionId: true },
    });
    if (known?.sessionId === sessionId) await this.revoke(sessionId);
  }
  async revoke(id: string) {
    await this.prisma.authSession.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  async revokeForUser(userId: string) {
    await this.prisma.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
