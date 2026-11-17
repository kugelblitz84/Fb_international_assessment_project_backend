import {
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from './decorators/public.decorator';
import { AuthCookieService } from './services/auth-cookie.service';
import { SessionService } from './services/session.service';
import { RateLimitService } from './services/rate-limit.service';

@Public()
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly sessions: SessionService,
    private readonly cookies: AuthCookieService,
    private readonly limits: RateLimitService,
  ) {}
  @Get('csrf')
  csrf(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.cookies.assertAllowedOrigin(request);
    response.setHeader('Cache-Control', 'no-store');
    const token = this.cookies.readRefreshToken(request);
    if (!token)
      throw new UnauthorizedException('A refresh cookie is required.');
    return {
      csrfToken: this.cookies.issueCsrfToken(
        this.sessions.sessionIdFromRefreshToken(token),
      ),
    };
  }
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    this.limits.enforce('refresh', request.ip ?? 'unknown', 60);
    this.cookies.assertAllowedOrigin(request);
    try {
      const token = this.cookies.readRefreshToken(request);
      if (!token)
        throw new UnauthorizedException('A refresh cookie is required.');
      this.cookies.assertCsrfToken(
        request,
        this.sessions.sessionIdFromRefreshToken(token),
      );
      const tokens = await this.sessions.rotate(token, {
        ipAddress: request.ip,
        userAgent: request.get('user-agent'),
      });
      this.cookies.setRefreshToken(
        response,
        tokens.refreshToken,
        tokens.refreshTokenExpiresAt,
      );
      return {
        accessToken: tokens.accessToken,
        csrfToken: this.cookies.issueCsrfToken(tokens.sessionId),
      };
    } catch (error) {
      if (error instanceof UnauthorizedException)
        this.cookies.clearRefreshToken(response);
      throw error;
    }
  }
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.cookies.assertAllowedOrigin(request);
    const token = this.cookies.readRefreshToken(request);
    try {
      if (token) {
        this.cookies.assertCsrfToken(
          request,
          this.sessions.sessionIdFromRefreshToken(token),
        );
        await this.sessions.revokeByRefreshToken(token);
      }
    } catch (error) {
      if (!(error instanceof UnauthorizedException)) throw error;
    }
    this.cookies.clearRefreshToken(response);
    response.setHeader('Cache-Control', 'no-store');
  }
}
