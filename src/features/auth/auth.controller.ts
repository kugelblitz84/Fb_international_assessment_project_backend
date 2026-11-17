import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { Public } from '../../core/auth/decorators/public.decorator';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import type {
  AuthenticatedUser,
  AuthTokenPair,
  PublicUser,
} from '../../core/auth/auth.types';
import { ZodValidationPipe } from '../../core/validator/zod-validation.pipe';
import { AuthCookieService } from '../../core/auth/services/auth-cookie.service';
import { RateLimitService } from '../../core/auth/services/rate-limit.service';
import { RegisterService } from './register/register.service';
import { LoginService } from './login/login.service';
import { UserRepository } from './data/user.repository';
const profile = z.object({
  name: z.string().trim().min(1).max(160),
  email: z.email().trim().toLowerCase().max(320),
});
const login = z
  .object({
    email: z.string().trim().toLowerCase().max(320).pipe(z.email()),
    password: z.string().min(1).max(256),
  })
  .strict();
const register = profile
  .extend({ email: login.shape.email, password: z.string().min(10).max(256) })
  .strict();
const update = z
  .object({
    name: profile.shape.name.optional(),
    email: login.shape.email.optional(),
  })
  .strict()
  .refine((x) => Object.keys(x).length > 0, 'Supply name or email.');

@Controller({ version: '1' })
export class FeatureAuthController {
  constructor(
    private readonly registration: RegisterService,
    private readonly loginService: LoginService,
    private readonly users: UserRepository,
    private readonly cookies: AuthCookieService,
    private readonly limits: RateLimitService,
  ) {}
  private prepare(request: Request) {
    this.cookies.assertAllowedOrigin(request);
    this.limits.enforce('credentials', request.ip ?? 'unknown');
    return { ipAddress: request.ip, userAgent: request.get('user-agent') };
  }
  private response(
    response: Response,
    result: { user: PublicUser; tokens: AuthTokenPair },
  ) {
    this.cookies.setRefreshToken(
      response,
      result.tokens.refreshToken,
      result.tokens.refreshTokenExpiresAt,
    );
    response.setHeader('Cache-Control', 'no-store');
    return {
      user: result.user,
      accessToken: result.tokens.accessToken,
      csrfToken: this.cookies.issueCsrfToken(result.tokens.sessionId),
    };
  }
  @Public()
  @Post('auth/register')
  async register(
    @Body(new ZodValidationPipe(register)) input: z.infer<typeof register>,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.response(
      response,
      await this.registration.execute(input, this.prepare(request)),
    );
  }
  @Public()
  @Post('auth/login')
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(login)) input: z.infer<typeof login>,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.response(
      response,
      await this.loginService.execute(input, this.prepare(request)),
    );
  }
  @Get('auth/me')
  async me(
    @CurrentUser() auth: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return { user: await this.users.get(auth.userId) };
  }
  @Patch('users/me')
  async update(
    @CurrentUser() auth: AuthenticatedUser,
    @Body(new ZodValidationPipe(update)) input: z.infer<typeof update>,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return { user: await this.users.update(auth.userId, input) };
  }
}
