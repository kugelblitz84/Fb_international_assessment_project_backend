import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from '../database/prisma.module';
import { AuthController } from './auth.controller';
import { RolesGuard } from './guards/roles.guard';
import { AccessTokenGuard } from './guards/access-token.guard';
import { AccessTokenService } from './services/access-token.service';
import { AuthCookieService } from './services/auth-cookie.service';
import { SessionService } from './services/session.service';
import { RateLimitService } from './services/rate-limit.service';
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [
    AccessTokenService,
    AuthCookieService,
    SessionService,
    RateLimitService,
    { provide: APP_GUARD, useClass: AccessTokenGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [
    AccessTokenService,
    AuthCookieService,
    SessionService,
    RateLimitService,
  ],
})
export class AuthModule {}
